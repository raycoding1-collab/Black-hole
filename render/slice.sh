#!/usr/bin/env bash
# Render a frame range [START, END) of the film in CHUNK-sized segments (parallel render workers).
#   START=1344 END=1600 CHUNK=40 [PUSH_BRANCH=render-parts-a] render/slice.sh
# With PUSH_BRANCH set, the finished segments are committed (force-added; output/ is ignored) and pushed.
set -u
START=${START:?}; END=${END:?}; CHUNK=${CHUNK:-40}; FPS=${FPS:-24}
DIR="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$DIR/.." && pwd)"
OUT="$ROOT/output"; mkdir -p "$OUT/segments"
for ((s=START; s<END; s+=CHUNK)); do
  e=$((s+CHUNK)); ((e>END)) && e=$END
  seg=$(printf "%s/segments/seg_%05d.mp4" "$OUT" "$s")
  [[ -f "$seg" ]] && { echo "skip $seg"; continue; }
  echo "=== frames $s..$((e-1)) -> $seg ($(date -u +%H:%M:%S))"
  node "$DIR/render.cjs" --w 3840 --h 1608 --padh 2160 --fps "$FPS" --start "$s" --end "$e" --out "$seg.tmp.mp4" --crf 12 --preset medium 2>&1 \
    | grep --line-buffered -E "frame .*0/|done|rror"
  mv "$seg.tmp.mp4" "$seg"
done
echo "SLICE DONE $START-$END $(date -u +%H:%M:%S)"
if [[ -n "${PUSH_BRANCH:-}" ]]; then
  cd "$ROOT"
  git checkout -q -B "$PUSH_BRANCH"
  git add -f output/segments/seg_*.mp4
  git commit -q -m "Render parts $START-$END"
  for i in 1 2 3 4; do git push -u origin "$PUSH_BRANCH" && break || sleep $((2**i)); done
  echo "PUSHED $PUSH_BRANCH"
fi
