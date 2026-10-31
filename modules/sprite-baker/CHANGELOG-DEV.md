# sprite-baker developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.7.1 · API 1 · 2026-10-24

### Quick
With the WebAssembly add-on loaded, outlines are drawn in WebAssembly: about 1.6 to 1.9 times as fast per call (0.3 to 2 ms down to 0.15 to 1.1 ms), with the very same pixels. Without it nothing changes.

### Deep
Outline in WebAssembly. wasm/tri.c gets an outline export (same arithmetic as outline() in sprite-baker.js, rint = round half to even like Uint8ClampedArray, -ffp-contract=off kept); tri.wasm 7,864 to 8,569 bytes (+705), sprite-baker-wasm.js 23,283 to 26,980 bytes (gzip 10,281 to 11,582). The add-on replaces SpriteBaker.outline with a wrapper (sprite-baker.js now calls API.outline from render(), so bakeSprite/bakeRoll/baker use it too); the 24 offsets are still made in JavaScript, the picture is copied into spare wasm memory above the Rast pixels (0xC00000), the result is copied out into a fresh Uint8ClampedArray. Anything it will not take (picture over 393,216 pixels, radius over 100,000, color not three numbers, malformed picture, wasm without the export, no wasm or code generation refused) goes to the plain function. downsample left in JavaScript (loses in WebKitGTK with the copy). Bytes identical wasm on/off and with 'wasm-unsafe-eval' refused: 240 random pictures x 12 radii x 7 colors, 64/96/160 px, fallbacks, error kinds, bakeRoll with outline; in Chromium 155, Firefox 158, WebKitGTK 2.52.6 with CSP allowed and refused. Time per call in ms, lower is better, median of 40 alternating turns, fresh browser, Chromium/Firefox/WebKitGTK: outline 64 px r2 0.275/0.290/0.267 to 0.161/0.167/0.153; 96 px r2 0.602/0.649/0.600 to 0.347/0.401/0.346; 160 px r3 1.919/2.000/1.900 to 1.050/1.167/1.067 (-38 to -45 percent). 12-frame 96 px roll with outline (plain JS fill dominates): 45.9/46/38 to 41.1/44/37 ms (-10/-4/-3 percent), nothing more than 5 percent slower. See js-modules-research/sprite-baker-outline-wasm/RESULT-three-browsers.md

## 1.7.0 · API 1 · 2026-10-18

### Quick
The wasm now compiles in the background when the file loads (ready() and module() added); the compile it saves is about 1 ms. Same pictures.

### Deep
Compile early in sprite-baker-wasm.js: WebAssembly.compile starts when the file loads, SpriteBaker.wasm() then only starts the compiled module, SpriteBaker.wasmReady() (promise, true or false) and SpriteBaker.wasmModule() (the module or null, for postMessage to a worker) are new. Asked before the compile is done, wasm() compiles on the spot as before. The 7,864-byte program takes 0.5 ms (Chromium 155), 1 ms (Firefox 158), 1 ms (WebKitGTK 2.52.6) and 1 ms (GNOME Web 46.5) to compile on the page (median of 9 fresh pages, smaller is better), so that is the most this can save; load plus first use, old to new, differs by less than about 1 ms in all four browsers in both directions (median of 11 fresh pages). 133 Node checks pass (130 old, 3 new). Nothing stored in the browser.

## 1.6.1 · API 1 · 2026-10-18

### Quick
Fix: the WebAssembly add-on drew drawMesh(..., null) with the wrong back-face cut (about 79 pixels per picture went missing in one game); now identical to the plain code.

