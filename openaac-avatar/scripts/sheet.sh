#!/bin/bash
# usage: scripts/sheet.sh <out.png> <view> <preset> <top> <bottom> [bodies...]  -- renders a row of body sizes
out=$1; view=$2; preset=$3; top=$4; bottom=$5; shift 5
bodies=${@:-0 0.5 1}
tmp=$(mktemp -d)
i=0
for b in $bodies; do
  pnpm -s tsx --conditions=source packages/cli/src/main.ts render --view $view --preset $preset --body $b --wear top=$top --wear bottom=$bottom --skin '#c68642' --bottom '#5d4037' --top '#444' --size 600 -o $tmp/$i.svg >/dev/null
  convert -background white -density 96 $tmp/$i.svg -alpha remove $tmp/$i.png
  i=$((i+1))
done
convert $tmp/*.png +append $out
rm -rf $tmp
