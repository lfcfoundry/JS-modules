#!/bin/sh
# Writes varied files with the JavaScript writer into DIR, then checks that lfcp-read gives the same text as the JavaScript reader (value-exact and byte-exact).
# usage: sh stress/compare.sh /path/to/lfcp-read DIR     (run from go-reader/)
exe=$1; dir=$2; mkdir -p "$dir"; bad=0
for g in stress/gen1.cjs stress/gen2.cjs stress/gen3.cjs; do node $g "$dir" >/dev/null || exit 1; done
for f in "$dir"/*.json.lfc; do
  b=${f%.json.lfc}
  if "$exe" text "$f" 2>"$b.err" | cmp -s - "$b.expect"; then echo "same  $(basename $b)"; else echo "DIFF  $(basename $b) $(head -c 150 $b.err)"; bad=1; fi
done
exit $bad
