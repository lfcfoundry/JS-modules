#!/bin/sh
# one browser at a time; each run prints the browser version on line 1
cd /tmp/claude-0/pcm/work
for b in chromium firefox webkit epiphany; do
  REPS=15 ROUNDS=3 timeout 1500 node browser/run-browser.js $b browser/res-$b.json > browser/out-$b.txt 2>&1
  echo "$b exit $?" >> browser/runall.log
done
echo all-finished >> browser/runall.log
