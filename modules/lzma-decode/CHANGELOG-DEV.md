# lzma-decode developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.7.0 · API 1 · 2026-11-08

### Quick
Adds lzmaDecode.warm(), opt-in, never automatic: it decodes a built-in 16 KB sample so the engine has optimized the decoder before the real unpack.

### Details
lzmaDecode.warm() decodes a 6.8 KB packed made-up text once (about 6-12 ms). First plain-JavaScript unpack of a 730 KB stream, new browser per sample, paired: Chromium 156 0.84 (12 of 14 pairs), WebKitGTK 2.52.6 0.85 (10 of 10); research thread: Chromium 156 0.91, Firefox 158 0.96, WebKitGTK 0.94. Also on lzma-decode-with-wasm.js (warms the JavaScript decoder only). No change for existing calls.

### Deep
1.7.0: lzmaDecode.warm() (opt-in). Gate runs 11.08: paired fresh-browser, 730 KB first unpack, early stop at 85%: Chromium 156.0.8078.79-1 14 rounds 36.3 to 32.3 ms (0.84, 12/14, idle 12.0 ms); WebKitGTK 2.52.6 10 rounds 33.0 to 28.0 ms (0.85, 10/10, idle 8.0 ms). Firefox 158 (research thread, 24 rounds) 0.96, 15/24; not rerun here (puppeteer-core card open). Phone pending. Module tests 355 passed. Brief: js-modules-research/lzma-decode/warm-2026.11.08/BRIEF-apply-warm.md

## 1.6.4 · API 1 · 2026-11-07

### Quick
The four rare single-bit decodes in the match step share one small top-level helper, lzmaBit, so Chromium no longer throws away the optimized match step on its first unpack. First unpack vs 1.6.3: Chromium 0.93 (500 KB) and 0.92 (2.5 MB); Firefox 0.81 and 1.02; WebKitGTK 0.97 and 0.93. Later unpacks: Chromium 0.99, Firefox 0.85, WebKitGTK 1.00. Same output.

### Details
New internal helper lzmaBit(P, src, i, S) above lzmaMatchStep, used for the short-rep bit, the two rep-distance choices and the second length choice. No API change. Requested by the owner (standing research order).

### Deep
Those rare sites collected small-integer feedback in V8, and the first range value above 2^30 there deoptimized the match step ('not a Smi', 1-2 per first unpack). One shared site sees full-range values early. Brief: js-modules-research/lzma-decode/kernel-2026.11.07/BRIEF-apply-js-j26.md.

## 1.6.3 · API 1 · 2026-11-07

### Quick
The match step is now one top-level function instead of a new inner function on every call, so later unpacks in a page reuse its optimized code. 500 KB unpack after a 2.5 MB one vs 1.6.2: Chromium 0.54, WebKitGTK 0.58, Firefox 0.92. First unpack: Chromium 1.07 (0.999-1.16, noisy), WebKitGTK 1.04, Firefox 0.98. Same output.

### Details
lzmaDecode calls lzmaMatchStep(P, src, out, S, posState, outSize), declared just above it, with the probability table offsets written as numbers. No API change. Requested by the owner.

### Deep
A function declared inside lzmaDecode is a new closure on every call, and engines did not reuse its optimized code, so every later unpack ran the match code cold. Brief: js-modules-research/lzma-decode/kernel-2026.11.07/BRIEF-apply-js-j15.md.

## 1.6.2 · API 1 · 2026-11-07

### Quick
Matches and repeats are decoded in a small helper outside the main loop, so the loop is optimized sooner. First unpack of a 500 KB text (149 KB packed) vs 1.6.1: Chromium 0.78, Firefox 0.92, WebKitGTK 0.92. A second unpack in the same page is slower than 1.6.1 (Chromium 25 to 31 ms, Firefox 15 to 19, WebKitGTK 19 to 26) but still faster than 1.4.0. Same output.

### Details
lzmaDecode: match and repeat decoding moved into matchStep(), which keeps its state in a small Int32Array. This fixes a first-unpack slowdown in Chromium (1.05-1.53x of 1.4.0 before; 0.72-1.02 now on 256-730 KB files). Requested by the owner, who accepted the slower repeat unpacks.

### Deep
Faster first unpack; later unpacks in one page a little slower.

