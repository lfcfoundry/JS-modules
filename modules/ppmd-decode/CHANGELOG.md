# ppmd-decode changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.3.0 · API 1 · 2026-10-18
- The wasm now compiles in the background when the file loads (ready() and module() added); the compile it saves is about 1 ms. Same bytes out.

## 1.2.0 · API 1 · 2026-10-18
- The default file is now ppmd-decode-with-wasm.js: ppmd7Decode tries WebAssembly first and uses the JavaScript decoder by itself when it cannot. About 1.4 to 1.8 times faster to open a page in the four test browsers.

## 1.1.0 · API 1 · 2026-10-17
- New optional WebAssembly version of the decoder, about twice as fast to open a page and with no warm-up. Same results.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- 2026-10-15: New module: a PPMd (7-Zip's PPMd7) decoder in one ES5 function, checked byte for byte against the C reference encoder.
- 2026-10-16: Measured the cold start (about 20 ms extra on a 30 KB stream, none visible on a large page); no warm-up was added.
