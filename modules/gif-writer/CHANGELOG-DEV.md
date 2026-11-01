# gif-writer developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.6.2 · API 1 · 2026-10-31

### Quick
Embedded base64 decode uses Uint8Array.fromBase64 when present, falling back to the atob loop (or Buffer in Node).

### Deep
Embedded base64 decode uses Uint8Array.fromBase64 when present, falling back to the atob loop (or Buffer in Node). Same bytes: 20 of 20 embedded programs compared in Chromium 155, Firefox 158 and WebKitGTK 2.52.6. Decode time of all embedded programs, fromBase64 / atob loop: Chromium 0.18, Firefox 0.11, WebKitGTK 0.08 (cloud). Tests pass on both paths (Node 22 has no fromBase64, so the new path ran under a Buffer shim).

## 1.6.1 · API 1 · 2026-10-30

### Quick
WebAssembly picture effects: blur in 16-bit lanes (32-bit above radius 128), sharpen 4 bytes per step, glow column terms once per column, grade two pixels per step when there is no vignette. 0.67 to 1.00x the time for every filter at 480x270, 960x540 and 1920x1080 in three browsers; same bytes.

### Details
wasm/pixfx.c from research brief E (round 2), rebuilt with wasm/build-fx.sh (pixfx.wasm 9,193 bytes) and embedded with embed-fx.py. glow_up uses a static table for up to 8,192 columns; wider pictures take the old loop. Container medians at 1920x1080, old to new ms: blur 3 Chromium 68.5 to 54.5, Firefox 61 to 52, WebKitGTK 70 to 56; glow 0.6 104 to 80, 88 to 67, 103 to 75; Soft dream preset 127 to 95, 109 to 85, 128 to 94; everything 172 to 150, 151 to 130, 194 to 171. 60 random filters and sizes gave the same bytes in every browser; test/fx-wasm.js, fx.js and run.js pass.

### Deep
gif-writer 1.6.1: faster WebAssembly picture effects (brief E). Same bytes (60 random filters x 3 browsers + 15 timed cases). New/old time: Chromium 0.68-0.88, Firefox 0.67-1.00, WebKitGTK 0.71-1.00 (480x270 to 1920x1080; the 1.00s are 1 ms timer steps at 480x270).

## 1.6.0 · API 1 · 2026-10-30

### Quick
Optional thorough palette: counts every pixel for slightly smaller files.

### Deep
New makePalette option thorough: true counts every pixel instead of a sample (off by default). About 1 to 1.6 percent smaller files on noisy animations for about 4 times the palette time. Same default output as 1.5.1.

## 1.5.1 · API 1 · 2026-10-27

### Quick
A frame delay above 655,350 ms is capped instead of wrapping in the GIF's 16-bit field.

## 1.5.0 · API 1 · 2026-10-25

### Quick
Optional picture filters, animation timing, a worker and a size tolerance, cut from Netflow Map.

### Deep
Shipped in JS-modules PR 176.
New optional files from Netflow Map: gif-writer-fx.js (picture filters: color grade, blur, sharpen, glow, vignette, nine presets; easing, exact GIF delays so 25 FPS is exactly 4 hundredths each, turn plans), gif-writer-worker.js (filter and write a GIF off the page), gif-writer-card.js (the same filters on the graphics card, falling back to WebAssembly), and a tolerance option on createEncoder that leaves nearly unchanged pixels transparent for smaller files. A 3.8 KB SIMD WebAssembly build of the filters gives the same bytes as the JavaScript in 125 test cases and in all three browsers; in Netflow Map's own measurement it cut the full filter chain from 9.7 to 3.9 s in WebKitGTK, 5.7 to 2.9 s in Firefox and 5.4 to 3.2 s in Chromium with one worker. The default write path of gif-writer.js is unchanged.

## 1.4.0 · API 1 · 2026-10-24

### Quick
Faster palette search on big inputs (3x fewer pixels looked at above 100,000 pixels, from 143-152 ms to about 55 ms for 8 pictures of 160x160). A GIF made from such pictures is not byte-identical to one from 1.3.0.