## 1.6.1 · API 1 · 2026-11-07

### Quick
Refill reads src[ip++] (past the end reads as 0, as before); long matches far enough back use copyWithin. Decode of 3 MB text plus 1.3 MB HTML vs 1.6.0: Chromium 1.00 (level), Firefox 0.85, WebKitGTK 0.96. Same output.

### Details
Two edits in lzmaDecode: the range coder refill drops the bounds check (a typed array read past the end gives undefined, which | turns into 0, the same as the old check), and matches longer than 24 bytes whose distance is at least the length are copied with copyWithin, clamped to the output size. Requested by the owner.

### Deep
Faster plain-JavaScript decode in Firefox and WebKit; same output.

## 1.6.0 · API 1 · 2026-11-07

### Quick
Repeat unpacks 0.86-0.96x; one Instance kept while its memory is 16 MB or less.

### Details
lzmaDecodeWasm keeps one WebAssembly Instance between calls instead of starting a fresh one each time. lzma_begin already resets all decoder state and tables, so results are the same bytes. When a call leaves the memory above 16 MB, or a call fails, the Instance is dropped and the next call starts a new one, so a big unpack never pins its memory. Repeat 400 KB unpack after a 3 MB one, early-stop A/B, fresh page per run: Chromium 155 0.95 (ok), Firefox 158 0.96 (ok), WebKitGTK 2.52.6 0.86 (faster). First unpack unchanged. Tests: A, B, A again give the same bytes with at most one Instance; a 17 MB result is followed by a fresh Instance; a bad stream is followed by a fresh Instance and the right bytes.

### Deep
Requested by the owner (card 'Yes, with a 16 MB limit', 2026.11.07).

## 1.5.1 · API 1 · 2026-11-07

### Quick
JavaScript decoder keeps its range coder in 32-bit integers; same bytes and same errors, no API change

### Details
range and code stay 32-bit integers: unsigned compares flip the top bit, Math.imul for the bound, !(range >>> 24) for the refill test, so values of 2^31 and above no longer become doubles.
Ratio vs 1.4.0, lower is better, fresh page per sample (31 pages x 3 runs), first 3 MB / next 400 KB: Chromium 155 0.67 / 0.39 (1.5.0: 0.79 / 0.46), Firefox 158 0.57 / 0.44 (0.71 / 0.52), WebKitGTK 2.52.6 0.71 / 0.39 (1.04 / 0.58): the 1.5.0 WebKitGTK first-file slowdown is gone. Node 22 here, 1.6 MB: 1.5.0 20.5 to 16.5 ms median.
Size: minified 4,020 bytes (1.5.0 3,653; 1.4.0 2,156), gzip 1,167 (1.4.0 1,179).
171 cases give the same output bytes or error message as 1.4.0. Module tests 350 pass; lzma-pack 25 pass; packed pages open with and without WebAssembly in all three browsers.

### Deep
Requested by the owner. Research j9 (lzma-decode/kernel-2026.11.07, BRIEF-apply-js-v2.md). Alone the int32 coder on 1.4.0 gave Chromium 0.95/0.91, Firefox 0.92/0.91, WebKitGTK 0.71/0.74; stacked with the 1.5.0 one-loop rewrite it wins in every browser. Splitting out the distance decode (j7) gave WebKitGTK 1.06 and was dropped.

### Version-to-version table (moved from the README, 1.5.0 and 1.5.1)

Two changes, both with byte-identical output (170 cases per build, including cut and flipped streams: same bytes or the same error message). Ratio against 1.4.0, lower is better, fresh page per sample, cloud browsers (Chromium 155, Firefox 158, WebKitGTK 2.52.6) unless it says laptop (Chromium 156, Firefox 160, 16 cores):

| Decoder | Test | Chromium | Firefox | WebKitGTK |
|---|---|---|---|---|
| WebAssembly | first unpack after load, 3 MB text | 0.85 | 0.82 | 0.96 |
| WebAssembly | next unpack, 400 KB | 0.89 | 0.88 | 0.90 |
| WebAssembly | laptop, first / second | 0.86 / 0.87 | 0.90 / 0.88 | not run |
| JavaScript (1.5.1) | first unpack after load, 3 MB text | 0.67 | 0.57 | 0.71 |
| JavaScript (1.5.1) | next unpack, 400 KB | 0.39 | 0.44 | 0.39 |
| JavaScript (1.5.0) | laptop, first / second | 0.93 / 0.64 | 0.78 / 0.56 | not run |

