# ppmd-pack changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.1 · API 1 · 2026-10-17
Fixed: packing a page failed every time with 'TypeError: Cannot read properties of undefined (reading forEach)' unless you passed --skip-node-check, since lzma-pack 1.1.0 changed the Node check it shares (7 of the 26 tool checks failed). It now asks the shared check for the plain mode only, as before, and reads its list of answers. After the fix: 23 of 23 checks that can run here pass, and the Node check runs again (nothing else changes in the packed page).

Tested in: tools/ppmd-pack/test/run.py in Python 3 with Node 22.22.0: 23 passed, 0 failed, 3 skipped (no terser or esbuild installed here). Browsers not involved: the fix is in the packer's own Node check.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: 24 Python checks plus a Chromium page check (version not recorded); unpack timings taken in Firefox 158 and Chromium 155. Not run: WebKitGTK, a phone.

## Before version labels

- 2026-10-15: New tool: packs one HTML file with PPMd; a pure Python encoder, byte-identical to 7-Zip's.
- 2026-10-15: Every packed page now starts with a credit comment (Shkarin, Pavlov, 7-Zip).
- 2026-10-16: Examples rebuilt so their credit link points at lfcfoundry.
