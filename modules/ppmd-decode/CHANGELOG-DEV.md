# ppmd-decode developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.7.0 · API 1 · 2026-11-08

### Quick
New opt-in ppmd7Decode.warm({ order, memSize }): decode a built-in 2-5 KB real-text sample in an idle callback, then the first plain-JavaScript decode of a 30 KB page takes 0.58 (Chromium 156), 0.76 (Firefox 158), 0.74 (WebKitGTK 2.52.6) and 0.62 (Android Chrome 156) of the time; idle work 6-11 ms desktop, 28 ms phone. Large decodes gain little (16 MB model, 400 KB order 6: 0.82 Chromium, 0.88 WebKitGTK, none in Firefox). Nothing changes unless you call it.

### Details
New API, opt-in, no change to existing calls: ppmd7Decode.warm({ order, memSize }) (also on the combined file, where it warms the JavaScript decoder). It needs both numbers and they must be the ones the later decode uses: the decoder is made once per memory size, so warming at another size made the first real decode 1.14 to 1.35 times slower in the PPMd/LZMA lane recheck. The sample is real JavaScript and HTML from our repositories, re-encoded so it decodes correctly at 64 KB model memory and up (5 KB at 128 KB or more, 2 KB below). Not called: first decode new/old 0.94 Chromium, 0.92 Firefox, 0.96 WebKitGTK, load time unchanged.

### Deep
ppmd-decode 1.7.0: opt-in warm({ order, memSize }). Owner approved ('Yes, after the phone run'). 30 KB order-12 target, 64 KB model, first decode warm/none, 15 paired fresh pages: Chromium 156 0.58 (15/15), Firefox 158 0.76 (10/15), WebKitGTK 0.74 (14/15); order-6 1 MB model target: 0.54, 0.76, 0.64. Phone (owner): Android Chrome 156 0.62, 14 of 14. Without the call nothing is slower (0.94, 0.92, 0.96). Tests: 145 pass incl. warm checks.

## 1.6.1 · API 1 · 2026-11-08

### Quick
Three rare branches were rewritten so Chromium no longer throws away the optimized decoder on first use. First decode vs 1.6.0: Chromium 0.93 (400 KB) and 1.00 (3 MB), Firefox 0.96 and 1.00, WebKitGTK 1.00 and 1.00 (41 pairs). Second decode: 0.96, 0.97, 1.03. Same output.

### Details
rescale() is called through one helper, rescaleIf(f); updateModel's two rare branches are written as expressions with the same rule. No API change. Requested by the owner (standing research order).

### Deep
The rare branches had no type feedback when V8 optimized, so their first use deoptimized (2-3 per decode). Brief: js-modules-research/ppmd-decode/hoist-2026.11.07/BRIEF-apply-p21.md.

## 1.6.0 · API 1 · 2026-11-07

### Quick
The decoder's helpers are made once instead of on every call, and the last model (16 MB or less) is kept and cleared for the next call. Second 400 KB decode vs 1.5.1: Chromium 0.58, Firefox 0.80, WebKitGTK 0.60. First decode: Chromium 1.01 (400 KB) and 0.95 (3 MB), Firefox 1.01 and 0.98, WebKitGTK 0.91 and 1.03. Same output.

### Details
New behavior: up to 16 MB of model memory stays allocated between calls (same rule as lzma-decode 1.6.0); a larger model is made fresh each call. ppmd7Decode is still the one global, with the same checks and errors. Requested by the owner.

### Deep
1.5.1 declared about 30 helpers inside ppmd7Decode, so each call made new closures and ran cold; the second decode in a page was slower than the first. Brief: js-modules-research/ppmd-decode/hoist-2026.11.07/BRIEF-apply-p19.md.

## 1.5.1 · API 1 · 2026-11-07

### Quick
Range coder kept in 32-bit integers (Math.imul, signed compare flip): first decode 0.87x Chromium 155, 0.96x Firefox 158, 0.88x WebKitGTK 2.52.6; laptop Firefox 160 0.97x, Chromium 156 0.98x. Same output.

### Details
decodeAll's range coder keeps rng and code as 32-bit integers instead of doubles with >>> 0 after every step. Products use Math.imul, the probability compare flips the top bit, divisions read unsigned values. No format or API change. Requested by the owner.

### Deep
Faster plain-JavaScript decode; same output.

## 1.5.0 · API 1 · 2026-11-06

### Quick
New async decode: the page stays responsive (longest freeze 56 to 9 ms on the laptop)

### Details
ppmd7DecodeWasm.async(src, outSize, order, memSize, opts) returns a promise of the same bytes. It decodes in 8 KB steps and hands the page back about every 8 ms through a MessageChannel. Laptop: longest freeze 56 to 9 ms (Chromium 156) and 57 to 8 ms (Firefox 160); totals 1.02 and 1.00. Errors are rejected promises with the same texts; the plain call is unchanged.

### Deep
Requested by the owner (card: Yes, ship it).

## 1.4.0 · API 1 · 2026-11-06

### Quick
Faster WebAssembly decoder (build E): the model and scratch sit at fixed addresses, the decoder state lives in WebAssembly globals, 7-Zip 2023's escape loop, and the work is split into short decode_more calls of 64 KB of output so the brow…

