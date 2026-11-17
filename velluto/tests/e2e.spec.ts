import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { PASSWORD, USERS } from "./global-setup.ts";

import { db } from "../src/server/db.ts";

// each test starts with no open playback sessions (screen limits are tested explicitly)
test.afterEach(() => { db().prepare("DELETE FROM playback_sessions").run(); });

const desktopOnly = (name: string) => test.skip(name !== "desktop", "API/security checks run once");

async function login(page: Page, email: string) {
  await page.goto("/accedi");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/accedi"));
}
const play = (req: APIRequestContext, base: string, mediaId: number, caps: object = {}) =>
  req.post("/api/play", { data: { mediaId, caps }, headers: { origin: base } });
const mediaIdOf = async (page: Page, slug: string) => {
  await page.goto(`/titolo/${slug}`);
  return Number((await page.getByTestId("play").getAttribute("href"))!.split("/").pop());
};
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), "horizontal overflow").toBeLessThanOrEqual(1);
}

test.describe("catalog (anonymous)", () => {
  test("landing, plans, catalog pages and search", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.getByText("Scegli il tuo piano")).toBeVisible();
    await expect(page.getByText("Ultra", { exact: true })).toBeVisible();
    await noOverflow(page);
    for (const path of ["/film", "/serie", "/genere/animazione", "/titolo/sintel", "/titolo/cronache-di-sintel"]) {
      const r = await page.goto(path); expect(r!.status(), path).toBe(200); await noOverflow(page);
    }
    await expect(page.getByTestId("episode")).toHaveCount(3);
    await page.goto("/cerca?q=Colin");
    await expect(page.getByRole("link", { name: /Sintel/ }).first()).toBeVisible();
    await page.goto("/cerca?q=zzzznothing");
    await expect(page.getByText("Nessun risultato")).toBeVisible();
  });

  test("navigation: desktop menu vs mobile tab bar", async ({ page }) => {
    await page.goto("/");
    const isMobile = page.viewportSize()!.width < 768; // tablets (≥768px) get the desktop menu
    const tabbar = page.getByRole("navigation", { name: "Navigazione mobile" });
    const main = page.getByRole("navigation", { name: "Principale" });
    if (isMobile) { await expect(tabbar).toBeVisible(); await expect(main).toBeHidden(); await tabbar.getByRole("link", { name: "Serie" }).click(); }
    else { await expect(main).toBeVisible(); await main.getByRole("link", { name: "Serie" }).click(); }
    await expect(page).toHaveURL(/\/serie$/);
  });

  test("player requires login", async ({ page }) => {
    await page.goto("/guarda/1");
    await expect(page).toHaveURL(/\/accedi\?next=%2Fguarda%2F1/);
  });
});

test.describe("auth + subscriptions", () => {
  test("register → no plan blocks playback → subscribe → plays", async ({ page }, info) => {
    const email = `e2e-new-${info.project.name}-${Date.now()}@velluto.test`;
    await page.goto("/registrati");
    await page.getByLabel("Nome").fill("Nuovo Utente");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Registrati" }).click();
    await expect(page).toHaveURL(/\/abbonamenti/);
    const id = await mediaIdOf(page, "tears-of-steel");
    await page.goto(`/guarda/${id}`);
    await expect(page.getByTestId("player-error")).toContainText("abbonamento");
    await page.goto("/abbonamenti");
    await page.getByTestId("plan-essenziale").click();
    await expect(page).toHaveURL(/\/account/);
    await expect(page.getByTestId("subscription")).toContainText("Essenziale");
    await page.goto(`/guarda/${id}`);
    await expect.poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 30_000 }).toBeGreaterThan(1);
    // cancel at period end, then resume
    await page.goto("/account");
    await page.getByRole("button", { name: "Annulla rinnovo" }).click();
    await expect(page.getByRole("status")).toContainText("Rinnovo disattivato");
    await page.getByRole("button", { name: "Riattiva rinnovo" }).click();
    await expect(page.getByRole("button", { name: "Annulla rinnovo" })).toBeVisible();
  });

  test("wrong password is rejected, logout works", async ({ page }) => {
    await page.goto("/accedi");
    await page.getByLabel("Email").fill(USERS.plus);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Credenziali" })).toContainText("Credenziali non valide");
    await login(page, USERS.plus);
    await page.getByRole("button", { name: "Menu account" }).click();
    await page.getByRole("menuitem", { name: "Esci" }).click();
    await expect(page.getByRole("link", { name: "Accedi" }).first()).toBeVisible();
  });
});

