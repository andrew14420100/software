// Media ingest pipeline (ffmpeg): probe → HLS fMP4 ladder (H.264 SDR up to 2160p,
// optional HEVC Main10 HDR10/PQ) → WebVTT subtitles → poster/backdrop → storyboard.
// Runs as a sequential job queue (jobs table) inside the server or from the CLI.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { db, MEDIA_DIR } from "./db.ts";

type Probe = { duration: number; width: number; height: number; fps: number; transfer: string; hasAudio: boolean; subs: { index: number; lang: string; title: string }[] };

export function probe(source: string): Probe {
  const r = spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", source], { encoding: "utf8", maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error("ffprobe: " + r.stderr.slice(0, 400));
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  if (!v) throw new Error("nessuna traccia video");
  const [n, d] = String(v.avg_frame_rate || v.r_frame_rate || "24/1").split("/").map(Number);
  return {
    duration: Number(j.format.duration || v.duration || 0), width: v.width, height: v.height, fps: d ? n / d : 24,
    transfer: v.color_transfer || "", hasAudio: j.streams.some((s: { codec_type: string }) => s.codec_type === "audio"),
    subs: j.streams.filter((s: { codec_type: string; codec_name: string }) => s.codec_type === "subtitle" && ["subrip", "ass", "webvtt", "mov_text"].includes(s.codec_name))
      .map((s: { index: number; tags?: { language?: string; title?: string } }) => ({ index: s.index, lang: s.tags?.language || "und", title: s.tags?.title || "" })),
  };
}

// Width-based ladder: a 1920x818 scope film is "1080p" class even though it is 818 px tall.
const LADDER = [
  { name: "360p", w: 640, h: 360, vb: 900, crf: 26 },
  { name: "720p", w: 1280, h: 720, vb: 3000, crf: 23 },
  { name: "1080p", w: 1920, h: 1080, vb: 6000, crf: 22 },
  { name: "2160p", w: 3840, h: 2160, vb: 16000, crf: 22 },
];
/** Quality class of a frame size (1920x818 → 1080, 3840x1608 → 2160). */
export const classHeight = (w: number, h: number) => { const c = Math.max(h, Math.round((w * 9) / 16)); return c >= 2000 ? 2160 : c >= 1000 ? 1080 : c >= 700 ? 720 : c >= 540 ? 576 : 360; };
const even = (x: number) => Math.max(2, Math.round(x / 2) * 2);
const LANG_LABEL: Record<string, string> = { ita: "Italiano", it: "Italiano", eng: "English", en: "English", fre: "Français", fra: "Français", ger: "Deutsch", deu: "Deutsch", spa: "Español", es: "Español", und: "Sottotitoli" };

function run(args: string[], durationS: number, onProgress: (f: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-progress", "pipe:1", "-loglevel", "error", ...args]);
    let err = "";
    p.stdout.on("data", (b: Buffer) => { const m = /out_time_us=(\d+)/.exec(b.toString()); if (m && durationS > 0) onProgress(Math.min(1, Number(m[1]) / 1e6 / durationS)); });
    p.stderr.on("data", (b: Buffer) => { err += b.toString(); if (err.length > 8000) err = err.slice(-8000); });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg: " + err.trim().slice(-600)))));
  });
}

function input(m: { source: string; clip_start: number; clip_seconds: number }) {
  return [...(m.clip_start ? ["-ss", String(m.clip_start)] : []), "-i", m.source, ...(m.clip_seconds ? ["-t", String(m.clip_seconds)] : [])];
}

/** SRT/ASS/etc → WebVTT (+ HLS subtitle playlist), with optional time window shift. */
function writeSubtitle(srcArgs: string[], outVtt: string, duration: number) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...srcArgs, "-f", "webvtt", outVtt], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("subtitle: " + r.stderr.slice(-300));
  fs.writeFileSync(outVtt.replace(/\.vtt$/, ".m3u8"), `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:${Math.ceil(duration)}\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:${duration.toFixed(3)},\n${path.basename(outVtt)}\n#EXT-X-ENDLIST\n`);
}

