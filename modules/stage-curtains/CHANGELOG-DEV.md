# stage-curtains developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.4.1 · API 1 · 2026-10-31

### Quick
worker: true: prepare() resolves when the worker's pixels arrive, not at the next idle slice; same pixels, no new options. Chromium 1.7 to 2.5x sooner, Firefox 2.8 to 4.4x, WebKitGTK 1.5 to 2.0x.

### Details
Round 5 pool study. (1) Wake on arrival: the worker's message now steps the painters at once when prepare() is resting between slices (guarded so only one slice loop runs; a resting timer is cleared first). Alone: Chromium 1.52 to 2.33x sooner, Firefox 2.78 to 4.38x, WebKitGTK 1.49 to 1.96x. (2) No copy: the arrived buffer is wrapped in an ImageData instead of copied into one (copy kept where ImageData is missing). Alone 0.98 to 1.04x (noise). Both: Chromium 1.71/2.53x, Firefox 2.78/4.38x, WebKitGTK 1.53/1.96x (1920x1080 / 1280x720). The third idea (one worker per half) was left out: the research run showed no clear gain on 4 cores; it needs the laptop page.

### Deep
tests/stage-curtains-wake-browser.js (time to prepare(), 15 rounds, modes via the _test switches copy/noWake); same pixels: tests/stage-curtains-worker-browser.js 12/12 halves in all three browsers; modules/stage-curtains/test/run.js 46 passed.

## 1.4.0 · API 1 · 2026-10-24

### Quick
The curtain's velvet paints 60 to 70% faster in a browser with WebAssembly SIMD. The picture matches the plain-JavaScript one to within 5 of 255 on 99.99% of pixels; stepped curtains are unchanged.

### Deep
Option B, SIMD kernel for the velvet WebAssembly loop (wasm/velvet.c, built with -msimd128): four pixels per step in single precision (f32x4), one fold-table row gathered per pixel and transposed with shuffles, branch-free clamp through saturating integer conversion; the scalar double loop (exact) takes stepped curtains and the last width % 4 columns of each row. The JavaScript loop row() stays the reference and the fallback: a browser without WebAssembly SIMD cannot compile the module, kernel() is null and JavaScript paints (simulated and checked in all three browsers; wasmAvailable() is false then). velvet.wasm 1,307 (1.3.1) / 1,510 (1.3.0) to 2,567 bytes (+3,424 base64 characters in stage-curtains.js); the page builds one more table (single-precision copy, 9n + 3 (cw + 8) + 4096 floats, skipped for stepped curtains). Picture: NOT byte for byte for smooth curtains, within the module's picture gate (99.5% of pixels within 5/255 on every channel of the JavaScript loop's picture). Over the 412 test curtains (8 colors x 7 sizes x stepped on and off, plus 300 random) the worst has 99.986% within 5 and 99.951% byte-identical, none below 99.5%, largest single difference 56 counts (a few pixels where the fold index lands on the other side of a half or at a crease or hem edge); the 1280 x 720 benchmark half has 99.9998% within 5 (largest difference 6), the same in Chromium, Firefox and WebKitGTK. Stepped curtains are byte for byte the JavaScript curtain (checked 112 + 300 curtains in Node, 112 in each browser, and the 1280 x 720 hash). The Node and browser tests that compared wasm to JavaScript byte for byte (112 curtains, 300 curtains, slicing, two painters; browser part 1) now use the picture gate for smooth curtains and stay byte exact for stepped ones; new browser part 4 simulates no SIMD. Main-thread paint of one 1280 x 720 curtain (both halves plus mirror; 15 alternating turns, one fresh page per build per turn; milliseconds, lower is better), 1.3.0 to 1.4.0: Chromium 155.0.8059.39 smooth warm 45.4 to 13.7 (-70%), first in a fresh page 54.2 to 26.2 (-52%), stepped warm 9.8 to 6.9 (-30%); Firefox 158.0 40 to 15 (-63%), 44 to 22 (-50%), 9 to 6 (-33%); WebKitGTK 2.52.6 38 to 13 (-66%), 49 to 27 (-45%), 9 to 7 (-22%). Chromium full rigor (40 turns x 3 passes, same-file control within 1 ms): warm 45.0 to 13.8, cold 55.7 to 25.4, stepped cold 17.6 to 16.2 (not slower than 1.3.0 or 1.3.1; the larger module costs under 1 ms to compile). Nothing measured slower than 1.3.0. Browser worker test (phone-size half, Chromium 155, page thread busy): page-painted 21.7 ms on 1.3.1 and 9.4 ms on 1.4.0, worker-painted 8.4 and 5.8 ms; both halves ready 22 to 9.6 ms on the page, 47.8 to 29.5 ms with the worker. Headless software canvas: a real GPU upload is not measured; no pixel inspection by eye. Node was used for pass/fail only.

