# ppmd-decode developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

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
