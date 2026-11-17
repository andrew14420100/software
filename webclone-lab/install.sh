#!/usr/bin/env bash
# WebClone Lab - idempotent installer (safe to run at every session start).
# Installs everything OUTSIDE the user's projects:
#   /opt/webclone-lab            tools, pinned third-party repos, template cache
#   ~/.claude/skills|commands    unified skill + /clone-full-website command
#   ~/.claude.json               MCP registrations (REA, Playwright MCP)
#   ~/webclone-projects          where clones are created
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB="${WEBCLONE_LAB:-/opt/webclone-lab}"
log() { printf '[webclone-lab] %s\n' "$*"; }

# ---- pinned versions (reviewed) ------------------------------------------
REA_VERSION="6.9.0"
PLAYWRIGHT_MCP_VERSION="0.0.85"
DITTO_COMMIT="774c8d4fc9d4f81b533c97575389df4531facba9"
CLONER_COMMIT="5426e0e2ec35dbc173a7a18f47a3dfe2a765313e"

mkdir -p "$LAB/vendor" "$HOME/.claude/skills" "$HOME/.claude/commands" "$HOME/webclone-projects"

# ---- 1. pinned third-party repositories ------------------------------------
fetch_pinned() { # name url commit
  local dir="$LAB/vendor/$1"
  if [ "$(git -C "$dir" rev-parse HEAD 2>/dev/null || true)" != "$3" ]; then
    rm -rf "$dir"; mkdir -p "$dir"
    git -C "$dir" init -q
    git -C "$dir" fetch -q --depth 1 "$2" "$3"
    git -C "$dir" checkout -q FETCH_HEAD
  fi
  log "$1 @ ${3:0:10}"
}
fetch_pinned ditto https://github.com/luigiluft/ditto.git "$DITTO_COMMIT"
fetch_pinned ai-website-cloner-template https://github.com/JCodesMore/ai-website-cloner-template.git "$CLONER_COMMIT"

# ---- 2. lab tools (orchestrator + test/diff deps) --------------------------
rm -rf "$LAB/bin" "$LAB/lib" "$LAB/demo"
cp -r "$SRC/bin" "$SRC/lib" "$SRC/demo" "$SRC/selftest.sh" "$SRC/install.sh" "$SRC/package.json" "$SRC/package-lock.json" "$LAB/"
chmod +x "$LAB/bin/"*
( cd "$LAB" && npm ci --no-audit --no-fund --loglevel=error )
# Wakaru (MIT): JS source-recovery engine used by REA; verify the official checksum.
WAKARU="$(realpath "$LAB/node_modules/@wakaru/cli-linux-x64/wakaru")"
echo "664fa06782a61eda7ed15885134b52525fd565dd77607e642062ceb6cd927c38  $WAKARU" | sha256sum -c --quiet - \
  || { log "Wakaru checksum mismatch - refusing to use it"; exit 1; }
export REA_WAKARU_COMMAND="$WAKARU"
# Ditto scripts resolve `playwright` from their cwd/global; give them ours.
mkdir -p "$LAB/vendor/ditto/node_modules"
ln -sfn "$LAB/node_modules/playwright" "$LAB/vendor/ditto/node_modules/playwright"
ln -sfn "$LAB/node_modules/playwright-core" "$LAB/vendor/ditto/node_modules/playwright-core"
ln -sfn "$LAB/bin/wcl.mjs" /usr/local/bin/wcl 2>/dev/null || true

# Browser: reuse pre-installed Chromium when present, else download it once.
if ! ls -d /opt/pw-browsers/chromium-* >/dev/null 2>&1 && [ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
  ( cd "$LAB" && npx playwright install --with-deps chromium )
fi

# ---- 3. Next.js rebuild template with pre-installed node_modules -----------
TPL="$LAB/template"
if [ ! -f "$TPL/.commit" ] || [ "$(cat "$TPL/.commit")" != "$CLONER_COMMIT" ]; then
  rm -rf "$TPL"; mkdir -p "$TPL"
  ( cd "$LAB/vendor/ai-website-cloner-template" && git archive HEAD ) | tar -x -C "$TPL"
  # Template's engines field says >=24, but Next 16 needs only >=20.9.
  ( cd "$TPL" && npm ci --no-audit --no-fund --loglevel=error --engine-strict=false )
  echo "$CLONER_COMMIT" > "$TPL/.commit"
fi
log "template ready ($TPL)"

# ---- 4. MCP servers ---------------------------------------------------------
npm install -g --no-audit --no-fund --loglevel=error \
  "rea-agents@$REA_VERSION" "@playwright/mcp@$PLAYWRIGHT_MCP_VERSION"
# Replace a registration pointing at a temporary npx cache with the global install.
if claude mcp get rea 2>/dev/null | grep -q "/_npx/"; then claude mcp remove --scope user rea >/dev/null 2>&1 || true; fi
if rea setup --client claude_code --yes --json >/dev/null; then log "REA $REA_VERSION registered"
else log "WARNING: rea setup did not complete; run: rea setup --client claude_code"; fi

CHROME="$("$LAB/bin/wcl.mjs" chromium-path)"
claude mcp remove --scope user playwright >/dev/null 2>&1 || true
claude mcp add --scope user playwright -- "$(command -v playwright-mcp)" \
  --headless --isolated --browser chromium --executable-path "$CHROME" \
  --output-dir "$HOME/webclone-projects/.playwright-mcp" >/dev/null
log "Playwright MCP $PLAYWRIGHT_MCP_VERSION registered (chromium: $CHROME)"

# ---- 5. unified skill + slash command --------------------------------------
rm -rf "$HOME/.claude/skills/clone-full-website"
cp -r "$SRC/skill" "$HOME/.claude/skills/clone-full-website"
cp "$SRC/commands/clone-full-website.md" "$HOME/.claude/commands/clone-full-website.md"
log "installed /clone-full-website"

"$LAB/bin/wcl.mjs" doctor