What it costs: the WebAssembly program grows from 4,701 to 5,024 bytes, and the minified JavaScript decoder from 2,156 to 4,020 bytes (gzipped 1,179 to 1,167), so a packed page that carries it grows about 1.9 KB. 1.5.0's 5 to 14% slower first big unpack in WebKitGTK is gone in 1.5.1, which keeps the range coder in 32-bit integers. Further gains in the loop are close to the native ceiling (the same C built natively runs about as fast as the system liblzma), so the next step would be a format change, such as independent blocks unpacked on several threads.

## 1.5.0 · API 1 · 2026-11-07

### Quick
Faster JavaScript decoder (one function, one loop) and a faster WebAssembly build (B); same bytes and same errors, no API change

### Details
lzmaDecode is now one function: each range-coder bit step is written out in place (13 copies), all probabilities live in one Uint16Array at fixed offsets, trees are plain loops, and range/code/ip are plain locals instead of variables shared with inner functions.
Ratio vs 1.4.0, lower is better. Cloud, fresh page per sample: first decode 3 MB Chromium 155 0.67-0.79, Firefox 158 0.70-0.79, WebKitGTK 2.52.6 1.05-1.14 (slower); next decode 400 KB 0.41-0.47, 0.50-0.52, 0.59-0.67. Owner's laptop, 1.2 MB first / second: Firefox 160 0.78 / 0.56, Chromium 156 0.93 / 0.64. Node 22 here: 1.6 MB 28.5 to 18.1 ms median.
Size: minified 2,156 to 3,653 bytes (+1.5 KB), gzip 1,179 to 1,151 bytes; a --no-wasm packed page grows about 1.5 KB. WebKitGTK's first big unpack is 5 to 14% slower; later ones are a third faster.
171 cases (4 streams, 40 cut or flipped copies each, 6 lc/lp/pb mixes, tiny inputs): identical output hash or identical error message.
WebAssembly build B (wasm/lzma-decode.c): tree, rtree and length built into the main loop so range/code/ip stay in wasm locals; the per-byte past-the-end branch removed (ip > len already covers it; a read beyond memory traps and the wrapper falls back to JavaScript); repeat copy works out its length once; the bit step uses a mask. Still -Os; 4,701 to 5,024 bytes (+430 B of base64). Ratio vs 1.4.0, lower is better: cloud first 3 MB unpack Chromium 155 0.845, Firefox 158 0.815, WebKitGTK 2.52.6 0.964; next 400 KB 0.886, 0.875, 0.900. Owner's laptop, 1.2 MB first / second: Chromium 156 0.86 / 0.87, Firefox 160 0.90 / 0.88. Node 22 here: 1.5 MB warm 43 to 33 ms. Built here byte for byte the same as the researched build, which gave the shipped build's result on 170 cases. Needs the 64 KB calls (lzma_begin/lzma_more) that tools/lzma-pack already uses: in one long call it is 1.18x slower in Firefox.
Packed pages open with and without WebAssembly in Chromium 155, Firefox 158 and WebKitGTK 2.52.6 (tests/lzma-wasm-browser.js).

### Deep
Requested by the owner (Yes, ship it card, 10:51 AM ET 2026.11.07). Decoder from the PPMd/compression thread's research (lzma-decode/kernel-2026.11.07, j1; template tpl.js). Tried: 64 KB calls (j2, WebKit still 1.07, Chromium small decode worse) and only the literal loops inlined (j4, 0.91-0.98). WebAssembly build B approved separately (Yes, ship it card, 10:54 AM ET 2026.11.07); research in FINDING-LZMA-KERNEL-2026.11.07.md. Story Editor's own copy is its thread's change.

## 1.4.0 · API 1 · 2026-11-06

