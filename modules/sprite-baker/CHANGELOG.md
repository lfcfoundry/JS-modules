# sprite-baker changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.3.0 · API 1 · 2026-10-17
Faster, same pictures: for the same scene every byte equals what 1.2.0 drew (1,500 random scenes, 19.4 million pixels compared, 0 bytes different, plus 3 pinned tests). Triangle filling now does its per-row math once per row and computes the highlight by repeated squaring (only within a hair of a rounding edge does it fall back to the old exact power), and the outline skips pixels that are already solid. Baking a 24-frame, 192 px roll with an outline: 645 to 271 ms in Node (2.4 times faster), 360 to 240 in ungoogled Chromium 155 (1.5 times), 470 to 293 in Firefox 158 (1.6 times), 263 to 230 in WebKitGTK 2.52.6 (1.14 times), 263 to 242 in GNOME Web 46.5 (1.09 times). A scene of 55,000 tiny triangles gains less, 1.0 to 1.65 times, because time per triangle, not per pixel, dominates there. The file grows by about 1.6 KB (43,037 to 44,686 bytes).

Tested in: Node 22, ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5 (byte-identical pictures and timings in all five; not run: a phone)

## 1.2.0 · API 1 · 2026-10-15
First labeled version (the number was already in the code). Adds `alphaMask`, `hit` and `toSheet`.

Tested in: 29 Node checks; Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`; Firefox 158 per the 2026-10-15 task-board note and Firefox 157 on 2026-10-17 (`tests/firefox.js`): alphaMask and toSheet work. Not run: WebKitGTK, a phone.

## Before version labels

- Early October 2026: First version: a tiny software 3D rasterizer that bakes toon-shaded shapes into 2D sprites.
- 2026-10-15: A triangle with a NaN height is skipped instead of corrupting later triangles; a size limit (`maxPixels`, default 4,194,304) stops a huge bake.
