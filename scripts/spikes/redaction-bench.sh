#!/usr/bin/env bash
# Spike 3: maskedmerge vs N chained crop/boxblur/overlay stages.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/docs/spike-artifacts/redaction"
mkdir -p "$OUT"
cd "$OUT"

ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "testsrc2=size=1280x720:rate=30:duration=4" \
  -c:v libx264 -pix_fmt yuv420p -crf 18 source.mp4

ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "color=c=black:s=1280x720:d=4:r=30" \
  -vf "drawbox=x=100:y=100:w=200:h=80:color=white:t=fill,\
drawbox=x=400:y=200:w=160:h=60:color=white:t=fill,\
drawbox=x=700:y=300:w=240:h=100:color=white:t=fill,\
drawbox=x=200:y=450:w=180:h=70:color=white:t=fill,\
drawbox=x=900:y=120:w=220:h=90:color=white:t=fill" \
  -c:v libx264 -pix_fmt yuv420p -crf 18 mask5.mp4

bench() {
  local name="$1"
  shift
  local start end elapsed
  start=$(date +%s%N)
  ffmpeg -y -hide_banner -loglevel error "$@"
  end=$(date +%s%N)
  elapsed=$(awk -v s="$start" -v e="$end" 'BEGIN { printf "%.3f", (e-s)/1e9 }')
  echo "$name ${elapsed}s"
}

bench "maskedmerge_gblur" \
  -i source.mp4 -i mask5.mp4 -filter_complex \
  "[0:v]format=yuv420p,gblur=sigma=24[blurred];\
   [0:v][blurred][1:v]maskedmerge[out]" \
  -map "[out]" -c:v libx264 -pix_fmt yuv420p -crf 18 out_maskedmerge.mp4

build_chain() {
  local n="$1"
  local labels=""
  local i
  for i in $(seq 1 "$n"); do
    labels+="[s${i}]"
  done
  local filters="[0:v]split=$((n + 1))[base]${labels};"
  local overlay="[base]"
  for i in $(seq 1 "$n"); do
    local x=$((50 + (i - 1) * 40))
    local y=$((50 + (i - 1) * 30))
    filters+="[s${i}]crop=120:48:${x}:${y},boxblur=10:1[b${i}];"
    if [[ "$i" -lt "$n" ]]; then
      filters+="${overlay}[b${i}]overlay=${x}:${y}[o${i}];"
      overlay="[o${i}]"
    else
      filters+="${overlay}[b${i}]overlay=${x}:${y}[out]"
    fi
  done
  printf '%s' "$filters"
}

for n in 1 5 20; do
  graph=$(build_chain "$n")
  bench "chained_n${n}" \
    -i source.mp4 -filter_complex "$graph" \
    -map "[out]" -c:v libx264 -pix_fmt yuv420p -crf 18 "out_chain_${n}.mp4"
done

bench "maskedmerge_pixelize" \
  -i source.mp4 -i mask5.mp4 -filter_complex \
  "[0:v]format=yuv420p,pixelize=w=16:h=16[pix];\
   [0:v][pix][1:v]maskedmerge[out]" \
  -map "[out]" -c:v libx264 -pix_fmt yuv420p -crf 18 out_pixelize.mp4

echo "Artifacts in $OUT"
