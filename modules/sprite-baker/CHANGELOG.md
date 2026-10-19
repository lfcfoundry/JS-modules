# sprite-baker changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.7.0 · API 1 · 2026-10-18
- The wasm now compiles in the background when the file loads (ready() and module() added); the compile it saves is about 1 ms. Same pictures.

## 1.6.1 · API 1 · 2026-10-18
- Fix: the WebAssembly add-on drew drawMesh(..., null) with the wrong back-face cut (about 79 pixels per picture went missing in one game); now identical to the plain code.

## 1.6.0 · API 1 · 2026-10-18
- New optional add-on sprite-baker-wasm.js fills triangles in WebAssembly with the very same pixels: baking is about 1.1 to 1.4 times faster in Chromium and Firefox, mixed in WebKit browsers. Plain JavaScript is the fallback.

## 1.5.0 · API 1 · 2026-10-17
- New trimming tool writes a smaller copy without the parts a game does not use. The full file draws the same pixels as before.

## 1.4.0 · API 1 · 2026-10-17
- Can now draw Fancy Banana's pictures: textures, two more numbers per point, and a pose function. Existing code works as before.

## 1.3.0 · API 1 · 2026-10-17
- Faster, with the same pictures: baking a rolling animation is about 2.4 times faster in Node.

## 1.2.0 · API 1 · 2026-10-15
- First labeled version. Nothing in the code changed.

## Before version labels

- Early October 2026: First version: a tiny software 3D rasterizer that bakes toon-shaded shapes into 2D sprites.
- 2026-10-15: A triangle with a NaN height is skipped instead of corrupting later triangles; a size limit (`maxPixels`, default 4,194,304) stops a huge bake.