test.describe("player", () => {
  test("plays HLS, quality capped by plan, controls work, progress resumes", async ({ page }) => {
    await login(page, USERS.plus);
    const id = await mediaIdOf(page, "big-buck-bunny");
    await page.goto(`/guarda/${id}`);
    const video = page.locator("video");
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 30_000 }).toBeGreaterThan(2);
    expect(await video.evaluate((v: HTMLVideoElement) => v.videoHeight)).toBeLessThanOrEqual(1080);
    await page.mouse.move(200, 200);
    await page.getByRole("button", { name: "Qualità" }).click();
    const items = page.getByRole("menuitemradio");
    await expect(items.filter({ hasText: /^1080p/ })).toHaveCount(1);
    await expect(items.filter({ hasText: "4K" })).toHaveCount(0); // Plus = max 1080p
    await items.filter({ hasText: /^720p/ }).click();
    await page.getByRole("button", { name: "Velocità" }).click();
    await page.getByRole("menuitemradio", { name: "1.5×" }).click();
    expect(await video.evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1.5);
    await page.keyboard.press("l"); // +10s
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(12);
    await page.keyboard.press("k"); // pause
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await page.getByRole("button", { name: "Statistiche" }).click();
    await expect(page.getByTestId("stats")).toContainText("risoluzione");
    // progress saved on pause → resume on reload + history entry
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByText(/Ripreso da/)).toBeVisible({ timeout: 30_000 });
    await page.goto("/cronologia");
    await expect(page.getByTestId("history")).toContainText("Big Buck Bunny");
  });

  test("subtitles menu lists Italian track", async ({ page }) => {
    await login(page, USERS.plus);
    const id = await mediaIdOf(page, "tears-of-steel");
    await page.goto(`/guarda/${id}`);
    await expect.poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 30_000 }).toBeGreaterThan(1);
    await page.mouse.move(300, 300);
    await page.getByRole("button", { name: "Sottotitoli" }).click();
    await page.getByRole("menuitemradio", { name: "Italiano" }).click();
    await expect.poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => [...v.textTracks].some((t) => t.mode === "showing")), { timeout: 15_000 }).toBe(true);
  });

  test("series: skip intro and autoplay next episode", async ({ page }) => {
    await login(page, USERS.plus);
    await page.goto("/titolo/cronache-di-sintel");
    await page.getByTestId("episode").first().click();
    const video = page.locator("video");
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 30_000 }).toBeGreaterThan(0.5);
    await page.getByTestId("skip-intro").click();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(9);
    const first = page.url();
    await video.evaluate((v: HTMLVideoElement) => { v.currentTime = v.duration - 11; });
    await expect(page.getByTestId("up-next")).toContainText("S1:E2");
    await expect(page.getByTestId("up-next")).toContainText(/Tra \d+s/);
    await page.waitForURL((u) => u.href !== first, { timeout: 20_000 }); // countdown → next episode
    await expect(page.getByText("S1:E2 · Il mercato")).toBeVisible();
  });
});

test.describe("library", () => {
  test("favorites toggle and La mia lista", async ({ page }) => {
    await login(page, USERS.plus);
    await page.goto("/titolo/elephants-dream");
    const btn = page.getByRole("button", { name: /La mia lista|Nella mia lista/ });
    if ((await btn.getAttribute("aria-pressed")) === "true") { await btn.click(); await expect(btn).toHaveAttribute("aria-pressed", "false"); }
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    await page.goto("/la-mia-lista");
    await expect(page.getByRole("link", { name: /Elephants Dream/ })).toBeVisible();
    await page.goto("/titolo/elephants-dream");
    await page.getByRole("button", { name: "Nella mia lista" }).click();
    await page.goto("/la-mia-lista");
    await expect(page.getByText("La tua lista è vuota")).toBeVisible();
  });
});