## 1.3.1 · API 1 · 2026-10-24

### Quick
The curtain's velvet paints 27 to 34% faster (WebAssembly loop reads per-column tables). Same picture, byte for byte.

### Deep
Option A, exact scalar rewrite of the velvet WebAssembly kernel (wasm/velvet.c): per-canvas-column (position, leading-edge ratio) and per-fold-column (hem, shade, sheen, gold base, crease flag) tables built once in JavaScript with the same expressions row() uses, integer rounding of the fold index, branch-free clamp (add-and-subtract 1.5 x 2^52), crease loop skipped on columns no crease can touch, one 32-bit store per pixel; build flag -mnontrapping-fptoint added. velvet.wasm 1,510 to 1,307 bytes. Same bytes: the wasm picture is byte-identical to 1.3.0 and to the plain JavaScript loop (same FNV hash of a 1280 x 720 curtain, smooth and stepped, in all three browsers; 112 + 300 curtains byte for byte in the Node suite; 112 curtains 0 differ in each browser). Main-thread paint of one 1280 x 720 curtain (both halves plus mirror, 15 alternating turns, one fresh page per build per turn; milliseconds, lower is better), 1.3.0 to 1.3.1: Chromium 155.0.8059.39 smooth warm 45.6 to 30.0 (-34%), first in a fresh page 53.8 to 39.6 (-26%), stepped warm 9.8 to 7.7 (-21%); Firefox 158.0 40 to 28 (-30%), 48 to 34 (-29%), 9 to 7 (-22%); WebKitGTK 2.52.6 37 to 27 (-27%), 45 to 35 (-22%), 9 to 7 (-22%). Nothing measured slower. Firefox and WebKitGTK clocks step 1 ms. Headless software canvas: a real GPU upload is not measured. Node was used for pass/fail only.

## 1.3.0 · API 1 · 2026-10-18

### Quick
New option create({ worker: true }) paints the curtain in a background worker: the page does 3 to 7 ms of work instead of 21 to 36 ms. Same picture.

### Deep
New option create({ worker: true }) and StageCurtains.startWorker() / release(). The velvet is painted in one shared background worker built from the painter's own source; falls back to the page (same pixels) when Worker, blob URLs or the page policy (worker-src blob:) are missing or the worker fails. Same picture: 12 of 12 curtains identical with the worker allowed and 12 of 12 with it refused, in all four browsers; 60 of 60 identical to the 1.2.0 painter in Node. Page busy time getting both halves painted, median of seven fresh pages, now to worker (lower is better): Chromium 155 24.8 to 5.9 ms, Firefox 158.0 21 to 5, WebKitGTK 2.52.6 23 to 3, GNOME Web 46.5 36 to 7. Longest single stall: 8.3 to 2.6, 9 to 2, 9 to 1, 10 to 4. Both halves ready (lower is better): 25.3 to 49.1, 23 to 41, 26 to 42, 37 to 53 when the worker starts cold; with startWorker() 150 ms earlier: busy 25 to 3.9, 22 to 4, 24 to 4, 35 to 3; ready 25.4 to 33.4, 24 to 29, 28 to 37, 36 to 39. Off by default (no behavior change without the option). Size: +2,422 minified, +951 gzipped. 46 Node checks pass (9 new: pretend Worker, fallbacks for throws/error/no Worker, release, create). Records: tests/stage-curtains-worker-browser.js.

