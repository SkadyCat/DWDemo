#!/bin/sh
# 并行跑全部流派校准，结果按流派顺序拼接。
cd "$(dirname "$0")/.."
out=${1:-/tmp/cal.txt}; secs=${2:-12}
for a in inferno glacier storm triad heralds thunderslam whirlwind flicker critengine venom; do node scripts/core-calibrate.mjs $a $secs > "$out.$a" 2>&1 & done; wait
for a in inferno glacier storm triad heralds thunderslam whirlwind flicker critengine venom; do cat "$out.$a"; done > "$out"
