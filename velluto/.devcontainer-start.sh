#!/usr/bin/env bash
# Used by GitHub Codespaces (.devcontainer/velluto): no terminal needed.
#   setup: download demo media, seed DB + transcode, build   (first creation only, ~20-30 min)
#   start: start the server on port 3000 in the background  (every start)
set -euo pipefail
cd "$(dirname "$0")"
case "${1:-start}" in
  setup)
    npm run media:fetch
    VELLUTO_WORKER=0 npm run seed
    npm run build
    ;;
  start)
    [ -d .next ] || npm run build
    nohup npm start -- -p 3000 > /tmp/velluto.log 2>&1 &
    echo "Velluto avviato su http://localhost:3000 — credenziali in velluto/data/demo-credentials.txt"
    ;;
esac