test.describe("entitlements & security (API)", () => {
  test("4K/HDR only for Ultra + capable device; tokens enforced", async ({ page, playwright, baseURL }, info) => {
    desktopOnly(info.project.name);
    const ctx = async (email: string) => { const p = await page.context().browser()!.newPage(); await login(p, email); return p; };
    const id = await (async () => { const p = await ctx(USERS.ultra); const r = await mediaIdOf(p, "big-buck-bunny"); await p.close(); return r; })();
    const master = async (email: string, caps: object) => {
      const p = await ctx(email); const r = await play(p.request, baseURL!, id, caps); expect(r.status()).toBe(200);
      const j = await r.json(); const m = await (await p.request.get(j.src)).text(); await p.request.delete("/api/play", { data: { playbackId: j.playbackId }, headers: { origin: baseURL! } }); await p.close(); return { j, m };
    };
    const ultraHdr = await master(USERS.ultra, { hdr: true, hevc: true, maxHeight: 2160 });
    expect(ultraHdr.m).toContain("VIDEO-RANGE=PQ");
    expect(ultraHdr.m).toContain("hvc1.2.4.L153");
    const ultraSdr = await master(USERS.ultra, { hdr: false, hevc: true, maxHeight: 2160 });
    expect(ultraSdr.m).not.toContain("VIDEO-RANGE=PQ");
    expect(ultraSdr.m).toContain("RESOLUTION=3840x2160");
    const plus = await master(USERS.plus, { hdr: true, hevc: true, maxHeight: 2160 });
    expect(plus.m).not.toContain("PQ"); expect(plus.m).not.toContain("3840x2160"); expect(plus.m).toContain("1920x1080");
    const basic = await master(USERS.basic, {});
    expect(basic.m).not.toContain("1920x1080");

    // a Plus grant cannot fetch the 4K rendition even by guessing its id
    const token = new URL(plus.j.src, baseURL).searchParams.get("t")!;
    const ids = [...ultraSdr.m.matchAll(/v\/(\d+)\/index\.m3u8/g)].map((x) => x[1]);
    const anon = await playwright.request.newContext({ baseURL });
    const statuses = await Promise.all(ids.map(async (rid) => (await anon.get(`/api/stream/${id}/v/${rid}/index.m3u8?t=${token}`)).status()));
    expect(statuses).toContain(403);
    expect((await anon.get(`/api/stream/${id}/master.m3u8`)).status()).toBe(403);
    expect((await anon.get(`/api/stream/${id}/master.m3u8?t=${token.slice(0, -2)}xx`)).status()).toBe(403);
    expect((await anon.get(`/api/stream/${id + 1}/master.m3u8?t=${token}`)).status()).toBe(403); // token bound to media
    // CSRF: state-changing request from a foreign origin is refused
    const p = await ctx(USERS.plus);
    expect((await p.request.post("/api/favorites", { data: { titleId: 1, on: true }, headers: { origin: "https://evil.example" } })).status()).toBe(403);
    expect((await p.request.post("/api/admin", { data: { action: "plan.save" }, headers: { origin: baseURL! } })).status()).toBe(403); // not admin
    await p.close();
    await anon.dispose();
  });

  test("concurrent screens limited by plan", async ({ page, baseURL }, info) => {
    desktopOnly(info.project.name);
    await login(page, USERS.basic); // Essenziale = 1 screen
    const id = await mediaIdOf(page, "sintel");
    const a = await play(page.request, baseURL!, id); expect(a.status()).toBe(200);
    const b = await play(page.request, baseURL!, id); expect(b.status()).toBe(429);
    expect((await b.json()).error).toContain("schermi");
    await page.request.delete("/api/play", { data: { playbackId: (await a.json()).playbackId }, headers: { origin: baseURL! } });
    expect((await play(page.request, baseURL!, id)).status()).toBe(200);
  });

  test("login brute force is rate limited", async ({ playwright, baseURL }, info) => {
    desktopOnly(info.project.name);
    const r = await playwright.request.newContext({ baseURL });
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await r.post("/api/auth/login", { data: { email: "victim@velluto.test", password: "x" + i }, headers: { origin: baseURL! } })).status();
    expect(last).toBe(429);
    await r.dispose();
  });
});

test.describe("admin", () => {
  test("non-admin is kept out", async ({ page }) => {
    await login(page, USERS.plus);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/$/);
  });

  test("dashboard, edit title, create series with season, manage users", async ({ page }, info) => {
    await login(page, USERS.admin);
    await page.goto("/admin");
    await expect(page.getByTestId("kpis")).toContainText("Abbonati attivi");
    await page.goto("/admin?tab=titoli");
    await page.getByRole("row", { name: /Elephants Dream/ }).getByRole("link", { name: "Modifica" }).click();
    const tag = `Frase e2e ${info.project.name} ${Date.now()}`;
    await page.getByLabel("Frase di lancio").fill(tag);
    await page.getByRole("button", { name: "Salva" }).first().click();
    await expect(page.getByRole("status").first()).toContainText("Salvato");
    await page.goto("/titolo/elephants-dream");
    await expect(page.getByText(tag)).toBeVisible();
    // new draft series → add a season
    await page.goto("/admin?tab=titoli");
    await page.getByPlaceholder("Titolo").fill(`Serie e2e ${info.project.name}`);
    await page.locator("select[name=type]").selectOption("series");
    await page.getByRole("button", { name: "Crea (come bozza)" }).click();
    await expect(page).toHaveURL(/\/admin\/titoli\/\d+/);
    await page.getByRole("button", { name: "+ Stagione" }).click();
    await expect(page.getByRole("heading", { name: "Stagione 1" })).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Elimina", exact: true }).click();
    await expect(page).toHaveURL(/tab=titoli/);
    await page.goto("/admin?tab=media");
    await expect(page.getByTestId("jobs")).toContainText("done");
    await page.goto("/admin?tab=utenti");
    await expect(page.getByText(USERS.basic)).toBeVisible();
  });
});

test.describe("visual regression (pixel diff vs approved baseline)", () => {
  for (const path of ["/", "/titolo/big-buck-bunny", "/accedi"]) {
    test(`screenshot ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: "*{animation:none!important;transition:none!important} img{visibility:hidden}" });
      await expect(page).toHaveScreenshot({ fullPage: false });
    });
  }
});
