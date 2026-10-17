# ppmd-pack changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.1 · API 1 · 2026-10-17
Faster packing with the same pages: it uses lzma-pack's new byte-pair counting to choose the XOR key instead of trying all 256 keys over the payload (the key search was 11.7 of the 17 s the test took when profiled). Packing a 38 KB page went from 0.77 s to 0.35 s (2.2 times faster; lower is better) with an identical output file; the tool's own test went from 6.5 s to 4.1 s. The PPMd encoder itself is unchanged and is now most of the time

Tested in: Python 3 tests of the packer (lzma-pack 25 checks, ppmd-pack 30 checks); the packed page is byte for byte the same as before on a 38 KB sample, so the earlier browser results (ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5) still stand; not rerun in a browser, not run on a phone

## 1.1.0 · API 1 · 2026-10-17
New and optional: --wasm also ships the WebAssembly PPMd decoder (modules/ppmd-decode/wasm/ppmd7.wasm, 9,317 bytes, stored raw behind the PPMd data). The loader tries it first and falls back to the JavaScript decoder, which stays in the page, so a page whose policy forbids WebAssembly still opens. Measured on the 703,049-byte Apple Press page (median of 5 fresh page loads; time until the page is unpacked, lower is better): PPMd 313 to 194 ms in ungoogled Chromium 155 (1.6 times faster), 313 to 204 in Firefox 158 (1.5 times), 392 to 184 in WebKitGTK 2.52.6 (2.1 times), 376 to 182 in GNOME Web 46.5 (2.1 times). The page grows by 9,760 bytes (188,602 to 198,362; smaller is better), so with --wasm it is 6.8 KB bigger than the LZMA page (191,584) and still opens 1.6 to 3 times slower than it (LZMA 106 to 120 ms); use it only when PPMd wins by more than that, or when the PPMd page is already chosen. The self-check now runs the page four ways in Node (plain, WebAssembly, WebAssembly refused, decoder answering wrongly); 6 new checks, 30 in all (24 before). Pages made without --wasm are byte for byte what 1.0.1 made (checked on the Apple Press page).

Tested in: Node 22 (30 checks), ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5 (page open times and the page-that-forbids-WebAssembly fallback); not run: a phone, Safari itself

## 1.0.2 · API 1 · 2026-10-17
Same page-policy rule as lzma-pack 1.1.1: a Content-Security-Policy given with --head now carries 'wasm-unsafe-eval' in script-src (the packer reuses lzma-pack's rewrite). Before: nothing was added or warned about. After: the token is added (1 new check; 24 of 24 packer checks pass, 3 skipped as before), everything else in the policy is unchanged, and a page with no --head policy still gets none. This makes the coming --wasm mode work under a page policy without a manual edit.

Tested in: 24 packer checks pass (3 need tools not present here and are skipped, as before); the policy rewrite is lzma-pack's, shared, and ran in ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5 through tests/lzma-wasm-browser.js

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