## 1.2.0 · API 1 · 2026-10-18

### Quick
A curtain half paints about 1.4 to 1.6 times faster on a freshly loaded page (same picture) using a small WebAssembly painter. Pages with a content policy need 'wasm-unsafe-eval'; without it, plain JavaScript is used.

### Deep
WebAssembly velvet loop. The pixel loop behind prepare() now runs as a 1,510-byte WebAssembly function embedded in stage-curtains.js, with the plain JavaScript loop as the fallback (create({ wasm: false }) forces it). First paint of one phone-size curtain half (295,475 pixels) on a freshly loaded page, median of three passes of seven fresh pages, plain JavaScript to WebAssembly in ms (lower is better; times faster, higher is better): Chromium 155.0.8059.39-1 23.9 to 17.0 (1.38x, range 1.36 to 1.63x); Firefox 158.0 23.0 to 14.0 (1.64x, 1.62 to 1.64x); WebKitGTK 2.52.6 24.0 to 17.0 (1.41x, 1.28 to 1.53x); GNOME Web 46.5 30.0 to 21.0 (1.48x, 1.17 to 1.50x). The picture is identical: 112 curtains, 0 pixels differ in 12 of 12 runs, and the same 112 on a page without the wasm permission, where the module uses plain JavaScript by itself. Plainly where little changed: a repeat paint in the same page gains only 1.0 to 1.36x; the slowest single step(4) call stays at 4 to 5 ms in every browser (0.98 to 1.00x), so frame pacing is unchanged; the valance texture stays plain JavaScript. Cost: +3,923 bytes minified (15,353 to 19,276) and +2,038 gzipped (6,275 to 8,313), 36,953 bytes as written (smaller is better). Pages with a Content Security Policy need 'wasm-unsafe-eval' in script-src, nothing else. Source wasm/velvet.c, rebuild wasm/build.sh, embed wasm/embed.py, both with --check. Not measured: a phone, Safari, and the gain on slower processors (an estimate only).

## 1.1.0 · API 1 · 2026-10-17

### Quick
On a very busy page the curtain now lifts about 3.6 to 5.7 times sooner. A quiet page is unchanged.

### Deep
Painting ahead on a busy page: on a page that never has a quiet moment (the test page is busy 18 ms of every 16.7 ms frame), the curtain was ready after 3.6 s in Chromium and 3.5 s in Firefox; now 1.0 s and 0.6 s (about 3.6 and 5.7 times faster). With the processor slowed 4 times in Chromium: 13.4 s before, 3.2 s now. The browser's forced turn now comes after 250 ms instead of 800 ms and paints a slice of 5 ms instead of 2.5 ms. Nothing changes on a quiet page (0.28 to 0.34 s before, 0.23 to 0.30 s now). Closing without painting ahead: `close()` used to paint everything in one block, freezing the page for up to 31 ms in Chromium, 31 ms in Firefox, 19 ms in WebKitGTK (128 ms with the processor slowed 4 times). It now paints 4 ms a frame, so the longest freeze is 16 ms, 13 ms, 13 ms (68 ms slowed 4 times). The cost is a later start when the processor is slow: 324 ms instead of 128 ms before the first piece moves (62, 39 and 45 ms instead of 45, 54 and 54 ms on a fast one). New option `warmMs` (default 2500): the most time `close()` may take painting a little each frame before it finishes the rest at once; `0` gives the old all-at-once behavior. Turned phone: if the window is turned or resized between `prepare()` and `close()`, the velvet is painted again for the new size. Before, a gap of 491 pixels (Chromium and Firefox) or 455 pixels (WebKitGTK) stayed open in the middle in the 915 by 412 test; now none (the halves overlap by 13 pixels, as designed). Cancelled zoom: when the browser cancels the last open animation, the curtain is now removed after 0.11 s; before it stayed for 2.06 s until the safety timer. The file grew by 1,833 bytes as written (28,715 to 30,548), 593 bytes minified (13,469 to 14,062) and 177 bytes compressed (5,495 to 5,672, about 3.2%). Not measured: a real phone, GNOME Web.

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
