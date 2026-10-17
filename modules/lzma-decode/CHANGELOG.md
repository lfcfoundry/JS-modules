# lzma-decode changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
New optional file lzma-decode-wasm.js: the same decoder in WebAssembly (4,087 bytes). First decode of a 569,513-byte page takes 20.1 ms instead of 40.8 ms in ungoogled-chromium 155 (2.03 times as fast), 18.0 instead of 35.0 in Firefox 158.0 (1.94 times), 24.0 instead of 36.0 in WebKitGTK 2.52.6 (1.50 times), 28.0 instead of 44.0 in GNOME Web 46.5 (1.57 times); higher is better for the ratio, smaller for the milliseconds. Same bytes, same error messages; pages that forbid WebAssembly, settings with lc + lp above 4 and bad streams go to the JavaScript decoder. lzma-decode.js itself only got its version line and stays the default.

Tested in: Node 22.22.0 (340 lzma-decode checks, 23 lzma-pack checks); tests/lzma-wasm-browser.js one browser at a time on 2026-10-17: Firefox 158.0 (reports 158.0b5), ungoogled-chromium 155.0.8059.39-1, WebKitGTK 2.52.6 (MiniBrowser), GNOME Web (Epiphany) 46.5; tools/lzma-pack/test/browser.py in ungoogled-chromium 155.0.8059.39-1

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: 140 Node checks against Python's `lzma`; the 14 `lzma-pack` browser checks in Chromium (version not recorded); Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`; the Fancy the Banana load check in Firefox 158 and ungoogled Chromium 155 (see lzma-pack). Not run: WebKitGTK, a phone.

## Before version labels

- Early October 2026: First version: a small LZMA decoder for self-unpacking pages.
- 2026-10-15: Stops early on cut-off input (a 64 MB claim on a short stream now fails fast) and takes an optional `maxSize`.
- 2026-10-15: Argument checks are marked `// lean-cut` so the packer can leave them out of packed pages.
