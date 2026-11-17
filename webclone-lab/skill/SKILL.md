---
name: clone-full-website
description: >-
  Full, verified reconstruction of a website the user is authorized to clone:
  pages (including internal pages reachable with the user's own session),
  graphics, animations, interactions, features, structure and behaviour, plus an
  independent rebuild of backend/API/database from observed traffic. Verifies the
  result automatically with pixel-by-pixel screenshot diffs and navigation/
  functional tests on desktop, tablet and smartphone. Use for /clone-full-website
  or requests to clone/rebuild/reverse-engineer a whole site. Not for sites the
  user has no rights to, and never to bypass logins, paywalls, CAPTCHAs or bot
  protection.
---

# Clone a full website (WebClone Lab)

One pipeline over four tools, each with a single job (no overlaps):

| Tool | Role in the pipeline | Where |
|---|---|---|
| `wcl` (WebClone Lab CLI) | orchestration, device matrix, session-aware crawl, capture, **pixelmatch diff**, test generation, backend rebuild | `/opt/webclone-lab/bin/wcl.mjs` (`wcl`) |
| **Ditto** scripts (MIT, includes Jane-xiaoer's web-clone engine) | deep probes: stack recon, network fixtures, interaction probe, motion probe, animation inventory & WAAPI curve verify, source maps, assets, design DNA, mirror, align-diff | `/opt/webclone-lab/vendor/ditto/scripts` |
| **Playwright MCP** (`mcp__playwright__*`) | live, interactive browsing by you: inspect computed styles, hover/click/scroll states, login done *by the user*, exporting their storage state | MCP server `playwright` |
| **REA** (`mcp__rea__*` + `reverse-engineer-anything` skill) | reverse-engineer shipped JS bundles/source maps/WASM/Electron (`recover_javascript_sources` via Wakaru 1.14.0, `analyze_javascript_application`, `trace_javascript_semantics`, `inspect_web_event_listeners`), recover the real algorithm behind an effect with signed evidence | MCP server `rea` |
| **ai-website-cloner-template** (MIT) | rebuild target: Next.js 16 + React 19 + Tailwind 4 + shadcn; its method in `references/` | `/opt/webclone-lab/template` (copied per project) |

Jane-xiaoer/claude-skill-web-clone is **not installed separately**: Ditto vendors
it byte-for-byte (verified), so it would be a duplicate. Ditto's paid Higgsfield
3D route is excluded (free/OSS only). For proprietary 3D, rebuild with own assets.

## 0. Authorization gate (mandatory, first)

Before touching the target, confirm with the user that they own the site or have
written permission, and record it. Refuse otherwise. Rules for the whole run:
- Only access what the user's authorization allows. For internal pages, the **user**
  logs in (Playwright MCP `browser_navigate` to the login page, the user supplies
  credentials themselves; or they provide a `storageState` JSON they exported). Never
  guess credentials, brute-force, reuse leaked tokens, or defeat CAPTCHAs/WAFs/rate limits.
- If you hit 401/403/CAPTCHA/paywall: stop that branch and report it.
- Crawl politely (default 300 ms delay, ≤30 pages; raise only with the user's OK).
- The crawler skips logout/delete/unsubscribe links. Never submit forms that mutate
  real data on the original (no purchases, sign-ups, deletes) — observe, don't act.

## 1. Init + recon (automatic)

```bash
P=$(wcl init "<URL>" --authorized "<user's statement>" [--storage-state state.json] [--max-pages 30])
wcl recon "$P"            # crawl + Ditto recon/network/interactions/motion/anim-inventory/sourcemaps/assets/DNA
wcl capture "$P" --target original   # desktop 1440 / tablet iPad Mini / mobile iPhone 13 × every route
wcl api "$P"              # backend/: openapi.json, schema.sql (+seed), db.json, routes.json, server.mjs
```
Project layout (`~/webclone-projects/<slug>/`): `app/` (Next.js clone), `research/`
(all evidence), `backend/`, `tests/`, `clone.config.json`, `AUTHORIZATION.md`.
Nothing is written inside the user's existing repositories.

Read `research/original-recon.json` and classify complexity L1–L6 with
`/opt/webclone-lab/vendor/ditto/references/assessment.md`. Pick the route:
- static/brochure (L1–L2) → rebuild in Next.js; `wcl recon --mirror` gives a 1:1 static reference;
- content/SPA (L3–L4) → section specs + builders (below), data from `backend/`;
- heavy WebGL/canvas (L5–L6) → `references/complex-playbooks.md` + REA on the bundles.

## 2. Observe (you, with Playwright MCP + REA)

Follow `/opt/webclone-lab/vendor/ai-website-cloner-template/.agents/skills/clone-website/SKILL.md`
§2 and its `references/inspection-guide.md` / `framer-and-motion.md`. Concretely:
- `browser_resize` to 1440, 820, 390 widths; `browser_snapshot`, `browser_evaluate`
  for `getComputedStyle`, `getBoundingClientRect`, CSS variables, `document.fonts`.
- hover/click/scroll each control (`research/interactions/` already lists candidates);
  diff state A → state B = behaviour spec.
- animations: only what `research/anim-inventory.json` lists actually moves; for curves use
  `node /opt/webclone-lab/vendor/ditto/scripts/anim-verify.mjs`.
- unknown effect/logic → REA on the shipped JS (`research/sourcemaps/`, bundle URLs in recon).
  Ditto's iron law: implement only SOURCE-level evidence; tag GUESS otherwise.
- use real assets from `research/assets/` (copy into `app/public/`), real text, real fonts.

## 3. Rebuild

In `<project>/app` (template conventions: `src/app/`, `src/components/sites/<slug>/`,
`public/sites/<slug>/`). Shared tokens/fonts/layout first, then sections top→bottom
with every state (hover/focus/open/breakpoints). Same routes as `clone.config.json`.
For big pages, dispatch builder sub-agents per section with spec + screenshot + target file
(Ditto "parallel builder dispatch").

Server side that is not accessible: use the **independent** reconstruction in `backend/`
(never proxy the original). Wire it with Next rewrites from `backend/next-rewrites.json`
in `app/next.config.ts`, or port handlers to `src/app/api/**/route.ts`; `schema.sql`
gives a SQLite/Postgres starting schema. Rebuild form/auth flows locally with fake
users only. `npm run check` (lint+typecheck+build) must pass.

## 4. Verify (automatic gate — never skip, never claim unverified fidelity)

```bash
wcl verify "$P" --start        # builds app, starts backend:4010 + next:3100, then:
                               # capture clone → pixelmatch diff (3 devices × routes) → Playwright tests
# or against a running server:  wcl verify "$P" --base http://127.0.0.1:3000
```
- two-level pixel gate per view, both must hold plus identical page height:
  perceptual (pixelmatch 0.1, AA ignored) ≤ 1 % (`thresholds.maxDiffRatio`) and
  strict (any changed pixel) ≤ 0.1 % (`thresholds.maxStrictRatio`).
  `research/diff/<device>/<route>.png`: red = differing pixels. Big diff with matching content → vertical offset: run
  `ditto/scripts/align-diff.mjs`, fix the offending element.
- tests (`tests/wcl.spec.mjs`, 3 device projects): status, runtime errors, title,
  headings, buttons, link texts, link destinations (click-through), form fields,
  control interactivity, horizontal overflow, reconstructed API GET + CRUD.
- motion gate when recon says animated: `motion-probe.mjs` on both + per-frame diff.

Iterate: fix largest differences first (geometry → missing layers → type → crops →
spacing → motion), re-run `wcl verify` until PASS or until remaining gaps are explained.

Toolchain health: `wcl doctor` (static checks) and `wcl selftest` (full pipeline on the
bundled demo: reference clone must PASS, injected visual/behaviour bugs must FAIL).
REA also offers `compare_web_screenshots`; use it for ad-hoc agent comparisons — the gate
of record is `wcl verify`.

## 5. Deliver

`VERIFY_REPORT.md` + representative diff images, route map, how to run
(`cd app && npm run dev`, `node backend/server.mjs`), checks actually run, and an honest
list of remaining differences and of anything not accessible (with reason).
