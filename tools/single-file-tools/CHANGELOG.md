# single-file-tools changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.3.0 · API 1 · 2026-10-31
- New latin1.py keeps a page Latin-1 only (and --check fails a build that is not), so the browser stores it at 1 byte per character; pack.py and build-example.sh use it.

## 1.2.1 · API 1 · 2026-10-31
- Packed pages made with base64 encoding now unpack with the browser's own base64 decoder (Uint8Array.fromBase64) where there is one, which is faster; older browsers use the old way. About 40 bytes more loader.

## 1.2.0 · API 1 · 2026-10-24
- Fonts with double-quoted family names are now shrunk too, and the packer can read your page's background color with --bg auto.

## 1.1.0 · API 1 · 2026-10-16
- The packer can make files about 23% smaller to hand out and now defaults to a faster setting.
- More pictures are handled.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- Early October 2026: First version: font subsetting, safe inline-SVG tightening and a Zopfli self-extracting packer.
- 2026-10-15: Font license notices are kept, CSS escapes are read correctly, and tests were added.
- 2026-10-15: The Zopfli packer shows a "Loading..." page (`--bg`) instead of a white one.
