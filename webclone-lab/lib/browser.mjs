// Shared browser helpers: Chromium resolution, device matrix, deterministic capture.
import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright";

// Desktop / tablet / smartphone. deviceScaleFactor is pinned to 1 so that the
// original and the clone are rasterised identically (pixel diff stays exact),
// while UA, touch and isMobile still emulate the real device.
export const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  tablet: { ...devices["iPad Mini"], deviceScaleFactor: 1 },
  mobile: { ...devices["iPhone 13"], deviceScaleFactor: 1 },
};
delete DEVICES.tablet.defaultBrowserType;
delete DEVICES.mobile.defaultBrowserType;

export function chromiumPath() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers"].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
        const p = path.join(root, d, sub);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  const p = chromium.executablePath();
  if (fs.existsSync(p)) return p;
  throw new Error("Chromium not found: run `npx playwright install chromium`");
}

export async function launch() {
  return chromium.launch({ executablePath: chromiumPath(), headless: true, args: ["--font-render-hinting=none", "--disable-skia-runtime-opts"] });
}

// storageState lets the user supply THEIR OWN legitimately obtained session
// (e.g. exported after logging in through Playwright MCP). Nothing here tries
// to bypass authentication, CAPTCHAs, paywalls or bot protection.
export async function newContext(browser, deviceName, { storageState } = {}) {
  const dev = DEVICES[deviceName];
  if (!dev) throw new Error(`unknown device ${deviceName}`);
  return browser.newContext({
    ...dev,
    storageState: storageState && fs.existsSync(storageState) ? storageState : undefined,
    reducedMotion: "reduce",
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
  });
}

const FREEZE_CSS = `*,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important;animation-play-state:paused!important;caret-color:transparent!important;scroll-behavior:auto!important}`;

// Load a page and bring it to a stable, comparable state.
export async function settle(page, url, { wait = 800 } = {}) {
  const resp = await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  // scroll through the page with wheel input to trigger lazy media / reveals
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = page.viewportSize().height;
  for (let y = 0; y < h; y += vh) { await page.mouse.wheel(0, vh); await page.waitForTimeout(120); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});
  await page.evaluate(() => Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; }))));
  await page.waitForTimeout(wait);
  return resp;
}

// Structural fingerprint used by functional tests (original = expectation).
export async function pageFacts(page) {
  return page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const txt = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    return {
      title: document.title,
      lang: document.documentElement.lang || "",
      headings: [...document.querySelectorAll("h1,h2,h3")].filter(vis).map((e) => `${e.tagName}:${txt(e)}`).slice(0, 60),
      links: [...document.querySelectorAll("a[href]")].filter(vis).map((a) => ({ text: txt(a).slice(0, 80), href: a.href })).slice(0, 200),
      buttons: [...document.querySelectorAll("button,[role=button],input[type=submit]")].filter(vis).map((b) => txt(b).slice(0, 80) || b.getAttribute("aria-label") || "").slice(0, 100),
      forms: [...document.forms].map((f) => ({ action: f.action, method: f.method, fields: [...f.elements].map((e) => e.name).filter(Boolean) })),
      images: [...document.images].filter(vis).length,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
}

export function slugForPath(p) {
  const s = p.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
  return s || "index";
}

// Behaviour of non-submitting controls: does clicking change the UI / URL?
// Submit buttons and anything inside a <form> are never clicked (no data is sent).
const CONTROL_SEL = "button:not([type=submit]),[role=button]";
export async function probeControls(page, url, { max = 15 } = {}) {
  const out = [];
  const sig = () => page.evaluate(() => location.pathname + "|" + document.body.innerHTML);
  await page.goto(url, { waitUntil: "load" }); await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  const labels = await page.locator(CONTROL_SEL).filter({ visible: true }).evaluateAll((els) => els.filter((e) => !e.closest("form")).map((b) => ((b.innerText || b.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 80) || b.getAttribute("aria-label") || "")));
  for (const label of labels.slice(0, max)) {
    await page.goto(url, { waitUntil: "load" }); await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    const before = await sig();
    const b = page.locator(CONTROL_SEL).filter({ visible: true, hasText: label || undefined }).first();
    let error = null;
    await b.click({ timeout: 5000 }).catch((e) => { error = e.message.split("\\n")[0]; });
    await page.waitForTimeout(300);
    out.push({ label, changes: before !== (await sig()), error });
  }
  return out;
}
