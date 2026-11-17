#!/usr/bin/env node
// wcl — WebClone Lab orchestrator.
// Pipeline: init → recon → capture(original) → [rebuild] → api → verify(capture clone + pixel diff + tests)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { DEVICES, chromiumPath, launch, newContext, settle, pageFacts, probeControls, slugForPath } from "../lib/browser.mjs";
import { generateBackend } from "../lib/backend-gen.mjs";
import { writeTests } from "../lib/test-gen.mjs";

const LAB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DITTO = path.join(LAB, "vendor/ditto/scripts");
const TEMPLATE = path.join(LAB, "template");
const PROJECTS = process.env.WEBCLONE_PROJECTS || path.join(os.homedir(), "webclone-projects");

// ---------------------------------------------------------------- utilities
const argv = process.argv.slice(2);
const cmd = argv.shift();
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) { const k = a.slice(2); const n = argv[i + 1]; if (n === undefined || n.startsWith("--")) flags[k] = true; else { flags[k] = n; i++; } }
  else pos.push(a);
}
const log = (...m) => console.error("[wcl]", ...m);
const die = (m) => { console.error(`[wcl] ERROR: ${m}`); process.exit(1); };
const readJSON = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d);
const writeJSON = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + "\n"); };
const deviceList = () => (flags.devices ? String(flags.devices).split(",") : Object.keys(DEVICES));

function projectDir(ref) {
  if (!ref) die("missing <project> (slug or path)");
  const p = fs.existsSync(ref) ? path.resolve(ref) : path.join(PROJECTS, ref);
  if (!fs.existsSync(path.join(p, "clone.config.json"))) die(`not a wcl project: ${p}`);
  return p;
}
const cfgOf = (p) => readJSON(path.join(p, "clone.config.json"));
const saveCfg = (p, c) => writeJSON(path.join(p, "clone.config.json"), c);

function run(bin, args, opts = {}) {
  log("$", bin, args.join(" "));
  const r = spawnSync(bin, args, { stdio: "inherit", ...opts });
  return r.status === 0;
}
const ditto = (script, args, cwd) => run(process.execPath, [path.join(DITTO, script), ...args], { cwd });

function isSkippable(u) {
  // never follow session-destroying or download links
  return /(log-?out|sign-?out|logoff|delete|unsubscribe)/i.test(u.pathname) || /\.(pdf|zip|dmg|exe|tar|gz|mp4|mp3|png|jpe?g|gif|webp|svg|ico)$/i.test(u.pathname);
}