### Quick
Short WebAssembly calls: lzma_begin, then lzma_more for each 64 KB of output, so the engine moves the decode loop to its optimized code between calls (one long call stays on the slower first code the whole time; pattern from zip-open 1.17-…

### Deep
Short WebAssembly calls: lzma_begin, then lzma_more for each 64 KB of output, so the engine moves the decode loop to its optimized code between calls (one long call stays on the slower first code the whole time; pattern from zip-open 1.17-1.20 and ppmd-decode 1.4.0). lzma_decode is kept and does both. Same bytes; the program grows from 4,087 to 4,701 bytes. Owner card: Ship it everywhere.

## 1.3.1 · API 1 · 2026-10-31

### Quick
Embedded base64 decode uses Uint8Array.fromBase64 when present, falling back to the atob loop (or Buffer in Node).

### Deep
Embedded base64 decode uses Uint8Array.fromBase64 when present, falling back to the atob loop (or Buffer in Node). Same bytes: 20 of 20 embedded programs compared in Chromium 155, Firefox 158 and WebKitGTK 2.52.6. Decode time of all embedded programs, fromBase64 / atob loop: Chromium 0.18, Firefox 0.11, WebKitGTK 0.08 (cloud). Tests pass on both paths (Node 22 has no fromBase64, so the new path ran under a Buffer shim).

## 1.3.0 · API 1 · 2026-10-18

### Quick
The wasm now compiles in the background when the file loads (ready() and module() added); the compile it saves is under 1 ms. Same bytes out.

### Deep
Compile early in lzma-decode-wasm.js and lzma-decode-with-wasm.js: the 4,087-byte program used to compile and start at load; now WebAssembly.compile starts at load and the first decode starts the module (lzmaDecodeWasm.ready(), lzmaDecodeWasm.module() are new; .available now asks the engine when read and compiles on the spot if the early compile is not done). Compiling on the page took 0.5 ms (Chromium 155), under 1 ms (Firefox 158, WebKitGTK 2.52.6) and 1 ms (GNOME Web 46.5) (median of 9 fresh pages, smaller is better), so that is the most this saves; load plus first use differs by less than about 1 ms in both directions. 350 Node checks pass (346 old, 4 new).

## 1.2.0 · API 1 · 2026-10-18

### Quick
The default file is now lzma-decode-with-wasm.js: lzmaDecode tries WebAssembly first and uses the JavaScript decoder by itself when it cannot. About 1.5 to 2.6 times faster to open a page in the four test browsers.

### Deep
New default file lzma-decode-with-wasm.js (20832 bytes, 8241 gzipped): the plain decoder and the WebAssembly decoder in one file, built by wasm/join.js. lzmaDecode in it tries WebAssembly first and uses the JavaScript decoder when WebAssembly is not usable (page policy without 'wasm-unsafe-eval', old browser, lc + lp above 4, bad stream); lzmaDecode.plain is the JavaScript decoder alone, lzmaDecodeWasm is another name for lzmaDecode. lzma-decode.js (plain, 9,530 bytes) and lzma-decode-wasm.js stay as before, so tools/lzma-pack and pages written for 1.1.0 keep working. First decode of the 569,513-byte Pineapple Defense page (141,872 bytes of LZMA), plain file to default file (lower is better): ungoogled-chromium 155.0.8059.39-1 46.6 ms to 17.9 ms (2.60x); Firefox 158.0 38.0 ms to 24.0 ms (1.58x); WebKitGTK 2.52.6 37.0 ms to 25.0 ms (1.48x); GNOME Web 46.5 38.0 ms to 25.0 ms (1.52x). Cost: the default file is 20832 bytes against 9,530 for the plain one.

## 1.1.0 · API 1 · 2026-10-17

### Quick
New optional WebAssembly version of the decoder, about 1.5 to 2 times faster to open a page in the four test browsers. Pages that forbid WebAssembly use the old decoder.

### Deep
New optional file lzma-decode-wasm.js: the same decoder in WebAssembly (4,087 bytes). First decode of a 569,513-byte page takes 20.1 ms instead of 40.8 ms in ungoogled-chromium 155 (2.03 times as fast), 18.0 instead of 35.0 in Firefox 158.0 (1.94 times), 24.0 instead of 36.0 in WebKitGTK 2.52.6 (1.50 times), 28.0 instead of 44.0 in GNOME Web 46.5 (1.57 times); higher is better for the ratio, smaller for the milliseconds. Same bytes, same error messages; pages that forbid WebAssembly, settings with lc + lp above 4 and bad streams go to the JavaScript decoder. lzma-decode.js itself only got its version line and stays the default.

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
