# lzma-pack changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- Early October 2026: First version: packs one HTML file into a smaller self-unpacking file with LZMA and a hash check.
- 2026-10-15: The unpacked payload no longer leaves a global variable behind; added a Node round-trip check, a UTF-8 check and an "Opening..." line.
- 2026-10-15: Loader 527 bytes smaller (2,867 to 2,340 on the example); new opt-in `--minify-page` for the page's own scripts. Examples rebuilt.
- 2026-10-16: Examples rebuilt again so their credit link points at lfcfoundry.
