#!/usr/bin/env bash
# End-to-end self-test of WebClone Lab on the bundled, owned demo site:
#   positive case: reference clone must PASS (pixel diff + tests, 3 devices)
#   negative case: injected visual + behaviour bugs must make the gate FAIL
set -uo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export WEBCLONE_PROJECTS="$(mktemp -d /tmp/wcl-selftest.XXXXXX)"
WCL="${WCL:-/opt/webclone-lab/bin/wcl.mjs}"
ORIG_PORT=8089
fail() { echo "SELFTEST FAIL: $*"; kill "$ORIG_PID" 2>/dev/null; exit 1; }

PORT=$ORIG_PORT node "$SRC/demo/original/server.mjs" >/dev/null 2>&1 & ORIG_PID=$!
for _ in $(seq 30); do curl -sf "http://127.0.0.1:$ORIG_PORT/" >/dev/null && break; sleep 0.5; done

P="$("$WCL" init "http://127.0.0.1:$ORIG_PORT/" --name selftest --authorized "bundled demo fixture (owned)" 2>/dev/null)" || fail init
"$WCL" recon "$P" >"$P/recon.log" 2>&1 || fail recon
grep -q FAIL "$P/research/recon-status.json" && fail "a Ditto probe failed"
[ "$(jq '.routes|length' "$P/clone.config.json")" = 3 ] || fail "crawl did not find 3 routes"
"$WCL" capture "$P" --target original >/dev/null 2>&1 || fail capture
"$WCL" api "$P" >/dev/null || fail api
jq -e '.products|length==6' "$P/backend/db.seed.json" >/dev/null || fail "backend rebuild"

cp -r "$SRC/demo/clone/src/." "$P/app/src/"
cp "$SRC/demo/clone/next.config.ts" "$P/app/"
cp "$SRC/demo/clone/backend/routes.extra.json" "$P/backend/"
"$WCL" verify "$P" --start >"$P/verify-ok.log" 2>&1 || { tail -30 "$P/verify-ok.log"; fail "reference clone did not pass"; }
echo "positive case: PASS"

sed -i 's/border-radius:16px/border-radius:12px/' "$P/app/src/components/sites/novashop/site.css"
sed -i 's/onClick={() => setOpen((o) => !o)}/onClick={() => setOpen((o) => o)}/' "$P/app/src/components/sites/novashop/Header.tsx"
"$WCL" verify "$P" --start >"$P/verify-bad.log" 2>&1 && fail "gate did not catch injected bugs"
grep -q "strict" "$P/VERIFY_REPORT.md" && grep -q "| FAIL |" "$P/VERIFY_REPORT.md" || fail "pixel gate missed the radius change"
grep -q "controls behave like original" "$P/verify-bad.log" || fail "test gate missed the broken menu"
echo "negative case: bugs detected"

kill "$ORIG_PID" 2>/dev/null
echo "SELFTEST PASS  (artifacts: $P)"
