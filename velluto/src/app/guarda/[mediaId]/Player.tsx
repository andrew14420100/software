"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import type { Level } from "hls.js";
import { ArrowLeft, Captions, Gauge, Info, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, Settings, SkipForward, Volume2, VolumeX } from "lucide-react";
import { api, fmtTime } from "@/components/api";

type Ep = { id: number; season: number; number: number; name: string; media_id: number | null };
type PlayInfo = {
  playbackId: string; src: string; storyboard: string; duration: number; resume: number; intro: { start: number; end: number } | null; creditsStart: number | null;
  plan: { name: string; maxHeight: number; hdr: boolean }; delivered: { maxHeight: number; hdr: boolean };
  title: { slug: string; name: string; type: string }; episode: (Ep & { season: number }) | null; next: Ep | null; autoplayNext: boolean;
};
type Cue = { start: number; end: number; url: string; x: number; y: number; w: number; h: number };
type Track = { id: number; label: string };

function detectCaps() {
  const MS = (window as unknown as { ManagedMediaSource?: typeof MediaSource }).ManagedMediaSource || window.MediaSource;
  const hevc = !!MS?.isTypeSupported?.('video/mp4; codecs="hvc1.2.4.L153.B0"') || document.createElement("video").canPlayType('video/mp4; codecs="hvc1.2.4.L153.B0"') === "probably";
  const hdr = window.matchMedia("(dynamic-range: high)").matches;
  const px = Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1);
  const maxHeight = px >= 3000 ? 2160 : 1080; // 4K only on 4K-class screens; HD everywhere else
  return { hevc, hdr, maxHeight };
}

async function loadStoryboard(url: string): Promise<Cue[]> {
  const txt = await (await fetch(url)).text();
  const toS = (t: string) => { const [h, m, s] = t.split(":"); return Number(h) * 3600 + Number(m) * 60 + Number(s); };
  const base = new URL(url, location.href);
  const cues: Cue[] = [];
  for (const block of txt.split(/\n\n+/)) {
    const m = /(\d\d:\d\d:\d\d\.\d+) --> (\d\d:\d\d:\d\d\.\d+)\n(.+)#xywh=(\d+),(\d+),(\d+),(\d+)/.exec(block);
    if (m) cues.push({ start: toS(m[1]), end: toS(m[2]), url: new URL(m[3], base).href, x: +m[4], y: +m[5], w: +m[6], h: +m[7] });
  }
  return cues;
}

