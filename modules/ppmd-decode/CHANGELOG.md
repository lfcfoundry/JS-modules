# ppmd-decode changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: 118 Node checks; a Chromium page check (version not recorded); decode speed measured in ungoogled Chromium 155 and Firefox 158 (Firefox timing is noisy); cold start measured in Chromium 141 on 2026-10-16. Not run: WebKitGTK, a phone.

## Before version labels

- 2026-10-15: New module: a PPMd (7-Zip's PPMd7) decoder in one ES5 function, checked byte for byte against the C reference encoder.
- 2026-10-16: Measured the cold start (about 20 ms extra on a 30 KB stream, none visible on a large page); no warm-up was added.
