#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Reruns the 2026-11-11 compression research experiments. Run from this folder.
# Needs: Node 22, Python 3, the test browsers from the knowledge-base "browsers" branch, Playwright 1.63 (Chromium),
# puppeteer-core 25.16.0 (Firefox BiDi, see qa-guide three-browsers recipe), and the story-editor qa-kit:
#   export CHROMIUM=.../chrome FIREFOX_PATH=.../firefox QA_KIT=.../story-editor/packages/qa-kit/src QA_NODE_MODULES=.../node_modules
set -eu
LP=../../../../modules/lfc-pack/lfc-pack.js
python3 mkinst.py "$LP" inst.js                          # build copy with timing hooks around zstd compress/decompress
python3 mkvar.py inst.js www/v-base.js base
python3 mkvar.py inst.js www/v-uuid.js uuid               # B1: UUID text to bytes with char codes
python3 mkvar.py inst.js www/v-sample.js sample           # B2: pick the encoding from a sample
python3 mkvar.py inst.js www/v-both.js uuid,sample
cp inst.js www/
node attrib.cjs 30000,300000                              # writes www/*.ndjson and attrib.json (which zstd calls won); counts only
node verify.cjs                                           # pass/fail: every variant round-trips, sizes per variant
(cd www && python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &) ; sleep 1
for b in chromium firefox webkit; do node drive.cjs $b 3 logs-300000,events-300000,sensors-300000,ids-300000,repeat-300000; python3 anal.py t-$b.json; done
for b in chromium firefox webkit; do
  node abdrive.cjs $b 6 4 base,sample logs-300000,sensors-300000,events-300000 && python3 abanal.py ab-$b.json base,sample
  node abdrive.cjs $b 4 4 base,uuid ids-300000,ids-30000 && python3 abanal.py ab-$b.json base,uuid
done
# E5 (B3): apply b3-long-numbers.diff to a copy of modules/lfc-pack, rebuild (wasm/build-flatscan.sh, build.py), then:
#   node b3verify.cjs <0.8.1 lfc-pack.js> <patched lfc-pack.js>      # byte identity on 19 sets
#   copy the two builds to www/v-base.js and www/v-b3.js; node abdrive.cjs <browser> 6 4 base,b3 ids-300000,ids-30000,logs-300000
