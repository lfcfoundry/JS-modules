# lzma-pack changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 2.0.1 · API 2 · 2026-10-31
- Packed pages made with base64 encoding now unpack with the browser's own base64 decoder (Uint8Array.fromBase64) where there is one, which is faster; older browsers use the old way. About 40 bytes more loader.

## 2.0.0 · API 2 · 2026-10-18
- Packed pages now carry the WebAssembly decoder by default (about 4.5 KB or 3% bigger, opens faster); --no-wasm gives the old smaller page. --wasm still works.

## 1.1.2 · API 1 · 2026-10-17
- Faster packing with identical pages: choosing the key took seconds before and now takes a fraction of a second.

## 1.1.1 · API 1 · 2026-10-17
- A page policy given to the packer now always allows WebAssembly, the one addition the project allows, so the faster decoder is used.

## 1.1.0 · API 1 · 2026-10-17
- New optional --wasm adds the WebAssembly decoder to the packed page (about 3% bigger), which starts 14 to 30 ms sooner on a desktop.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- Early October 2026: First version: packs one HTML file into a smaller self-unpacking file with LZMA and a hash check.
- 2026-10-15: The unpacked payload no longer leaves a global variable behind; added a Node round-trip check, a UTF-8 check and an "Opening..." line.
- 2026-10-15: Loader 527 bytes smaller (2,867 to 2,340 on the example); new opt-in `--minify-page` for the page's own scripts. Examples rebuilt.
- 2026-10-16: Examples rebuilt again so their credit link points at lfcfoundry.