### Deep
Faster WebAssembly decoder (build E): the model and scratch sit at fixed addresses, the decoder state lives in WebAssembly globals, 7-Zip 2023's escape loop, and the work is split into short decode_more calls of 64 KB of output so the browser moves to its optimized code between them. Same bytes and the same errors as before; the program grows by 421 bytes (9,738). Laptop, new time / old time: Firefox 160 first decode 0.71, repeat 0.84; Chromium 156 0.92 and 0.92. The plain JavaScript decoder is unchanged.

## 1.3.1 · API 1 · 2026-10-31

### Quick
Embedded base64 decode uses Uint8Array.fromBase64 when present, falling back to the atob loop (or Buffer in Node).

### Deep
Embedded base64 decode uses Uint8Array.fromBase64 when present, falling back to the atob loop (or Buffer in Node). Same bytes: 20 of 20 embedded programs compared in Chromium 155, Firefox 158 and WebKitGTK 2.52.6. Decode time of all embedded programs, fromBase64 / atob loop: Chromium 0.18, Firefox 0.11, WebKitGTK 0.08 (cloud). Tests pass on both paths (Node 22 has no fromBase64, so the new path ran under a Buffer shim).

## 1.3.0 · API 1 · 2026-10-18

### Quick
The wasm now compiles in the background when the file loads (ready() and module() added); the compile it saves is about 1 ms. Same bytes out.

### Deep
Compile early in ppmd-decode-wasm.js and ppmd-decode-with-wasm.js: the 9,317-byte program used to compile and start at load; now WebAssembly.compile starts at load and the first decode starts the module (ppmd7DecodeWasm.ready(), .module() are new; .wasm and .engine now ask the engine when read). Compiling on the page took 0.5 ms (Chromium 155) and 1 ms (Firefox 158, WebKitGTK 2.52.6, GNOME Web 46.5) (median of 9 fresh pages, smaller is better), so that is the most this saves; load plus first use differs by less than about 1 ms in both directions. 137 Node checks pass.

## 1.2.0 · API 1 · 2026-10-18

### Quick
The default file is now ppmd-decode-with-wasm.js: ppmd7Decode tries WebAssembly first and uses the JavaScript decoder by itself when it cannot. About 1.4 to 1.8 times faster to open a page in the four test browsers.

### Deep
New default file ppmd-decode-with-wasm.js (44215 bytes, 16014 gzipped): the plain decoder and the WebAssembly decoder in one file, built by wasm/join.js. ppmd7Decode in it tries WebAssembly first and uses the JavaScript decoder when WebAssembly is not usable (page policy without 'wasm-unsafe-eval', old browser, memory cannot be had, argument out of range); ppmd7Decode.plain is the JavaScript decoder alone, ppmd7DecodeWasm is another name for ppmd7Decode, fromProps goes the same way. ppmd-decode.js (plain, 26175 bytes) and ppmd-decode-wasm.js stay as before, so tools/ppmd-pack and pages written for 1.1.0 keep working. First decode of a 400,000-byte page (order 6, 16 MB model memory), plain file to default file (lower is better): ungoogled-chromium 155.0.8059.39-1 112.2 ms to 66.7 ms (1.68x); Firefox 158.0 123.0 ms to 67.0 ms (1.84x); WebKitGTK 2.52.6 94.0 ms to 61.0 ms (1.54x); GNOME Web 46.5 95.0 ms to 67.0 ms (1.42x). Cost: the default file is 44215 bytes against 26175 for the plain one.

## 1.1.0 · API 1 · 2026-10-17

### Quick
New optional WebAssembly version of the decoder, about twice as fast to open a page and with no warm-up. Same results.

### Deep
New and optional: ppmd-decode-wasm.js (16.8 KB file, holding a 9,317-byte WebAssembly program built from wasm/ppmd7.c) adds ppmd7DecodeWasm, the same decoder with the same arguments, bytes and error texts, about twice as fast and without the warm-up the JavaScript version needs. Decoding a 400,000-byte page (90,444 bytes packed) on a freshly opened page, load and compile included: 159 to 71 ms in Node 22 (2.2 times faster), 159 to 84 in ungoogled Chromium 155 (1.9 times), 143 to 80 in Firefox 158 (1.8 times), 175 to 75 in WebKitGTK 2.52.6 (2.3 times), 181 to 82 in GNOME Web 46.5 (2.2 times); decoding again in the same page: 95 to 46 ms in Node (2.1 times), 98 to 46 in Chromium (2.1 times), 190 to 79 in Firefox (2.4 times), 89 to 47 in WebKitGTK (1.9 times), 90 to 50 in GNOME Web (1.8 times). Same answers: 15 fixtures, 160 more streams and 798 damaged copies of them gave the same bytes or the same error text through both decoders (0 differences); 13 new checks, 131 in all (118 before). On a page that forbids WebAssembly, or without it, every call is handed to the JavaScript decoder (checked in all four browsers). ppmd-decode.js itself is unchanged (26,175 bytes), and tools/ppmd-pack does not use the add-on yet because a packed page would then carry both decoders.

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