### Deep
Palette search (makePalette, WebAssembly and plain JS, same colors) now looks at about every 3rd pixel instead of every pixel once the pictures hold more than 100,000 pixels in all (every 5th above 1,000,000 pixels; before, every 2nd above 1,000,000 and every pixel below). THE OUTPUT BYTES CHANGE: a GIF from 1.4.0 is not byte-identical to one from 1.3.0 for such inputs (a different palette, and so different pixel indexes and file size). The step is an odd number moved up until it has no common factor with the picture's pixel count, so it cannot divide the width or the height. If the sample shows fewer than 4,096 distinct colors (flat, game, pixel-art pictures, most UI screenshots), the pictures are counted the old way (every pixel), so those palettes and files are byte-identical to 1.3.0. Measured in the test browsers, makePalette alone for 8 photo-like pictures of 160x160, warm median of 15 alternating turns, lower is better: Measured warm medians of 15 alternating turns, one fresh page per turn, makePalette alone for 8 photo-like pictures of 160x160 (lower is better, ms): Chromium 155 142.2 to 54.2 (-62%), Firefox 158 148.0 to 57.0 (-61%), WebKitGTK 2.52.6 150.0 to 58.0 (-61%); palette + 8 frames + finish 186.9 to 96.8, 191 to 101, 194 to 104 (-46 to -48%). Screenshot/UI pictures (8 x 240x180) and flat game-like pictures (12 colors): no change within the clock step (0 to +1 ms; 40-turn re-run 0 to 3%, one Firefox 6 to 7 ms cell is the 1 ms clock step). Picture error (mean eye-weighted error per channel of all pixels to the nearest palette color, Node, deterministic), old to new: photo-like 160x160 7.222 to 7.236 (+0.19%), 192x144 6.973 to 6.993 (+0.29%), gradient 3.750 to 3.753 (+0.10%), one-pixel lines on photo 7.222 to 7.226 / 6.944 to 6.940 / 8.159 to 7.982 (-2.2%), screenshot/UI 1.521 to 1.521 and 1.731 to 1.731 (same bytes), pixel-art 16 colors and 300 colors 0 change and no color missing. Not byte-identical: on photo-like and gradient pictures the GIF size changes (-0.2% photo, +4.2% gradient 32,047 to 33,384 bytes). Checks: modules/gif-writer/test/run.js (3 new), tests/gif-writer-browser.js and tests/gif-writer-wasm-browser.js in all three browsers, kits --quick --changed (only the 2 known version problems about other modules). Details: /mnt/project-files/js-modules-research/gif-writer-palette-stride/RESULT-three-browsers.md.

## 1.3.0 · API 1 · 2026-10-22

### Quick
The WebAssembly program now starts compiling in the background when the file loads; adds wasmReady() and wasmModule().

### Deep
Compile early: gif-writer.js starts WebAssembly.compile for its 8 KB program when the file loads; the first palette or encoder only starts it. Asked for before the compile is done it compiles on the spot as before; with no WebAssembly nothing changes. New GifWriter.wasmReady() and GifWriter.wasmModule(). Same colors and bytes. Load plus first use, ms, old / new, median of 9 fresh pages, right after load / 250 ms later (bigger ratio is better): Chromium 155 8.3 / 8.7 and 7.8 / 7.9 (0.95x, 0.99x), Firefox 158.0 20 / 20 and 19 / 19, WebKitGTK 2.52.6 3 / 3 and 4 / 3 (1.00x, 1.33x), GNOME Web 46.5 6 / 6 and 5 / 5. Level within about 1 ms; Chromium right after load about 0.4 ms slower.

## 1.2.0 · API 1 · 2026-10-18

### Quick
Pictures are written 1.1 to 2.3 times faster and palettes up to 1.7 times faster with WebAssembly, same colors and bytes. The palette for flat pictures is up to 11% slower in the two WebKit browsers. The fast path needs 'wasm-unsafe-eval'.

