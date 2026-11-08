# lzma-decode changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.6.3 · API 1 · 2026-11-07
- Later unpacks in the same page are about twice as fast in Chromium and WebKit; same output.

## 1.6.2 · API 1 · 2026-11-07
- The plain JavaScript decoder's first unpack in a page is faster, most in Chromium.

## 1.6.1 · API 1 · 2026-11-07
- The plain JavaScript decoder is faster in Firefox and WebKit.

## 1.6.0 · API 1 · 2026-11-07
- Repeat unpacks are faster: one WebAssembly Instance is kept between calls, up to 16 MB of memory

## 1.5.1 · API 1 · 2026-11-07
- The JavaScript decoder is faster again, now in WebKitGTK too: about a third faster on the first big file in every test browser.

## 1.5.0 · API 1 · 2026-11-07
- The JavaScript decoder (used when WebAssembly is blocked) unpacks about 1.5 to 2 times faster after the first file in Chromium and Firefox.
- The WebAssembly decoder unpacks about 15% faster in Chromium and Firefox.

## 1.4.0 · API 1 · 2026-11-06
- The first WebAssembly decode is 9 to 15% faster.

## 1.3.1 · API 1 · 2026-10-31
- Starts a little faster: the built-in WebAssembly program is decoded by the browser's own base64 decoder (Uint8Array.fromBase64) in 0.08 to 0.18 of the old time (cloud tests); older browsers use the old way. Same bytes.

## 1.3.0 · API 1 · 2026-10-18
- The wasm now compiles in the background when the file loads (ready() and module() added); the compile it saves is under 1 ms. Same bytes out.

## 1.2.0 · API 1 · 2026-10-18
- The default file is now lzma-decode-with-wasm.js: lzmaDecode tries WebAssembly first and uses the JavaScript decoder by itself when it cannot. About 1.5 to 2.6 times faster to open a page in the four test browsers.

## 1.1.0 · API 1 · 2026-10-17
- New optional WebAssembly version of the decoder, about 1.5 to 2 times faster to open a page in the four test browsers. Pages that forbid WebAssembly use the old decoder.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- Early October 2026: First version: a small LZMA decoder for self-unpacking pages.
- 2026-10-15: Stops early on cut-off input (a 64 MB claim on a short stream now fails fast) and takes an optional `maxSize`.
- 2026-10-15: Argument checks are marked `// lean-cut` so the packer can leave them out of packed pages.
