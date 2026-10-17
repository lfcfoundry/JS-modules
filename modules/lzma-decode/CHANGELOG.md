# lzma-decode changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: 140 Node checks against Python's `lzma`; the 14 `lzma-pack` browser checks in Chromium (version not recorded); Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`; the Fancy the Banana load check in Firefox 158 and ungoogled Chromium 155 (see lzma-pack). Not run: WebKitGTK, a phone.

## Before version labels

- Early October 2026: First version: a small LZMA decoder for self-unpacking pages.
- 2026-10-15: Stops early on cut-off input (a 64 MB claim on a short stream now fails fast) and takes an optional `maxSize`.
- 2026-10-15: Argument checks are marked `// lean-cut` so the packer can leave them out of packed pages.
