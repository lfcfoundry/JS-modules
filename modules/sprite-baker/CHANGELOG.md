# sprite-baker changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.5.0 · API 1 · 2026-10-17
New: a trimming tool, modules/sprite-baker/lean.py, that writes a copy of sprite-baker.js without the parts a game does not use (7 parts: ramps, mesh, rotation, shapes, baking, sheets, checks; python3 lean.py --list names them, --without picks them, --no-comments drops every comment, --sizes prints the size). Nothing changes for anyone who keeps using the full file: it minifies to the same 18,364 bytes (8,080 gzipped) as 1.4.0 and draws the same pixels. Fancy Banana's set (everything except the fill) is 6,992 bytes minified, 3,438 gzipped: 62% smaller than the whole file; the ramps part alone saves 1,166 bytes (433 gzipped) and the checks 288 (154 gzipped) on that set. The lean fill draws the same buffers as the full module: 266 scenes compared byte for byte, 0 bytes different, in Node and in all four browsers, and it is as fast as the full file (within the noise of 3 to 4%, equal to a second copy of the full file). Also: the 266-scene check moved to test/fancy-scenes.js so it can run on any build (run.js still passes 108 checks).

Tested in: ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time (tests/sprite-baker-fancy-browser.js with and without LEAN=1: all 5 cases equal Fancy's filler byte for byte in each browser, 8 of 8 runs); node modules/sprite-baker/test/lean.js 14 of 14 builds, 210 comparisons and the 266 Fancy scenes identical on every set that cuts two or more parts; 108 Node checks. Not run: a phone, Safari itself

## 1.4.0 · API 1 · 2026-10-17
sprite-baker can now draw Fancy Banana's pictures. New and optional (API unchanged): materials can carry a picture (texture) painted across the surface and ridge lines, vertices can carry two more numbers (u, v), drawMesh takes a pose function, and a material object with its own color ramp is accepted as it is. Same pixels: a test copy of Fancy's own triangle filler (modules/sprite-baker/test/reference-tri.js) and sprite-baker draw 266 scenes (a picture-covered sphere with ridges, the gold coin with its lit ridges and a spin pose, a rod, a ball, the glove with edge 0.5, and 240 random scenes) and all 8,992,000 bytes of color and depth are identical. Without a picture or ridge nothing changed: the 1.3.0 pinned pictures are identical and those draws take the old loop (one extra check per triangle); plain sphere, 48 pictures, best of 5, smaller is better: Chromium 60.8 ms (was 61.4), Firefox 70 (was 67), WebKitGTK 55 (was 52), GNOME Web 52 (was 51), all within the run-to-run noise of about 6%. The picture path versus Fancy's own filler on the same sphere (48 pictures, smaller is better): Chromium 84.7 ms vs 100.2 (1.18x faster), Firefox 99 vs 108 (1.09x), WebKitGTK 85 vs 106 (1.25x), GNOME Web 83 vs 84 (1.01x). Size cost: 14,289 to 18,364 bytes minified (+4,075, +29%) and 6,353 to 8,080 gzipped (+1,727), terser 5.51.2 -c passes=2 -m; the readable file goes from 44,686 to 54,766 bytes. Known limit: the scale is one number for x and y, so a game with different x and y scales must scale first.

Tested in: ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time (tests/sprite-baker-fancy-browser.js: all 5 cases equal Fancy's filler in each browser and in Node; 108 Node checks pass). Not run: a phone, Safari itself, Fancy's own 22 pictures (Fancy checks those after it swaps)

## 1.3.0 · API 1 · 2026-10-17
Faster, same pictures: for the same scene every byte equals what 1.2.0 drew (1,500 random scenes, 19.4 million pixels compared, 0 bytes different, plus 3 pinned tests). Triangle filling now does its per-row math once per row and computes the highlight by repeated squaring (only within a hair of a rounding edge does it fall back to the old exact power), and the outline skips pixels that are already solid. Baking a 24-frame, 192 px roll with an outline: 645 to 271 ms in Node (2.4 times faster), 360 to 240 in ungoogled Chromium 155 (1.5 times), 470 to 293 in Firefox 158 (1.6 times), 263 to 230 in WebKitGTK 2.52.6 (1.14 times), 263 to 242 in GNOME Web 46.5 (1.09 times). A scene of 55,000 tiny triangles gains less, 1.0 to 1.65 times, because time per triangle, not per pixel, dominates there. The file grows by about 1.6 KB (43,037 to 44,686 bytes).

Tested in: Node 22, ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5 (byte-identical pictures and timings in all five; not run: a phone)

## 1.2.0 · API 1 · 2026-10-15
First labeled version (the number was already in the code). Adds `alphaMask`, `hit` and `toSheet`.

Tested in: 29 Node checks; Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`; Firefox 158 per the 2026-10-15 task-board note and Firefox 157 on 2026-10-17 (`tests/firefox.js`): alphaMask and toSheet work. Not run: WebKitGTK, a phone.

## Before version labels

- Early October 2026: First version: a tiny software 3D rasterizer that bakes toon-shaded shapes into 2D sprites.
- 2026-10-15: A triangle with a NaN height is skipped instead of corrupting later triangles; a size limit (`maxPixels`, default 4,194,304) stops a huge bake.