### Deep
Fix in the optional WebAssembly add-on (sprite-baker-wasm.js). drawMesh(rast, mesh, material, view, null), a null last argument, was read as a back-face cut of 0 instead of the plain code's -0.75, so triangles facing only slightly away were skipped: about 79 pixels per picture went missing and 15 of 148 drawing buffers differed in Fancy Banana (reported by that thread, which now passes undefined). Now null, false, 0 and {} behave exactly as in the plain code. New check in test/wasm-battery.js: 60 scenes (6 meshes and angles where a wrong cull changes pixels, 10 forms of the last argument: null, undefined, {}, false, 0, and objects with cull null, undefined, false, 0, -0.75); it fails on 1.6.0 (the null forms differ) and passes now. Browser battery, one run each, 893 scenes (833 before), 0 differ in all four: ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5; also 0 differ on a page without 'wasm-unsafe-eval'. Speed and size are unchanged apart from one conditional (not re-timed; not measured). The plain sprite-baker.js is unchanged. Not run: a phone, Safari.

## 1.6.0 · API 1 · 2026-10-18

### Quick
New optional add-on sprite-baker-wasm.js fills triangles in WebAssembly with the very same pixels: baking is about 1.1 to 1.4 times faster in Chromium and Firefox, mixed in WebKit browsers. Plain JavaScript is the fallback.

### Deep
New optional add-on sprite-baker-wasm.js (21,643 bytes, 9,750 gzipped; the WebAssembly program inside is 7,864 bytes, source wasm/tri.c, rebuilt byte for byte by wasm/build.sh; a lean build without picture and ridge code is 5,561 bytes). SpriteBaker.wasm() returns a Rast and a drawMesh used like the plain ones, with the depth and color buffers inside the wasm memory (no copy per fill). It draws the very same bytes as the JavaScript: 833 scenes (26 meshes, 800 random scenes, 7 extra cases such as a picture and a surface over the wasm limit, two surfaces drawn into by turns, release() and setLight) compared byte for byte in Node and in each of the four test browsers, three runs each: 0 differ in all 12 browser runs and in Node. Speed, 48 pictures of 140 x 140 pixels, median of three runs (times faster = plain time / wasm time, higher is better): ungoogled-chromium 155 face 1.22x, coin 1.19x, rod 0.94x, glove 1.13x; Firefox 158 face 1.34x, coin 1.40x, rod 1.30x, glove 1.30x; WebKitGTK 2.52.6 face 1.15x, coin 0.86x, rod 1.00x, glove 0.93x; GNOME Web 46.5 face 1.25x, coin 0.86x, rod 1.00x, glove 0.96x. Calling rast.release() after each picture (skips the copy that keeps an older Rast correct) gives, in the same order of browsers, rod 1.48x / 1.71x / 1.12x / 1.29x and glove 1.25x / 1.39x / 1.12x / 1.00x. Plain reading: the gain is modest and only while baking (the fill never runs per frame, so no FPS change); the two WebKit browsers gain only on pictures with a texture and are about 14% slower on the ridge-line coin. Starting the add-on takes 1 to 11 ms once. When WebAssembly is missing or the page policy lacks 'wasm-unsafe-eval' (all four browsers refuse the module then), the result is SpriteBaker's own Rast and drawMesh and the pictures are identical; single calls the wasm cannot do (a surface over 1,048,576 pixels, a picture over 229,376 pixels, a grid over 393,216 numbers, a part missing from a lean wasm) are drawn by the plain code. The cosine and 2.2 power are computed inside the wasm and checked against the browser's own functions (any result within 1e-8 of a rounding edge is redone with Math.cos / Math.pow). Credit: the fmod in tri.c is from musl libc (MIT). Existing code and the full file sprite-baker.js are unchanged apart from the version label (same pixels as 1.5.0). Browsers used: ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5; not used: a phone, Safari itself.

## 1.5.0 · API 1 · 2026-10-17

### Quick
New trimming tool writes a smaller copy without the parts a game does not use. The full file draws the same pixels as before.