export async function processMedia(mediaId: number, log: (s: string) => void = () => {}) {
  const d = db();
  const m = d.prepare("SELECT * FROM media WHERE id = ?").get(mediaId) as { id: number; source: string; clip_start: number; clip_seconds: number; make_hdr: number; extra_subs?: string };
  const out = path.join(MEDIA_DIR, String(mediaId));
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  d.prepare("UPDATE media SET status = 'processing', progress = 0, error = NULL WHERE id = ?").run(mediaId);
  d.prepare("DELETE FROM renditions WHERE media_id = ?").run(mediaId);
  d.prepare("DELETE FROM subtitles WHERE media_id = ?").run(mediaId);
  const info = probe(m.source);
  const dur = m.clip_seconds ? Math.min(m.clip_seconds, info.duration - m.clip_start) : info.duration - m.clip_start;
  const fps = Math.min(30, Math.round(info.fps)) || 24;
  const srcIsHdr = /smpte2084|arib-std-b67/.test(info.transfer);
  const rungs = LADDER.filter((r) => r.w <= info.width + 16 || r.name === "360p").map((r) => ({ ...r, w: Math.min(r.w, info.width) }));
  const top = rungs[rungs.length - 1];
  if (info.width > top.w * 1.1) { // source sits between two rungs: add a native-resolution rung
    const nh = even(info.height);
    rungs.push({ name: `${nh}p`, w: even(info.width), h: nh, vb: Math.round((top.vb * info.width) / top.w), crf: 22 });
  }
  const variants = [...rungs.map((r) => ({ ...r, hdr: false }))];
  if (m.make_hdr || srcIsHdr) { const hw = info.width >= 3800 ? 3840 : Math.min(1920, info.width); variants.push({ name: `${hw >= 3840 ? "2160p" : "1080p"}-hdr10`, w: hw, h: 0, vb: hw >= 3840 ? 14000 : 6000, crf: 22, hdr: true }); }
  const total = variants.length + 2;
  let step = 0;
  const prog = (f: number) => d.prepare("UPDATE media SET progress = ? WHERE id = ?").run(Math.round(((step + f) / total) * 1000) / 10, mediaId);
  const gop = String(fps * 4);

  for (const v of variants) {
    const w = even(Math.min(v.w, info.width));
    const h = even((info.height * w) / info.width);
    const dir = path.join(out, v.name); fs.mkdirSync(dir);
    log(`encode ${v.name} ${w}x${h}${v.hdr ? " HDR10" : ""}`);
    const hls = ["-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod", "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4", "-hls_segment_filename", path.join(dir, "seg_%04d.m4s"), path.join(dir, "index.m3u8")];
    const audio = info.hasAudio ? ["-map", "0:a:0", "-c:a", "aac", "-b:a", "160k", "-ac", "2", "-ar", "48000"] : [];
    let video: string[]; let codecs: string;
    if (v.hdr) {
      // HDR10: HEVC Main10, BT.2020, PQ transfer + static metadata (SMPTE ST 2086 / CTA-861.3).
      // SDR sources are mapped into the PQ container (no HDR grading is invented: SDR white = 203 nits, BT.2408).
      const vf = srcIsHdr
        ? `scale=${w}:${h}:flags=lanczos,format=yuv420p10le`
        : `setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv,zscale=w=${w}:h=${h}:filter=lanczos:t=linear:npl=203,format=gbrpf32le,zscale=p=bt2020:t=smpte2084:m=bt2020nc:r=tv,format=yuv420p10le`;
      video = ["-map", "0:v:0", "-vf", vf + `,fps=${fps}`, "-c:v", "libx265", "-preset", "faster", "-crf", String(v.crf), "-tag:v", "hvc1",
        "-x265-params", `log-level=error:keyint=${gop}:min-keyint=${gop}:no-scenecut=1:hdr10=1:hdr10-opt=1:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:range=limited:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400`,
        "-pix_fmt", "yuv420p10le", "-color_primaries", "bt2020", "-color_trc", "smpte2084", "-colorspace", "bt2020nc", "-maxrate", v.vb + "k", "-bufsize", v.vb * 2 + "k"];
      codecs = `hvc1.2.4.L${w >= 3800 ? 153 : 123}.B0${info.hasAudio ? ",mp4a.40.2" : ""}`;
    } else {
      const level = w >= 3800 ? "5.1" : w >= 1900 ? "4.1" : "3.1";
      video = ["-map", "0:v:0", "-vf", `scale=${w}:${h}:flags=lanczos,fps=${fps},format=yuv420p`, "-c:v", "libx264", "-preset", w >= 3800 ? "veryfast" : "faster",
        "-profile:v", "high", "-level", level, "-crf", String(v.crf), "-maxrate", v.vb + "k", "-bufsize", v.vb * 2 + "k",
        "-g", gop, "-keyint_min", gop, "-sc_threshold", "0", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"];
      codecs = `avc1.6400${w >= 3800 ? "33" : w >= 1900 ? "29" : "1f"}${info.hasAudio ? ",mp4a.40.2" : ""}`;
    }
    await run([...input(m), ...video, ...audio, ...hls], dur, prog);
    const bytes = fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
    const bandwidth = Math.round(((bytes * 8) / dur) * 1.25);
    d.prepare("INSERT INTO renditions (media_id, name, width, height, bandwidth, codecs, video_range, frame_rate) VALUES (?,?,?,?,?,?,?,?)")
      .run(mediaId, v.name, w, h, bandwidth, codecs, v.hdr ? "PQ" : "SDR", fps);
    step++;
  }

  // subtitles: embedded tracks + sidecar files listed in media.source + ".subs.json"
  const subDir = path.join(out, "subs"); fs.mkdirSync(subDir);
  const shift = m.clip_start ? ["-ss", String(m.clip_start)] : [];
  const lim = m.clip_seconds ? ["-t", String(m.clip_seconds)] : [];
  const sidecar = m.source + ".subs.json";
  const subsList: { args: string[]; lang: string; label: string }[] = info.subs.map((s) => ({ args: [...shift, "-i", m.source, ...lim, "-map", `0:${s.index}`], lang: s.lang, label: s.title || LANG_LABEL[s.lang] || s.lang }));
  if (fs.existsSync(sidecar)) for (const s of JSON.parse(fs.readFileSync(sidecar, "utf8")) as { file: string; lang: string; label: string }[]) subsList.push({ args: [...shift, "-i", s.file, ...lim], lang: s.lang, label: s.label });
  const seen = new Set<string>();
  for (const s of subsList) {
    const key = s.lang + s.label; if (seen.has(key)) continue; seen.add(key);
    const id = Number(d.prepare("INSERT INTO subtitles (media_id, lang, label, file) VALUES (?,?,?,?)").run(mediaId, s.lang, s.label, "").lastInsertRowid);
    try { writeSubtitle(s.args, path.join(subDir, `${id}.vtt`), dur); d.prepare("UPDATE subtitles SET file = ? WHERE id = ?").run(`subs/${id}.vtt`, id); }
    catch (e) { log(String(e)); d.prepare("DELETE FROM subtitles WHERE id = ?").run(id); }
  }
  step++; prog(0);

  // artwork: poster frame (16:9) + storyboard sprite (10x10 tiles, 1 frame every N s) + WebVTT index
  log("artwork + storyboard");
  const at = Math.max(1, dur * 0.3);
  await run([...(m.clip_start || at ? ["-ss", String(m.clip_start + at)] : []), "-i", m.source, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "3", path.join(out, "backdrop.jpg")], 1, () => {});
  await run(["-i", path.join(out, "backdrop.jpg"), "-vf", "scale=480:-2", "-q:v", "4", path.join(out, "thumb.jpg")], 1, () => {});
  const every = Math.max(2, Math.ceil(dur / 100));
  const tiles = Math.ceil(dur / every);
  const cols = 10, rows = Math.ceil(tiles / cols);
  await run([...input(m), "-vf", `fps=1/${every},scale=192:-2,tile=${cols}x${rows}`, "-frames:v", "1", "-q:v", "5", path.join(out, "storyboard.jpg")], dur, (f) => prog(f));
  const tileH = Math.round((192 * info.height) / info.width / 2) * 2;
  const ts = (s: number) => new Date(s * 1000).toISOString().slice(11, 23);
  const cues = ["WEBVTT", ""];
  for (let i = 0; i < tiles; i++) cues.push(`${ts(i * every)} --> ${ts(Math.min(dur, (i + 1) * every))}`, `storyboard.jpg#xywh=${(i % cols) * 192},${Math.floor(i / cols) * tileH},192,${tileH}`, "");
  fs.writeFileSync(path.join(out, "storyboard.vtt"), cues.join("\n"));
  step++;

  const topClass = Math.max(...variants.map((v) => classHeight(Math.min(v.w, info.width), 0)));
  d.prepare("UPDATE media SET status = 'ready', progress = 100, duration = ?, max_height = ?, has_hdr = ? WHERE id = ?")
    .run(Math.round(dur * 1000) / 1000, topClass, variants.some((v) => v.hdr) ? 1 : 0, mediaId);
  log(`ready: ${variants.length} renditions, ${seen.size} subtitles, ${dur.toFixed(1)}s`);
}

export function enqueue(mediaId: number) {
  db().prepare("UPDATE media SET status = 'pending', progress = 0 WHERE id = ?").run(mediaId);
  return Number(db().prepare("INSERT INTO jobs (media_id) VALUES (?)").run(mediaId).lastInsertRowid);
}

export function createMedia(o: { source: string; clipStart?: number; clipSeconds?: number; hdr?: boolean; intro?: [number, number] | null; credits?: number | null }) {
  const r = db().prepare("INSERT INTO media (source, clip_start, clip_seconds, make_hdr, intro_start, intro_end, credits_start) VALUES (?,?,?,?,?,?,?)")
    .run(o.source, o.clipStart || 0, o.clipSeconds || 0, o.hdr ? 1 : 0, o.intro?.[0] ?? null, o.intro?.[1] ?? null, o.credits ?? null);
  return Number(r.lastInsertRowid);
}

/** Process queued jobs one at a time. Returns when the queue is empty. */
let running = false;
export async function drainQueue(log: (s: string) => void = (s) => console.log("[media]", s)) {
  if (running) return; running = true;
  const d = db();
  try {
    // recover jobs orphaned by a crashed process (no progress for 15 minutes)
    d.prepare("UPDATE jobs SET status = 'queued' WHERE status = 'running' AND updated_at < datetime('now','-15 minutes')").run();
    for (;;) {
      const job = d.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1").get() as { id: number; media_id: number } | undefined;
      if (!job) break;
      // atomic claim: several processes (server worker, CLI) may share the queue
      if (!d.prepare("UPDATE jobs SET status = 'running', updated_at = datetime('now') WHERE id = ? AND status = 'queued'").run(job.id).changes) continue;
      const lines: string[] = [];
      const jl = (s: string) => { lines.push(`${new Date().toISOString()} ${s}`); log(`#${job.media_id} ${s}`); d.prepare("UPDATE jobs SET step = ?, log = ?, updated_at = datetime('now') WHERE id = ?").run(s.slice(0, 200), lines.join("\n"), job.id); };
      try { await processMedia(job.media_id, jl); d.prepare("UPDATE jobs SET status = 'done' WHERE id = ?").run(job.id); }
      catch (e) {
        const msg = e instanceof Error ? e.message : String(e); jl("ERROR " + msg);
        d.prepare("UPDATE jobs SET status = 'error' WHERE id = ?").run(job.id);
        d.prepare("UPDATE media SET status = 'error', error = ? WHERE id = ?").run(msg.slice(0, 2000), job.media_id);
      }
    }
  } finally { running = false; }
}
