# lzma-decode developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

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
