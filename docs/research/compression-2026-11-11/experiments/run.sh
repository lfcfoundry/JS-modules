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
# E7 (read paths, B14): time split of 7 read modes, one fresh page per set (www/rd.html needs www/inst83.js from mkinst.py)
#   python3 mkinst.py "$LP" www/inst83.js
#   for b in chromium firefox webkit; do node rddrive.cjs $b 5 logs-300000:ts:status:ts,sensors-300000:ts:temp:ts,events-300000:id:type:id,ids-300000:x:k:k,sensnull-300000:ts:temp:ts,nd_dense:id:amount:id; python3 rdanal.py rd-$b.json; done
#   B14: apply b14-range-late-rows.diff to a copy of modules/lfc-pack (python3 build.py), then
#   node selverify.cjs "$LP" <patched lfc-pack.js> www <set:rangeKey:otherKey,...>        # same rows, 6 ranges x 3 key choices per set
#   copy the builds to www/v-r83.js and www/v-sel.js; node rdabdrive.cjs <browser> 4 5 r83,sel sensors-300000:ts:temp,...; python3 rdabanal.py rdab-<browser>.json r83,sel
#   worst case on its own page: ONLY=rangeAll TAG=-rangeAll node rdabdrive.cjs <browser> 6 5 r83,sel ...  (and ONLY=rangeMost)
# E8 (nulls, B13): python3 mknull.py www/sensors-300000.ndjson temp 0.001,0.01,0.1,0.5 (also dev, ok); node sz.cjs "$LP" temp-*.ndjson ...; python3 -I nullscan.py <corpus files>
#   read time: ONLY=rowsAll,colsAll TAG=-null node rddrive.cjs <browser> 7 temp-null-0.01:ts:temp:ts,temp-abs-0.01:ts:temp:ts,...
# E9 (small files, B7): python3 mkinst-src.py "$LP" inst-src.js; node ovh.cjs inst-src.js <small files>; node dict.cjs <small files>
