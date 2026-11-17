#!/usr/bin/env bash
# Downloads the demo sources: Blender Foundation open movies (Creative Commons Attribution).
# Destination: $VELLUTO_SOURCES (default ~/velluto-cache), outside the repository.
set -euo pipefail
DEST="${VELLUTO_SOURCES:-$HOME/velluto-cache}"
mkdir -p "$DEST" && cd "$DEST"
B=https://download.blender.org
get() {
  if [ -s "$2" ]; then echo "ok   $2"; return; fi
  curl -sSfL --retry 3 -C - -o "$2.part" "$B/$1"
  mv -f "$2.part" "$2"; echo "got  $2"
}
get demo/movies/ToS/tears_of_steel_720p.mov tos_720p.mov
get demo/movies/ToS/subtitles/TOS-it.srt tos_it.srt
get demo/movies/ToS/subtitles/TOS-en.srt tos_en.srt
get ED/ED_1024.avi ed_1024.avi
get demo/movies/Sintel.2010.1080p.mkv sintel_1080p.mkv
if [ ! -s bbb_sunflower_2160p_30fps_normal.mp4 ]; then
  get demo/movies/BBB/bbb_sunflower_2160p_30fps_normal.mp4.zip bbb.zip
  unzip -o -q bbb.zip && rm -f bbb.zip
fi
ls -la "$DEST"
