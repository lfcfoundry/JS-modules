# zstd-kit developer changelog

## 1.0.1 · API 1 · 2026-11-22

### Quick
The tuner tries 3 settings on a 32 KB sample instead of more; output stays standard zstd.

### Deep
The encoder's setting search now tries three candidates on a 32 KB sample, so the tuning step costs less. Size note: files come out 0.08 to 0.44 percent larger on the test set. Output is still standard zstd and decodes everywhere. Found in an outside code review (round 3).

## 1.0.0 (2026-11-14)
Split out of lfc-pack (owner picked the name zstd-kit on a card, 2026-11-14, under the standing credits rule). Moved from lfc-pack: wasm/build.sh, zstd-glue.c, zstd-freestanding.h, stubs/, zstd-full.wasm, zstd-dec.wasm and src/zstd.js (now src/zstd-core.js, shared; lfc-pack/build.py reads it and the two wasm files from here, lfc-pack.js differs only in one comment line). New public wrapper src/api.js; build.py writes zstd-kit.js and zstd-kit-dec.js. Tests: 156 checks incl. both directions against Node 22's libzstd. Bench (4 MB logs JSON, 3 fresh pages): decompress warm 7 / 9 / 8 ms (ungoogled Chromium 156 / Firefox 158 / WebKitGTK 2.52.6) vs fzstd 0.1.1 24.5 / 24 / 26 and browser gzip 18.2 / 22 / 20; compress level 3 33.4 / 31 / 52 vs CompressionStream gzip 100.3 / 91 / 94; level-3 frames 5-10% larger than gzip on these logs.