export function Player({ mediaId }: { mediaId: number }) {
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const infoRef = useRef<PlayInfo | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTap = useRef<{ t: number; x: number }>({ t: 0, x: 0 });

  const [info, setInfo] = useState<PlayInfo | null>(null);
  const [error, setError] = useState<{ msg: string; status?: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [ui, setUi] = useState(true);
  const [menu, setMenu] = useState<null | "quality" | "speed" | "subs">(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1);
  const [current, setCurrent] = useState<Level | null>(null);
  const [rate, setRate] = useState(1);
  const [subs, setSubs] = useState<Track[]>([]);
  const [sub, setSub] = useState(-1);
  const [fs, setFs] = useState(false);
  const [stats, setStats] = useState(false);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [nextDismissed, setNextDismissed] = useState(false);
  const [resumedFrom, setResumedFrom] = useState(0);

  const pulse = (s: string) => { setFlash(s); setTimeout(() => setFlash((f) => (f === s ? null : f)), 700); };

  const saveProgress = useCallback((beacon = false, close = false) => {
    const v = video.current, i = infoRef.current;
    if (!v || !i || !v.duration || !isFinite(v.duration)) return;
    const data = JSON.stringify({ mediaId, position: v.currentTime, duration: v.duration, playbackId: i.playbackId, close });
    if (beacon && navigator.sendBeacon) navigator.sendBeacon("/api/progress", new Blob([data], { type: "text/plain" }));
    else fetch("/api/progress", { method: "POST", body: data, headers: { "content-type": "application/json" }, keepalive: true })
      .then((r) => r.json()).then((j) => { if (j.alive === false) { v.pause(); setError({ msg: "La sessione di riproduzione è stata chiusa: hai raggiunto il limite di schermi del tuo piano." }); } }).catch(() => {});
  }, [mediaId]);

  // ---- load + attach stream ----
  useEffect(() => {
    let cancelled = false;
    const v = video.current!;
    (async () => {
      let i: PlayInfo;
      // reuse this tab's playback session (reloads / next episode don't consume an extra screen)
      try { i = await api<PlayInfo>("/api/play", "POST", { mediaId, caps: detectCaps(), playbackId: sessionStorage.getItem("velluto-pb") }); }
      catch (e) { const err = e as Error & { status?: number }; if (err.status === 401) router.replace(`/accedi?next=/guarda/${mediaId}`); setError({ msg: err.message, status: err.status }); return; }
      if (cancelled) return;
      infoRef.current = i; setInfo(i); setDur(i.duration);
      sessionStorage.setItem("velluto-pb", i.playbackId);
      loadStoryboard(i.storyboard).then(setCues).catch(() => {});
      const start = i.resume > 0 ? i.resume : 0;
      setResumedFrom(start);
      const { default: HlsCtor } = await import("hls.js");
      if (HlsCtor.isSupported()) {
        const hls = new HlsCtor({ startPosition: start, capLevelToPlayerSize: false, abrEwmaDefaultEstimate: 5_000_000, testBandwidth: true, maxBufferLength: 30, backBufferLength: 60, enableWorker: true, videoPreference: i.delivered.hdr ? { preferHDR: true } : undefined });
        hlsRef.current = hls;
        hls.on(HlsCtor.Events.MANIFEST_PARSED, (_e, d) => { setLevels(d.levels); v.play().catch(() => setPlaying(false)); });
        hls.on(HlsCtor.Events.LEVEL_SWITCHED, (_e, d) => setCurrent(hls.levels[d.level] || null));
        hls.on(HlsCtor.Events.SUBTITLE_TRACKS_UPDATED, (_e, d) => setSubs(d.subtitleTracks.map((t) => ({ id: t.id, label: t.name }))));
        hls.on(HlsCtor.Events.ERROR, (_e, d) => {
          if (!d.fatal) return;
          if (d.type === HlsCtor.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else if (d.type === HlsCtor.ErrorTypes.NETWORK_ERROR) setTimeout(() => hls.startLoad(), 1500);
          else setError({ msg: "Impossibile riprodurre il contenuto su questo dispositivo." });
        });
        hls.subtitleDisplay = true; hls.subtitleTrack = -1;
        hls.loadSource(i.src); hls.attachMedia(v);
      } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = i.src;
        v.addEventListener("loadedmetadata", () => { if (start) v.currentTime = start; v.play().catch(() => {}); setSubs([...v.textTracks].map((t, k) => ({ id: k, label: t.label }))); }, { once: true });
      } else setError({ msg: "Il browser non supporta lo streaming HLS." });
    })();
    const iv = setInterval(() => { if (!video.current?.paused) saveProgress(); }, 10000);
    const onHide = () => { if (document.visibilityState === "hidden") saveProgress(true); };
    const onLeave = () => saveProgress(true, true); // tab closed or reloaded: free the screen immediately
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);
    return () => {
      cancelled = true; clearInterval(iv); document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", onLeave);
      saveProgress(true); // in-app navigation keeps the session for reuse (next episode); it expires after 90 s idle
      hlsRef.current?.destroy(); hlsRef.current = null;
    };
  }, [mediaId, router, saveProgress]);

  // ---- video events ----
  useEffect(() => {
    const v = video.current!;
    const on: Record<string, () => void> = {
      play: () => setPlaying(true), pause: () => { setPlaying(false); saveProgress(); }, waiting: () => setWaiting(true), playing: () => setWaiting(false), canplay: () => setWaiting(false),
      timeupdate: () => { setTime(v.currentTime); if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1)); },
      durationchange: () => { if (isFinite(v.duration)) setDur(v.duration); }, volumechange: () => { setVolume(v.volume); setMuted(v.muted); },
      ratechange: () => setRate(v.playbackRate), ended: () => { saveProgress(); setPlaying(false); },
    };
    for (const [k, f] of Object.entries(on)) v.addEventListener(k, f);
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => { for (const [k, f] of Object.entries(on)) v.removeEventListener(k, f); document.removeEventListener("fullscreenchange", onFs); };
  }, [saveProgress]);

  // ---- up next ----
  const next = info?.next && info.next.media_id ? info.next : null;
  const nextZone = !!next && !nextDismissed && dur > 0 && (time >= (info?.creditsStart ?? dur - 10) || time >= dur - 0.5);
  const goNext = useCallback(() => { if (next) { saveProgress(); router.push(`/guarda/${next.media_id}`); } }, [next, router, saveProgress]);
  useEffect(() => {
    if (!nextZone || !info?.autoplayNext) { setCountdown(null); return; }
    setCountdown((c) => (c === null ? 10 : c));
    const t = setInterval(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearInterval(t);
  }, [nextZone, info?.autoplayNext]);
  useEffect(() => { if (countdown !== null && countdown <= 0) goNext(); }, [countdown, goNext]);

  // ---- controls ----
  const v = () => video.current!;
  const toggle = useCallback(() => { const el = video.current!; if (el.paused) el.play(); else el.pause(); }, []);
  const seek = useCallback((s: number) => { const el = video.current!; el.currentTime = Math.max(0, Math.min((el.duration || 0) - 0.2, s)); }, []);
  const skip = useCallback((d: number) => { seek(video.current!.currentTime + d); pulse(d > 0 ? `+${d}s` : `${d}s`); }, [seek]);
  const toggleFs = useCallback(() => { if (document.fullscreenElement) document.exitFullscreen(); else wrap.current?.requestFullscreen?.().catch(() => {}); }, []);
  const chooseSub = useCallback((id: number) => {
    setSub(id); setMenu(null);
    if (hlsRef.current) hlsRef.current.subtitleTrack = id;
    else [...video.current!.textTracks].forEach((t, k) => (t.mode = k === id ? "showing" : "disabled"));
  }, []);
  const chooseLevel = (l: number) => { setLevel(l); setMenu(null); if (hlsRef.current) hlsRef.current.currentLevel = l; };
  const menuOpen = useRef(false);
  useEffect(() => { menuOpen.current = menu !== null; }, [menu]);
  // auto-hide controls while playing, but never while a settings menu is open
  const showUi = useCallback(() => { setUi(true); clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => { if (!video.current?.paused && !menuOpen.current) setUi(false); }, 3000); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      const map: Record<string, () => void> = {
        " ": toggle, k: toggle, arrowleft: () => skip(-10), j: () => skip(-10), arrowright: () => skip(10), l: () => skip(10),
        arrowup: () => { v().volume = Math.min(1, v().volume + 0.1); pulse(`Volume ${Math.round(v().volume * 100)}%`); },
        arrowdown: () => { v().volume = Math.max(0, v().volume - 0.1); pulse(`Volume ${Math.round(v().volume * 100)}%`); },
        m: () => { v().muted = !v().muted; }, f: toggleFs, i: () => setStats((s) => !s), n: goNext,
        c: () => { if (subs.length) chooseSub(sub === -1 ? subs[0].id : -1); },
      };
      if (map[k]) { e.preventDefault(); map[k](); showUi(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, skip, toggleFs, goNext, subs, sub, chooseSub, showUi]);

  const onTap = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") { toggle(); return; }
    const now = Date.now(); const x = e.clientX / window.innerWidth;
    if (now - lastTap.current.t < 300) { skip(x < 0.4 ? -10 : x > 0.6 ? 10 : 0); lastTap.current = { t: 0, x }; return; }
    lastTap.current = { t: now, x };
    setUi((u) => !u);
  };

  // quality class from width, so 1920x818 scope frames read "1080p"
  const label = (l: Level) => `${l.width >= 3800 ? "4K" : l.width >= 1900 ? "1080p" : l.width >= 1260 ? "720p" : l.width >= 1000 ? "576p" : "360p"}${l.videoRange && l.videoRange !== "SDR" ? " HDR10" : ""}`;
  const preview = hover && cues.find((c) => hover.t >= c.start && hover.t < c.end);
  const inIntro = info?.intro && time >= info.intro.start && time < info.intro.end - 1;
  const backHref = info ? `/titolo/${info.title.slug}` : "/";

  if (error) return (
    <div className="grid min-h-dvh place-items-center bg-ink p-6 text-center">
      <div className="card max-w-md p-8">
        <p className="font-serif text-2xl">Riproduzione non disponibile</p>
        <p className="mt-3 text-mist" data-testid="player-error">{error.msg}</p>
        <div className="mt-6 flex justify-center gap-3">
          {error.status === 402 && <Link href="/abbonamenti" className="btn btn-gold">Scegli un piano</Link>}
          <Link href={backHref} className="btn btn-ghost">Torna indietro</Link>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={wrap} className={`fixed inset-0 z-50 select-none bg-black ${ui ? "" : "cursor-none"}`} onPointerMove={showUi} data-testid="player">
      <video ref={video} className="h-full w-full" playsInline onPointerUp={onTap} aria-label={info?.title.name} />

      {waiting && !error && <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="h-14 w-14 animate-spin rounded-full border-4 border-cream/20 border-t-gold" aria-label="Caricamento" /></div>}
      {flash && <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink/70 px-5 py-2 text-lg animate-fade-up">{flash}</div>}

      {/* top bar */}
      <div className={`absolute inset-x-0 top-0 flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))] transition-opacity duration-300 md:p-6 ${ui ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <Link href={backHref} aria-label="Torna alla scheda" className="grid h-10 w-10 place-items-center rounded-full hover:bg-cream/10"><ArrowLeft /></Link>
        <div className="min-w-0">
          <p className="truncate font-serif text-xl">{info?.title.name}</p>
          {info?.episode && <p className="truncate text-sm text-mist">S{info.episode.season}:E{info.episode.number} · {info.episode.name}</p>}
        </div>
        <span className="ml-auto hidden items-center gap-2 text-xs text-mist sm:flex">
          {current && <span className={`badge ${current.width >= 3800 ? "badge-4k" : "bg-cream/15 text-cream"}`}>{label(current)}</span>}
          {info && <span>Piano {info.plan.name}</span>}
        </span>
      </div>

      {resumedFrom > 0 && time > 0 && time < resumedFrom + 6 && (
        <div className="absolute left-4 top-24 flex items-center gap-3 rounded-full bg-ink/80 px-4 py-2 text-sm animate-fade-up md:left-6">
          Ripreso da {fmtTime(resumedFrom)}<button className="text-gold hover:underline" onClick={() => { seek(0); setResumedFrom(0); }}>Ricomincia</button>
        </div>
      )}

      {inIntro && <button onClick={() => seek(info!.intro!.end)} className="btn btn-ghost absolute bottom-32 right-6 z-20 ring-1 ring-cream/40" data-testid="skip-intro">Salta intro<SkipForward className="h-4 w-4" /></button>}

      {nextZone && next && (
        <div className="card absolute bottom-32 right-4 z-20 w-[min(22rem,calc(100vw-2rem))] p-4 animate-fade-up md:right-6" data-testid="up-next">
          <p className="text-xs uppercase tracking-widest text-gold">Prossimo episodio</p>
          <p className="mt-1 font-medium">S{next.season}:E{next.number} · {next.name}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={goNext} className="btn btn-gold flex-1 !py-2">{countdown !== null ? `Tra ${Math.max(0, countdown)}s` : "Guarda ora"}</button>
            <button onClick={() => { setNextDismissed(true); setCountdown(null); }} className="btn btn-ghost !py-2">Annulla</button>
          </div>
          {countdown !== null && <div className="mt-3 h-1 overflow-hidden rounded bg-cream/20"><div className="h-full bg-gold transition-all duration-1000 ease-linear" style={{ width: `${(Math.max(0, countdown) / 10) * 100}%` }} /></div>}
        </div>
      )}

      {stats && current && (
        <div className="absolute left-4 top-24 rounded-xl bg-black/80 p-3 font-mono text-[11px] leading-5 text-cream/90 md:left-6" data-testid="stats">
          <p>risoluzione {current.width}×{current.height} @ {current.frameRate || "?"}fps</p>
          <p>codec {current.videoCodec} {current.audioCodec}</p>
          <p>gamma dinamica {current.videoRange || "SDR"}</p>
          <p>bitrate {(current.bitrate / 1e6).toFixed(2)} Mbps · banda stimata {hlsRef.current ? (hlsRef.current.bandwidthEstimate / 1e6).toFixed(1) : "?"} Mbps</p>
          <p>buffer {(buffered - time).toFixed(1)}s · frame persi {video.current?.getVideoPlaybackQuality?.().droppedVideoFrames ?? 0}</p>
          <p>display HDR {typeof window !== "undefined" && window.matchMedia("(dynamic-range: high)").matches ? "sì" : "no"} · piano max {info?.plan.maxHeight}p{info?.plan.hdr ? " HDR" : ""}</p>
        </div>
      )}

      {/* bottom controls */}
      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-16 transition-opacity duration-300 md:px-6 ${ui ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <div className="group relative h-5 cursor-pointer" role="slider" aria-label="Posizione" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(time)} tabIndex={0}
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover({ x: e.clientX - r.left, t: ((e.clientX - r.left) / r.width) * dur }); }}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * dur); }}>
          <div className="absolute inset-x-0 top-2 h-1 rounded-full bg-cream/25 transition-all group-hover:top-1.5 group-hover:h-2">
            <div className="absolute inset-y-0 left-0 rounded-full bg-cream/40" style={{ width: `${dur ? (buffered / dur) * 100 : 0}%` }} />
            {info?.intro && dur > 0 && <div className="absolute inset-y-0 bg-mist/40" style={{ left: `${(info.intro.start / dur) * 100}%`, width: `${((info.intro.end - info.intro.start) / dur) * 100}%` }} />}
            <div className="absolute inset-y-0 left-0 rounded-full bg-gold" style={{ width: `${dur ? (time / dur) * 100 : 0}%` }} />
            <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold opacity-0 shadow transition group-hover:opacity-100" style={{ left: `${dur ? (time / dur) * 100 : 0}%` }} />
          </div>
          {hover && (
            <div className="pointer-events-none absolute bottom-6 -translate-x-1/2 text-center" style={{ left: hover.x }}>
              {preview && <div className="mb-1 overflow-hidden rounded-md ring-2 ring-cream/80" style={{ width: preview.w, height: preview.h, backgroundImage: `url(${preview.url})`, backgroundPosition: `-${preview.x}px -${preview.y}px` }} />}
              <span className="rounded bg-black/80 px-1.5 py-0.5 text-xs">{fmtTime(hover.t)}</span>
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center gap-1 md:gap-2">
          <Btn label={playing ? "Pausa" : "Riproduci"} onClick={toggle}>{playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}</Btn>
          <Btn label="Indietro 10 secondi" onClick={() => skip(-10)}><RotateCcw /></Btn>
          <Btn label="Avanti 10 secondi" onClick={() => skip(10)}><RotateCw /></Btn>
          <div className="group/vol hidden items-center sm:flex">
            <Btn label={muted ? "Riattiva audio" : "Disattiva audio"} onClick={() => { v().muted = !v().muted; }}>{muted || volume === 0 ? <VolumeX /> : <Volume2 />}</Btn>
            <input aria-label="Volume" type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => { v().volume = Number(e.target.value); v().muted = false; }} className="w-0 opacity-0 accent-[var(--color-gold)] transition-all group-hover/vol:w-24 group-hover/vol:opacity-100 focus:w-24 focus:opacity-100" />
          </div>
          <span className="ml-1 text-sm tabular-nums text-cream/90">{fmtTime(time)} <span className="text-mist">/ {fmtTime(dur)}</span></span>
          <div className="ml-auto flex items-center gap-1 md:gap-2">
            {next && <Btn label="Episodio successivo" onClick={goNext}><SkipForward /></Btn>}
            <Menu open={menu === "subs"} onToggle={() => setMenu(menu === "subs" ? null : "subs")} label="Sottotitoli" icon={<Captions className={sub >= 0 ? "text-gold" : ""} />} hidden={!subs.length}
              items={[{ k: -1, label: "Disattivati", active: sub === -1 }, ...subs.map((s) => ({ k: s.id, label: s.label, active: sub === s.id }))]} onPick={chooseSub} />
            <Menu open={menu === "speed"} onToggle={() => setMenu(menu === "speed" ? null : "speed")} label="Velocità" icon={<Gauge />}
              items={[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => ({ k: r, label: r === 1 ? "Normale" : `${r}×`, active: rate === r }))} onPick={(r) => { v().playbackRate = r; setMenu(null); }} />
            <Menu open={menu === "quality"} onToggle={() => setMenu(menu === "quality" ? null : "quality")} label="Qualità" icon={<Settings />} hidden={!levels.length}
              items={[{ k: -1, label: `Automatica${level === -1 && current ? ` (${label(current)})` : ""}`, active: level === -1 }, ...levels.map((l, k) => ({ k, label: label(l), active: level === k })).reverse()]} onPick={chooseLevel} />
            <Btn label="Statistiche" onClick={() => setStats((s) => !s)}><Info className={stats ? "text-gold" : ""} /></Btn>
            {typeof document !== "undefined" && "pictureInPictureEnabled" in document && <Btn label="Picture in picture" onClick={() => (document.pictureInPictureElement ? document.exitPictureInPicture() : v().requestPictureInPicture()).catch(() => {})}><PictureInPicture2 /></Btn>}
            <Btn label={fs ? "Esci da schermo intero" : "Schermo intero"} onClick={toggleFs}>{fs ? <Minimize /> : <Maximize />}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function Btn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="grid h-10 w-10 place-items-center rounded-full transition hover:bg-cream/15 [&>svg]:h-5 [&>svg]:w-5">{children}</button>;
}

function Menu<K extends number>({ open, onToggle, label, icon, items, onPick, hidden }: { open: boolean; onToggle: () => void; label: string; icon: React.ReactNode; items: { k: K; label: string; active: boolean }[]; onPick: (k: K) => void; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div className="relative">
      <Btn label={label} onClick={onToggle}>{icon}</Btn>
      {open && (
        <div role="menu" aria-label={label} className="card absolute bottom-12 right-0 max-h-72 w-48 overflow-auto p-1.5 text-sm shadow-2xl animate-fade-up">
          <p className="px-3 py-1.5 text-xs uppercase tracking-widest text-mist">{label}</p>
          {items.map((it) => (
            <button key={String(it.k)} role="menuitemradio" aria-checked={it.active} onClick={() => onPick(it.k)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-cream/10 ${it.active ? "text-gold" : ""}`}>
              {it.label}{it.active && <span aria-hidden>●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
