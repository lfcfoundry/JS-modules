#!/bin/bash
# Copyright (c) 2026 LFC Foundry. MIT License. The four browsers one at a time under the shared timing lock; 2 runs each (the first also times first use on fresh pages); 25 s rest after WebKitGTK and GNOME Web.
# OUT=folder for the JSON files (default ./raw). Needs puppeteer-core on NODE_PATH, xvfb-run, and the competitor packages (COMP=folder with node_modules/stackblur-canvas and glfx).
cd "$(dirname "$0")"; OUT=${OUT:-./raw}; mkdir -p "$OUT"
for n in 1 2; do for b in chromium firefox webkit epiphany; do
  case $b in webkit|epiphany) rest=25;; *) rest=3;; esac
  mode=main; [ $n = 1 ] && mode=all
  case $b in firefox) pre='xvfb-run -a -s "-screen 0 1280x1024x24"';; *) pre='';; esac
  flock /tmp/browser-timing.lock bash -c "$pre node run.js $b $OUT/$b-$n.json $mode > $OUT/$b-$n.log 2>&1; sleep $rest"
  echo "$(date +%T) $b $n $(stat -c %s $OUT/$b-$n.json 2>/dev/null)" >> $OUT/runall.log
done; done; echo ALLDONE >> $OUT/runall.log
