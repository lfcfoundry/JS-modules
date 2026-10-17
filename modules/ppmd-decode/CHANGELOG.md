# ppmd-decode changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
New and optional: ppmd-decode-wasm.js (16.8 KB file, holding a 9,317-byte WebAssembly program built from wasm/ppmd7.c) adds ppmd7DecodeWasm, the same decoder with the same arguments, bytes and error texts, about twice as fast and without the warm-up the JavaScript version needs. Decoding a 400,000-byte page (90,444 bytes packed) on a freshly opened page, load and compile included: 159 to 71 ms in Node 22 (2.2 times faster), 159 to 84 in ungoogled Chromium 155 (1.9 times), 143 to 80 in Firefox 158 (1.8 times), 175 to 75 in WebKitGTK 2.52.6 (2.3 times), 181 to 82 in GNOME Web 46.5 (2.2 times); decoding again in the same page: 95 to 46 ms in Node (2.1 times), 98 to 46 in Chromium (2.1 times), 190 to 79 in Firefox (2.4 times), 89 to 47 in WebKitGTK (1.9 times), 90 to 50 in GNOME Web (1.8 times). Same answers: 15 fixtures, 160 more streams and 798 damaged copies of them gave the same bytes or the same error text through both decoders (0 differences); 13 new checks, 131 in all (118 before). On a page that forbids WebAssembly, or without it, every call is handed to the JavaScript decoder (checked in all four browsers). ppmd-decode.js itself is unchanged (26,175 bytes), and tools/ppmd-pack does not use the add-on yet because a packed page would then carry both decoders.

Tested in: Node 22, ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5 (decode checks, timings, and the page-without-WebAssembly fallback in all four browsers); not run: a phone, Safari itself

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: 118 Node checks; a Chromium page check (version not recorded); decode speed measured in ungoogled Chromium 155 and Firefox 158 (Firefox timing is noisy); cold start measured in Chromium 141 on 2026-10-16. Not run: WebKitGTK, a phone.

## Before version labels

- 2026-10-15: New module: a PPMd (7-Zip's PPMd7) decoder in one ES5 function, checked byte for byte against the C reference encoder.
- 2026-10-16: Measured the cold start (about 20 ms extra on a 30 KB stream, none visible on a large page); no warm-up was added.
