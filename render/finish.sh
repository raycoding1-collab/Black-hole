#!/usr/bin/env bash
# Mux picture + score and produce the delivery encodes.
#   render/finish.sh <outdir>      (expects <outdir>/picture.mp4 and <outdir>/score.wav)
set -euo pipefail
OUT=${1:-output}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIC="$OUT/picture.mp4"; AUD="$OUT/score.wav"
DUR=87
mkdir -p "$ROOT/media"

# 1) Master: untouched high-bitrate picture + 320k AAC
ffmpeg -y -hide_banner -loglevel error -i "$PIC" -i "$AUD" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -shortest \
  -movflags +faststart -metadata title="TON 618 - Journey to an Ultramassive Black Hole" "$OUT/TON618_4K_master.mp4"
echo "master: $(du -h "$OUT/TON618_4K_master.mp4" | cut -f1)"

# helper: two-pass x264 to a size budget (MiB)
enc() { # in out scale size_mib abr preset
  local in=$1 out=$2 vf=$3 mib=$4 abr=$5 preset=$6
  local total=$(( mib * 8 * 1024 * 1024 / DUR ))
  local vbr=$(( (total - abr * 1000) / 1000 ))
  echo "encoding $out at ${vbr}k video + ${abr}k audio"
  ffmpeg -y -hide_banner -loglevel error -i "$in" -map 0:v -vf "$vf" -c:v libx264 -preset "$preset" -b:v ${vbr}k \
    -pass 1 -passlogfile "$OUT/x264pass" -profile:v high -pix_fmt yuv420p -an -f mp4 /dev/null
  ffmpeg -y -hide_banner -loglevel error -i "$in" -i "$AUD" -map 0:v -map 1:a -vf "$vf" -c:v libx264 -preset "$preset" -b:v ${vbr}k \
    -pass 2 -passlogfile "$OUT/x264pass" -profile:v high -pix_fmt yuv420p -c:a aac -b:a ${abr}k -shortest \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart \
    -metadata title="TON 618 - Journey to an Ultramassive Black Hole" "$out"
  echo "  -> $(du -h "$out" | cut -f1)"
}

# 2) 4K delivery (< 100 MB for GitHub); light temporal denoise removes render grain that would waste bits
enc "$PIC" "$ROOT/media/TON618_4K.mp4" "hqdn3d=1.2:1.2:4:4" 92 256 slow
# 3) 1080p web cut (< 20 MB for the website)
enc "$PIC" "$ROOT/media/TON618_1080p.mp4" "scale=1920:1080:flags=lanczos,hqdn3d=1.5:1.5:5:5" 19 128 slow
rm -f "$OUT"/x264pass*
ls -la "$ROOT/media"