// ---------------------------------------------------------------- commands
const commands = {
  "chromium-path": () => console.log(chromiumPath()),
  selftest: () => { process.exitCode = run("bash", [path.join(LAB, "selftest.sh")], { env: { ...process.env, WCL: fileURLToPath(import.meta.url) } }) ? 0 : 1; },

  async doctor() {
    const checks = [];
    const ok = (name, pass, info = "") => checks.push({ name, pass, info });
    const [maj, min] = process.versions.node.split(".").map(Number); ok("node >= 20.9", maj > 20 || (maj === 20 && min >= 9), process.versions.node);
    try { const b = await launch(); const p = await b.newPage(); await p.setContent("<h1>ok</h1>"); ok("chromium launch", (await p.textContent("h1")) === "ok", chromiumPath()); await b.close(); } catch (e) { ok("chromium launch", false, e.message); }
    ok("ditto scripts", fs.existsSync(path.join(DITTO, "recon-site.mjs")), DITTO);
    ok("wakaru (REA JS recovery)", fs.existsSync(path.join(LAB, "node_modules/@wakaru/cli-linux-x64/wakaru")));
    ok("next.js template", fs.existsSync(path.join(TEMPLATE, "node_modules/next/package.json")), TEMPLATE);
    const which = (b) => spawnSync("bash", ["-lc", `command -v ${b}`], { encoding: "utf8" }).stdout.trim();
    ok("rea cli", !!which("rea"), which("rea"));
    ok("playwright-mcp cli", !!which("playwright-mcp"), which("playwright-mcp"));
    const mcp = spawnSync("claude", ["mcp", "list"], { encoding: "utf8", timeout: 90000 }).stdout || "";
    ok("MCP rea connected", /rea:.*Connected/.test(mcp));
    ok("MCP playwright connected", /playwright:.*Connected/.test(mcp));
    ok("/clone-full-website command", fs.existsSync(path.join(os.homedir(), ".claude/commands/clone-full-website.md")));
    for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.info ? "  (" + c.info + ")" : ""}`);
    if (checks.some((c) => !c.pass)) process.exitCode = 1;
  },

  // wcl init <url> [--name slug] [--authorized "statement"] [--storage-state file]
  init() {
    const url = pos[0]; if (!url) die("usage: wcl init <url> --authorized \"<who/why>\"");
    const u = new URL(url);
    if (!flags.authorized) die("authorization statement required: --authorized \"I own / have written permission for <site>\"");
    const slug = flags.name || u.hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-");
    const dir = path.join(PROJECTS, slug);
    if (fs.existsSync(dir) && !flags.force) die(`${dir} exists (use --force to re-init config only)`);
    fs.mkdirSync(path.join(dir, "research"), { recursive: true });
    if (!fs.existsSync(path.join(dir, "app"))) {
      log("creating Next.js app from template (hard-linked node_modules)");
      fs.mkdirSync(path.join(dir, "app"));
      for (const e of fs.readdirSync(TEMPLATE)) {
        if ([".git", ".commit"].includes(e)) continue;
        const args = e === "node_modules" ? ["-al"] : ["-a"];
        if (spawnSync("cp", [...args, path.join(TEMPLATE, e), path.join(dir, "app", e)]).status !== 0) die("template copy failed");
      }
    }
    const cfg = {
      url: u.href, origin: u.origin, slug, createdAt: new Date().toISOString(),
      authorization: flags.authorized,
      storageState: flags["storage-state"] ? path.resolve(flags["storage-state"]) : null,
      crawl: { maxPages: Number(flags["max-pages"] || 30), maxDepth: Number(flags["max-depth"] || 3), delayMs: 300 },
      routes: [], devices: Object.keys(DEVICES),
      thresholds: { maxDiffRatio: Number(flags["max-diff"] || 0.01), maxStrictRatio: Number(flags["max-strict"] || 0.001) },
    };
    saveCfg(dir, cfg);
    fs.writeFileSync(path.join(dir, "AUTHORIZATION.md"), `# Authorization\n\nTarget: ${u.href}\nRecorded: ${cfg.createdAt}\nStatement: ${cfg.authorization}\n\nOnly content reachable with this authorization is analysed. No access control,\nCAPTCHA, paywall, rate limit or bot protection is bypassed.\n`);
    console.log(dir);
  },

  // wcl crawl <project>  — same-origin BFS (honours user-supplied storageState)
  async crawl() {
    const dir = projectDir(pos[0]); const cfg = cfgOf(dir);
    const browser = await launch(); const ctx = await newContext(browser, "desktop", cfg);
    const page = await ctx.newPage();
    const seen = new Map(); const queue = [{ url: cfg.url, depth: 0 }];
    const norm = (h) => { const x = new URL(h); x.hash = ""; return x.href; };
    while (queue.length && seen.size < cfg.crawl.maxPages) {
      const { url, depth } = queue.shift(); const key = norm(url);
      if (seen.has(key)) continue;
      let status = 0, links = [];
      try {
        const resp = await page.goto(key, { waitUntil: "load", timeout: 45000 });
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        status = resp ? resp.status() : 0;
        links = await page.$$eval("a[href]", (as) => as.map((a) => a.href));
      } catch (e) { status = -1; }
      const finalUrl = new URL(page.url());
      seen.set(key, { path: new URL(key).pathname + new URL(key).search, status, depth, redirectedTo: finalUrl.href !== key ? finalUrl.href : null });
      log(`${status} d${depth} ${key}`);
      if (depth < cfg.crawl.maxDepth) for (const l of links) {
        try { const n = new URL(l); if (n.origin === cfg.origin && /^https?:$/.test(n.protocol) && !isSkippable(n) && !seen.has(norm(n.href))) queue.push({ url: n.href, depth: depth + 1 }); } catch {}
      }
      await page.waitForTimeout(cfg.crawl.delayMs);
    }
    await browser.close();
    const pages = [...seen.values()];
    writeJSON(path.join(dir, "research/routes.json"), pages);
    cfg.routes = [...new Set(pages.filter((p) => p.status > 0 && p.status < 400 && !p.redirectedTo).map((p) => p.path))];
    saveCfg(dir, cfg);
    console.log(`${cfg.routes.length} routes:\n` + cfg.routes.join("\n"));
  },

  // wcl recon <project> — Ditto deep probes on the start URL (+ crawl)
  async recon() {
    const dir = projectDir(pos[0]); const cfg = cfgOf(dir); const R = path.join(dir, "research");
    if (cfg.storageState) log("NOTE: Ditto probes run without the session; authenticated pages are covered by wcl crawl/capture.");
    await commands.crawl();
    const u = cfg.url; const steps = [
      ["recon-site.mjs", ["--url", u, "--out", R, "--label", "original", "--widths", "1440,768,390"]],
      ["network-capture.mjs", ["--url", u, "--out", path.join(R, "network"), "--label", "original"]],
      ["interaction-probe.mjs", ["--url", u, "--out", path.join(R, "interactions"), "--label", "original"]],
      ["motion-probe.mjs", ["--url", u, "--out", R, "--label", "original", "--frames", "6"]],
      ["anim-inventory.mjs", ["--url", u, "--hover", "--out", path.join(R, "anim-inventory.json")]],
      ["sourcemap-hunt.mjs", ["--recon", path.join(R, "original-recon.json"), "--out", path.join(R, "sourcemaps")]],
      ["asset-harvest.mjs", ["--recon", path.join(R, "original-recon.json"), "--out", path.join(R, "assets"), "--manifest", path.join(R, "asset-manifest.json")]],
      ["dna-scaffold.mjs", ["--recon", path.join(R, "original-recon.json"), "--out", path.join(R, "design-dna.json")]],
    ];
    if (flags.mirror) steps.push(["mirror-site.mjs", ["--url", u, "--out", path.join(R, "mirror")]]);
    const results = steps.map(([s, a]) => ({ step: s, ok: ditto(s, a, R) }));
    writeJSON(path.join(R, "recon-status.json"), results);
    for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.step}`);
  },

  // wcl capture <project> --target original|clone [--base http://127.0.0.1:3000]
  async capture() {
    const dir = projectDir(pos[0]); const cfg = cfgOf(dir);
    const target = flags.target || "original";
    const base = target === "original" ? cfg.origin : String(flags.base || "http://127.0.0.1:3000").replace(/\/$/, "");
    if (!cfg.routes.length) cfg.routes = [new URL(cfg.url).pathname];
    const browser = await launch();
    const api = [];
    for (const dev of deviceList()) {
      const ctx = await newContext(browser, dev, target === "original" ? cfg : {});
      for (const route of cfg.routes) {
        const page = await ctx.newPage(); const errors = [];
        page.on("pageerror", (e) => errors.push(String(e.message)));
        page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
        if (target === "original" && dev === "desktop") page.on("response", async (r) => {
          const t = r.request().resourceType();
          if (!["fetch", "xhr"].includes(t)) return;
          const ct = r.headers()["content-type"] || ""; let body = null;
          try { const b = await r.body(); if (b.length < 1e6) body = /json/.test(ct) ? JSON.parse(b.toString()) : b.toString(); } catch {}
          api.push({ route, method: r.request().method(), url: r.url(), status: r.status(), contentType: ct, requestBody: r.request().postData() || null, body });
        });
        const slug = slugForPath(route);
        let status = 0;
        try { const resp = await settle(page, base + route); status = resp ? resp.status() : 0; } catch (e) { errors.push("navigation: " + e.message); }
        const shot = path.join(dir, "research/screens", target, dev, `${slug}.png`);
        fs.mkdirSync(path.dirname(shot), { recursive: true });
        await page.screenshot({ path: shot, fullPage: true, animations: "disabled", caret: "hide" }).catch((e) => errors.push("screenshot: " + e.message));
        const facts = await pageFacts(page).catch(() => null);
        if (facts && target === "original" && !flags["no-controls"]) facts.controls = await probeControls(page, base + route).catch(() => []);
        writeJSON(path.join(dir, "research/facts", target, dev, `${slug}.json`), { route, url: base + route, status, errors, facts });
        log(`${target} ${dev} ${route} -> ${status}${errors.length ? ` (${errors.length} errors)` : ""}`);
        await page.close();
      }
      await ctx.close();
    }
    await browser.close();
    if (target === "original") writeJSON(path.join(dir, "research/api-capture.json"), api);
  },

  // wcl diff <project> — strict pixel comparison original vs clone per device/route
  diff() {
    const dir = projectDir(pos[0]); const cfg = cfgOf(dir);
    const rows = [];
    for (const dev of deviceList()) for (const route of cfg.routes) {
      const slug = slugForPath(route);
      const fa = path.join(dir, "research/screens/original", dev, `${slug}.png`);
      const fb = path.join(dir, "research/screens/clone", dev, `${slug}.png`);
      if (!fs.existsSync(fa) || !fs.existsSync(fb)) { rows.push({ device: dev, route, missing: true }); continue; }
      const a = PNG.sync.read(fs.readFileSync(fa)); const b = PNG.sync.read(fs.readFileSync(fb));
      const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
      const pad = (img) => { if (img.width === w && img.height === h) return img; const o = new PNG({ width: w, height: h }); o.data.fill(255); PNG.bitblt(img, o, 0, 0, img.width, img.height, 0, 0); return o; };
      const A = pad(a), B = pad(b), out = new PNG({ width: w, height: h });
      const changed = pixelmatch(A.data, B.data, out.data, w, h, { threshold: Number(flags.threshold ?? 0.1), includeAA: false, alpha: 0.2 });
      const strictChanged = pixelmatch(A.data, B.data, null, w, h, { threshold: 0, includeAA: true });
      const df = path.join(dir, "research/diff", dev, `${slug}.png`);
      fs.mkdirSync(path.dirname(df), { recursive: true }); fs.writeFileSync(df, PNG.sync.write(out));
      rows.push({ device: dev, route, width: w, height: h, sizeMatch: a.width === b.width && a.height === b.height, heightDelta: b.height - a.height, changedPixels: changed, diffRatio: changed / (w * h), strictRatio: strictChanged / (w * h), diffImage: path.relative(dir, df) });
    }
    const max = cfg.thresholds.maxDiffRatio ?? 0.01, maxStrict = cfg.thresholds.maxStrictRatio ?? 0.001;
    for (const r of rows) r.pass = !r.missing && r.diffRatio <= max && r.strictRatio <= maxStrict && r.sizeMatch;
    writeJSON(path.join(dir, "research/diff-report.json"), rows);
    for (const r of rows) console.log(r.missing ? `MISSING ${r.device} ${r.route}` : `${r.pass ? "PASS" : "FAIL"} ${r.device.padEnd(7)} ${r.route.padEnd(30)} perceptual ${(r.diffRatio * 100).toFixed(3)}%  strict ${(r.strictRatio * 100).toFixed(3)}%  ${r.sizeMatch ? "" : `size Δh=${r.heightDelta}`}`);
    if (rows.some((r) => !r.pass)) process.exitCode = 2;
    return rows;
  },

  // wcl api <project> — independent backend/API/DB reconstruction from observed traffic
  api() {
    const dir = projectDir(pos[0]); const cfg = cfgOf(dir);
    const captured = readJSON(path.join(dir, "research/api-capture.json"), []);
    const summary = generateBackend({ captured, origin: cfg.origin, outDir: path.join(dir, "backend"), libDir: path.join(LAB, "lib") });
    console.log(JSON.stringify(summary, null, 2));
  },

  // wcl test <project> --base URL [--api URL]
  test() {
    const dir = projectDir(pos[0]); const cfg = cfgOf(dir);
    const base = String(flags.base || "http://127.0.0.1:3000").replace(/\/$/, "");
    const cfgFile = writeTests({ dir, cfg, base, apiBase: flags.api || null, lab: LAB, chromium: chromiumPath(), devices: DEVICES });
    const ok = run(process.execPath, [path.join(LAB, "node_modules/@playwright/test/cli.js"), "test", "-c", cfgFile, "--trace", "off"], { cwd: dir });
    if (!ok) process.exitCode = 3;
    return ok;
  },

  // wcl verify <project> [--base URL] [--start]  — the full automatic gate
  async verify() {
    const dir = projectDir(pos[0]); const cfg = cfgOf(dir);
    const procs = [];
    const port = Number(flags.port || 3100);
    if (flags.start) {
      const app = path.join(dir, "app");
      for (const p of [port, 4010, 4011]) { try { await fetch(`http://127.0.0.1:${p}/`); die(`port ${p} already in use — stop the old server first`); } catch {} }
      if (!run("npm", ["run", "build"], { cwd: app })) die("next build failed");
      const be = path.join(dir, "backend");
      if (fs.existsSync(path.join(be, "server.mjs"))) {
        // app backend and a separate, throw-away backend for API mutation tests (no cross-test races)
        for (const [p, f] of [["4010", "verify-app-db.json"], ["4011", "verify-test-db.json"]]) {
          const db = path.join(dir, "research", f); fs.copyFileSync(path.join(be, "db.seed.json"), db);
          procs.push(spawn(process.execPath, [path.join(be, "server.mjs")], { cwd: dir, stdio: "ignore", detached: true, env: { ...process.env, PORT: p, DB_FILE: db } }));
        }
        flags.api ||= "http://127.0.0.1:4011";
      }
      const nextBin = path.join(app, "node_modules/next/dist/bin/next");
      procs.push(spawn(process.execPath, [nextBin, "start", "-p", String(port)], { cwd: app, stdio: "ignore", detached: true }));
      flags.base = `http://127.0.0.1:${port}`;
      for (let i = 0; i < 60; i++) { try { await fetch(flags.base); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
    }
    try {
      flags.target = "clone"; await commands.capture();
      const diff = commands.diff(); process.exitCode = 0;
      const tests = commands.test();
      const pass = diff.every((r) => r.pass) && tests;
      const report = [`# Verification report — ${cfg.url}`, "", `Clone: ${flags.base}  ·  ${new Date().toISOString()}`, "",
        `## Pixel comparison (pixelmatch) — limits: perceptual ≤ ${((cfg.thresholds.maxDiffRatio ?? 0.01) * 100).toFixed(2)}%, strict ≤ ${((cfg.thresholds.maxStrictRatio ?? 0.001) * 100).toFixed(2)}%, identical page size`, "",
        "| device | route | perceptual % | strict % | size | result |", "|---|---|---|---|---|---|",
        ...diff.map((r) => r.missing ? `| ${r.device} | ${r.route} | – | – | – | MISSING |` : `| ${r.device} | ${r.route} | ${(r.diffRatio * 100).toFixed(3)} | ${(r.strictRatio * 100).toFixed(3)} | ${r.sizeMatch ? "same" : "Δh " + r.heightDelta} | ${r.pass ? "PASS" : "FAIL"} |`),
        "", `## Functional/navigation tests: ${tests ? "PASS" : "FAIL"} (see research/test-results)`, "", `## Overall: ${pass ? "PASS" : "FAIL"}`, ""];
      fs.writeFileSync(path.join(dir, "VERIFY_REPORT.md"), report.join("\n"));
      console.log(report.join("\n"));
      process.exitCode = pass ? 0 : 4;
    } finally { for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} } } // kill whole process groups
  },
};

if (!commands[cmd]) {
  console.log(`wcl — WebClone Lab
  wcl doctor                                   check the whole toolchain
  wcl selftest                                 end-to-end test on the bundled demo (must PASS, injected bugs must FAIL)
  wcl init <url> --authorized "<statement>"   [--name slug] [--storage-state state.json] [--max-pages N]
  wcl crawl <project>                          same-origin route map (session-aware)
  wcl recon <project> [--mirror]               crawl + Ditto probes (recon, network, interactions, motion, animations, sourcemaps, assets, DNA)
  wcl capture <project> --target original      screenshots + facts + API traffic (desktop/tablet/mobile)
  wcl api <project>                            rebuild backend: OpenAPI + SQL schema/seed + runnable mock server
  wcl capture <project> --target clone --base URL
  wcl diff <project>                           pixel-by-pixel comparison
  wcl test <project> --base URL [--api URL]   navigation + functional tests on 3 devices
  wcl verify <project> [--base URL | --start]  capture clone + diff + tests + VERIFY_REPORT.md
Projects live in ${PROJECTS}`);
  process.exit(cmd ? 1 : 0);
}
await commands[cmd]();