### Deep
New: a trimming tool, modules/sprite-baker/lean.py, that writes a copy of sprite-baker.js without the parts a game does not use (7 parts: ramps, mesh, rotation, shapes, baking, sheets, checks; python3 lean.py --list names them, --without picks them, --no-comments drops every comment, --sizes prints the size). Nothing changes for anyone who keeps using the full file: it minifies to the same 18,364 bytes (8,080 gzipped) as 1.4.0 and draws the same pixels. Fancy Banana's set (everything except the fill) is 6,992 bytes minified, 3,438 gzipped: 62% smaller than the whole file; the ramps part alone saves 1,166 bytes (433 gzipped) and the checks 288 (154 gzipped) on that set. The lean fill draws the same buffers as the full module: 266 scenes compared byte for byte, 0 bytes different, in Node and in all four browsers, and it is as fast as the full file (within the noise of 3 to 4%, equal to a second copy of the full file). Also: the 266-scene check moved to test/fancy-scenes.js so it can run on any build (run.js still passes 108 checks).

## 1.4.0 · API 1 · 2026-10-17

### Quick
Can now draw Fancy Banana's pictures: textures, two more numbers per point, and a pose function. Existing code works as before.

### Deep
sprite-baker can now draw Fancy Banana's pictures. New and optional (API unchanged): materials can carry a picture (texture) painted across the surface and ridge lines, vertices can carry two more numbers (u, v), drawMesh takes a pose function, and a material object with its own color ramp is accepted as it is. Same pixels: a test copy of Fancy's own triangle filler (modules/sprite-baker/test/reference-tri.js) and sprite-baker draw 266 scenes (a picture-covered sphere with ridges, the gold coin with its lit ridges and a spin pose, a rod, a ball, the glove with edge 0.5, and 240 random scenes) and all 8,992,000 bytes of color and depth are identical. Without a picture or ridge nothing changed: the 1.3.0 pinned pictures are identical and those draws take the old loop (one extra check per triangle); plain sphere, 48 pictures, best of 5, smaller is better: Chromium 60.8 ms (was 61.4), Firefox 70 (was 67), WebKitGTK 55 (was 52), GNOME Web 52 (was 51), all within the run-to-run noise of about 6%. The picture path versus Fancy's own filler on the same sphere (48 pictures, smaller is better): Chromium 84.7 ms vs 100.2 (1.18x faster), Firefox 99 vs 108 (1.09x), WebKitGTK 85 vs 106 (1.25x), GNOME Web 83 vs 84 (1.01x). Size cost: 14,289 to 18,364 bytes minified (+4,075, +29%) and 6,353 to 8,080 gzipped (+1,727), terser 5.51.2 -c passes=2 -m; the readable file goes from 44,686 to 54,766 bytes. Known limit: the scale is one number for x and y, so a game with different x and y scales must scale first.

## 1.3.0 · API 1 · 2026-10-17

### Quick
Faster, with the same pictures: baking a rolling animation is about 2.4 times faster in Node.

### Deep
Faster, same pictures: for the same scene every byte equals what 1.2.0 drew (1,500 random scenes, 19.4 million pixels compared, 0 bytes different, plus 3 pinned tests). Triangle filling now does its per-row math once per row and computes the highlight by repeated squaring (only within a hair of a rounding edge does it fall back to the old exact power), and the outline skips pixels that are already solid. Baking a 24-frame, 192 px roll with an outline: 645 to 271 ms in Node (2.4 times faster), 360 to 240 in ungoogled Chromium 155 (1.5 times), 470 to 293 in Firefox 158 (1.6 times), 263 to 230 in WebKitGTK 2.52.6 (1.14 times), 263 to 242 in GNOME Web 46.5 (1.09 times). A scene of 55,000 tiny triangles gains less, 1.0 to 1.65 times, because time per triangle, not per pixel, dominates there. The file grows by about 1.6 KB (43,037 to 44,686 bytes).

## 1.2.0 · API 1 · 2026-10-15

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version (the number was already in the code). Adds `alphaMask`, `hit` and `toSheet`.
