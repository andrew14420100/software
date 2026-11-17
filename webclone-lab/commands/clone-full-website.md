---
description: Fully analyse and rebuild an authorized website (pages, graphics, animations, interactions, features, backend/API/DB) with automatic pixel-diff and functional verification on desktop, tablet and mobile.
argument-hint: "<url> [--storage-state state.json] [--max-pages N]"
---

Target: $ARGUMENTS

1. Read `~/.claude/skills/clone-full-website/SKILL.md` completely and follow it.
2. Run `wcl doctor` first; if anything FAILs, run `bash /opt/webclone-lab/install.sh` (or the repo copy `webclone-lab/install.sh`) and re-check.
3. Authorization gate: unless the user already stated it in this conversation, ask whether they own the site or have written permission to clone it, and record their answer with `wcl init <url> --authorized "<answer>"`. Do not proceed without it. Never bypass logins, CAPTCHAs, paywalls, rate limits or bot protection.
4. Run the pipeline end to end: init → recon → capture original → api → observe (Playwright MCP + REA) → rebuild in `<project>/app` → `wcl verify <project> --start` → iterate until PASS or the remaining gaps are explained.
5. Deliver `VERIFY_REPORT.md`, diff images, run instructions, and a precise list of remaining differences. Do not call anything pixel-perfect that the gate did not verify.
