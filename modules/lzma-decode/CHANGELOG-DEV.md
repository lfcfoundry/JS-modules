# lzma-decode developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

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
