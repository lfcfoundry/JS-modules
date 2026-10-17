# lzma-pack changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.1 · API 1 · 2026-10-17
Every page policy given with --head now carries 'wasm-unsafe-eval' in script-src, the one addition the project allows. Before: the packer only printed a warning when --head set a policy without it, and the page quietly fell back to the slower JavaScript decoder (the first decode took about 2.1x as long in Chromium and 1.7x as long in Firefox without WebAssembly; measured on a 569,513-byte game page). After: the packer adds the token itself (4 of 4 browsers ran the WebAssembly decoder from a policy given without it); a policy with no script-src but a default-src gets a script-src built from the default-src sources plus the token, a policy that says nothing about scripts is left alone, and a page with no --head policy still gets none. Nothing else in the policy changes.

Tested in: ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time (tests/lzma-wasm-browser.js, a policy given without the token came out carrying it and the WebAssembly decoder ran in all four); 24 packer checks pass. Not run: a phone or Safari itself

## 1.1.0 · API 1 · 2026-10-17
New option --wasm (off by default): the packed page also carries the WebAssembly LZMA decoder and tries it first, with the JavaScript decoder as the fallback. The page grows by about 4.5 KB (148,360 to 152,880 bytes for Pineapple Defense, +3.0%; smaller is better) and starts 14 to 30 ms sooner on a desktop (ungoogled-chromium 155: 104.0 to 77.7 ms; Firefox 158.0: 150.0 to 132.0; WebKitGTK 2.52.6: 84.0 to 70.0; GNOME Web 46.5: 111.0 to 88.0; smaller is better). The page needs wasm-unsafe-eval in its Content-Security-Policy to use it; without it, Chromium and Firefox fall back by themselves. The packer's own check now runs the loader four ways in Node (with the decoder, no WebAssembly, refused WebAssembly, wrong length) and the packer says so when --head sets a policy without wasm-unsafe-eval. Without --wasm, and with a minifier, the packed pages are byte for byte the same as before (checked on Pineapple Defense and the example page, both encodings).

Tested in: Node 22.22.0 (340 lzma-decode checks, 23 lzma-pack checks); tests/lzma-wasm-browser.js one browser at a time on 2026-10-17: Firefox 158.0 (reports 158.0b5), ungoogled-chromium 155.0.8059.39-1, WebKitGTK 2.52.6 (MiniBrowser), GNOME Web (Epiphany) 46.5; tools/lzma-pack/test/browser.py in ungoogled-chromium 155.0.8059.39-1

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Chromium (version not recorded; 14 browser checks); Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`; the real Fancy the Banana page (original, packed, packed and minified) loaded the same in Firefox 158 and ungoogled Chromium 155 (a load check, not a play-through, noted 2026-10-15). Not run: WebKitGTK, a phone.

## Before version labels

- Early October 2026: First version: packs one HTML file into a smaller self-unpacking file with LZMA and a hash check.
- 2026-10-15: The unpacked payload no longer leaves a global variable behind; added a Node round-trip check, a UTF-8 check and an "Opening..." line.
- 2026-10-15: Loader 527 bytes smaller (2,867 to 2,340 on the example); new opt-in `--minify-page` for the page's own scripts. Examples rebuilt.
- 2026-10-16: Examples rebuilt again so their credit link points at lfcfoundry.