### Deep
WebAssembly palette search and picture encoder (9,903 bytes, wasm/gif.c, embedded in gif-writer.js), used first with the JavaScript code as the fallback (makePalette(pics, n, { wasm: false }) and createEncoder(w, h, pal, { wasm: false }) force it; GifWriter.wasmAvailable() reports it). Same colors and same GIF bytes: 116 palette sets and 21 encoder scenes identical in Node; 18 of 18 GIFs and palettes identical in every one of 18 browser runs, also on a page without 'wasm-unsafe-eval'. Speed, 30 pictures of 640 x 480, median of 3 passes (JavaScript ms to WebAssembly ms; times faster, higher is better). Encoding, Chromium 155 / Firefox 158 / WebKitGTK 2.52.6 / GNOME Web 46.5: photo 868 to 402 (2.16x) / 901 to 399 (2.26x) / 628 to 390 (1.61x) / 734 to 394 (1.86x); flat game picture 1.67x / 2.04x / 1.43x / 1.53x; small moving block 1.47x / 1.52x / 1.08x / 1.11x; scrolling bands 1.81x / 2.02x / 1.56x / 1.50x. Palette search: photo 552 to 338 (1.63x) / 580 to 391 (1.48x) / 439 to 351 (1.25x) / 565 to 365 (1.55x); flat game picture 1.51x / 1.74x / 0.97x / 0.97x; small moving block 1.41x / 1.40x / 1.07x / 0.95x; scrolling bands 1.41x / 1.53x / 0.89x / 0.99x. A first small GIF on a fresh page: 44 to 21 ms / 34 to 19 / 25 to 24 / 28 to 24. Slower cases (over 5%, owner's OK needed): WebKitGTK scrolling-bands palette 0.89x (14.5 to 16.3 ms), GNOME Web small-block palette 0.95x (19.8 to 20.8 ms); the flat game picture is 0.97x in both WebKit browsers (inside the clock's 1 ms step). Cause: every picture is copied into WebAssembly memory, which the run-walking JavaScript counter avoids. Built after a first version that lost 9% on scrolling bands in encoding: the wasm LZW coder now walks runs like the JavaScript coder (encoding 1.5x to 2.0x there), and the palette copy goes in pieces of 16,384 pixels (WebKitGTK flat-picture palettes moved from 0.87x to 0.89x to 1.07x). Size (smaller is better, terser 5.51.2): 20,789 to 40,913 bytes as written; 9,115 to 25,310 minified; 4,349 to 12,278 gzipped. Size ceilings are suspended by the owner's rule 2026-10-19. Time and compute: 3 passes x 4 browsers (about 7 minutes each pass), plus 3 WebKit passes with batched timing, on one cloud container.

## 1.1.0 · API 1 · 2026-10-17

### Quick
Busy, photo-like animations now make their GIF about 1.3 to 3 times faster to prepare in the four test browsers, and the pictures are written faster too.

### Deep
Making the palette for a busy animation (a smooth, photo-like animation of 30 pictures, 640 x 480, about 513,000 different colors) now takes about 0.4 s instead of 0.8 s in Node (2.05 times faster), 1.7 times in Firefox 158, 3.0 times in WebKitGTK 2.52.6, 2.95 times in GNOME Web 46.5 and 1.3 times in Chromium 155 (one run of 3 each, so Chromium is rough; a second Chromium run gave 1.4 times). Writing the pictures into the GIF is also about 1.7 to 2.2 times faster for such an animation (Node 1,326 to 599 ms). An animation with few colors (7 colors) is unchanged, about 30 ms for the palette. The palette and the GIF bytes are exactly the same as in 1.0.0: 1,000 random sets of pictures (all kinds, large and small, odd memory offsets, ties) gave 0 different bytes, and 7 fixed scenes are now checked by the module test against what 1.0.0 wrote. How: the color count is kept in one table instead of two, the median cut finds each cut by counting instead of sorting, and the nearest-color searches (palette refinement and the encoder) look outward from the color's green value and stop early instead of checking all 255 colors. The file grows by about 4.5 KB (16,260 to 20,789 bytes, smaller is better).

## 1.0.0 · API 1 · 2026-10-17

### Quick
New module: turns pictures drawn on a canvas into an animated GIF in the browser or in Node, with no libraries. Colors stay steady from picture to picture and only the changed part of each picture is written, so files stay small.

### Deep
New module, cut from Netflow Map's GIF maker. It turns pictures drawn on a canvas into an animated GIF, in the browser or in Node, with no libraries. It keeps one color palette for the whole animation (so nothing flickers) and writes only the part of each picture that changed. Measured in Node on 30 pictures of 640 x 400 with a small ball moving on a still background: 23.3 KB in 101 ms, where gifenc 1.0.3 made 159 KB in 152 ms (about 6.8 times larger). When every pixel changes in all 20 pictures: 1.09 MB in 562 ms against gifenc's 1.14 MB in 294 ms (about 5% smaller, about 1.9 times slower). Changes from the Netflow Map original: a stale comment fixed and the test now lives in the module's own folder (an independent GIF decoder checks every pixel).
