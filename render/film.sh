#!/usr/bin/env bash
# Render the full film in resumable chunks, then concatenate.
#   render/film.sh <outdir> [fps] [width] [active-height] [frame-height]
set -u
OUT=${1:-film}; FPS=${2:-24}; W=${3:-3840}; H=${4:-1608}; PADH=${5:-2160}
CHUNK=${CHUNK:-96}
DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT/segments"
TOTAL=$(node -e "console.log(Math.round(87*$FPS))")
i=0
for ((s=0; s<TOTAL; s+=CHUNK)); do
  e=$((s+CHUNK)); ((e>TOTAL)) && e=$TOTAL
  seg=$(printf "%s/segments/seg_%05d.mp4" "$OUT" "$s")
  want=$((e-s))
  if [[ -f "$seg" ]]; then
    have=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$seg" 2>/dev/null || echo 0)
    [[ "$have" == "$want" ]] && { echo "skip $seg"; continue; }
  fi
  echo "=== rendering frames $s..$((e-1)) -> $seg  ($(date -u +%H:%M:%S))"
  node "$DIR/render.cjs" --w "$W" --h "$H" --padh "$PADH" --fps "$FPS" --start "$s" --end "$e" --out "$seg.tmp.mp4" --crf 12 --preset medium 2>&1 | grep --line-buffered -v "GL Driver" | grep --line-buffered -E "frame .*0/|done|rror"
  mv "$seg.tmp.mp4" "$seg"
done
ls "$OUT"/segments/seg_*.mp4 | sed "s|^$OUT/segments/|file 'segments/|; s|$|'|" > "$OUT/list.txt"
ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i "$OUT/list.txt" -c copy "$OUT/picture.mp4" && echo "FILM DONE $(date -u +%H:%M:%S)"
