# sprite-baker

**Version 1.6.0 · API 1**

**Tested in:** ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time (tests/sprite-baker-wasm-browser.js, three runs each: 833 scenes, 0 differ in 12 of 12 runs, also on a page without 'wasm-unsafe-eval'); node modules/sprite-baker/test/run.js 129 checks, test/lean.js unchanged. Not run: a phone, Safari itself

The version is also in code as `SpriteBaker.version`. Run the tests (offline, about a second): `node modules/sprite-baker/test/run.js`

A tiny software 3D rasterizer for Canvas 2D games. You describe a few smooth parametric shapes, it shades them with a toon color ramp on the CPU (no WebGL), and it bakes the result into ordinary 2D sprites: one picture, or N pictures of the shape rolling about a fixed horizontal axis. Your game then draws those pictures with `drawImage` and never touches 3D again.

Each shape becomes a grid of points, the grid is cut into small triangles, and every triangle is filled into a pixel buffer that keeps a depth value per pixel, so nearer surfaces cover farther ones. Each pixel's color comes from the light direction and the color ramp you gave the part. About 985 lines of plain JavaScript (55,804 bytes with its notes), no dependencies, no build step. The core works in Node without a canvas; the browser helpers are optional.

![A capsule with five ridges baked into 16 frames, and a torus with a bead baked into 12 frames](preview.png)

## Why it exists

It was extracted from a shipped single-file browser game that wanted glossy, rounded characters and props with only one HTML file, no image assets and no WebGL context to manage. Each pose is baked once at load time into a cached picture, so the game only stamps pictures. The rasterizer is small enough to read in one sitting, so it is also a fair starting point if you want to change the shading. The pieces are small, readable and tested; the ideas are not new (see below).

## Use

Copy `sprite-baker.js` (browser global `SpriteBaker`, or `require` in Node). `demo.html` is the full example.

```html
<canvas id="c" width="96" height="96"></canvas>
<script src="sprite-baker.js"></script>
<script>
  var SB = SpriteBaker;
  var scene = [
    { fn: SB.torus(26, 9), nu: 48, nv: 16, material: SB.material([[0, 120, 50, 20], [0.5, 235, 150, 50], [1, 255, 235, 170]]) },
    { fn: SB.sphere(11, [0, -26, 0]), nu: 12, nv: 18, material: SB.material([[0, 60, 20, 90], [0.5, 170, 90, 210], [1, 245, 210, 255]]) }
  ];
  var imgs = SB.bakeRoll(scene, 12, 96, { outline: { radius: 2, color: [14, 24, 40] } });   // null if nothing can be baked
  var frames = imgs ? imgs.map(function (im) { return SB.toCanvas(im); }).filter(Boolean) : [];   // toCanvas gives null on failure
  var g = document.getElementById('c').getContext('2d'), i = 0;
  if (frames.length) setInterval(function () { g.clearRect(0, 0, 96, 96); g.drawImage(frames[i++ % frames.length], 0, 0); }, 100);
</script>
```

To keep the page moving while it loads, use `var b = SB.baker(scene, 96, { frames: 12 })` and call `b.next()` once per tick (it returns `null` when all frames are done).

In Node (no canvas) the result is `{ width, height, data }` with RGBA bytes: `SB.bakeSprite(scene, 32)`.

On high-density screens, bake at `Math.round(96 * devicePixelRatio)` pixels and draw at 96 CSS pixels, or the browser upscales it.

## API

Pixels, x right, y **down**, z toward the viewer, orthographic. A scene is an array of parts `{ fn, nu, nv, material }` or `{ mesh, material }`; meshes are built once and reused for every frame.

**Baking** (these return `null` instead of throwing when nothing can be baked; handle `null`)

- `SB.bakeSprite(scene, size, opts)`: one `{ width, height, data }`. `size` is a number, `[w, h]` or `{ width, height }`.
- `SB.bakeRoll(scene, frames, size, opts)`: `frames` pictures, frame i turned by `i / frames` of `opts.turn` (default a full turn) about the x axis through `opts.center`. The full turn is not repeated, so it loops; all frames share one scale.
- `SB.baker(scene, size, opts)`: the same roll in slices, returning `{ count, width, height, ss, scale, index, frame(i), next(), reset() }` (`opts` plus `frames`, default 12). `next()` bakes the picture at `index` and returns `null` after the last; `frame(i)` bakes any picture. Pictures equal `bakeRoll`'s byte for byte. If nothing can be baked, `count` is 0 and `reason` is `'size'`, `'frames'` or `'too-big'`. Meshes are built inside `baker()`, so call it in its own tick. Bad scenes (empty, bad material, bad mesh function) still throw: they are mistakes in your code.
- `SB.toCanvas(img, opts)`: browser only; a new `<canvas>` or **`null`** (no `document`, malformed image, no 2D context). Never throws. `opts.willReadFrequently: true` asks for a plain-memory canvas.
- Also `outline(img, radius, color)`, `downsample(rast, ss)`, `toImageData(img)`.
- `opts`: `phi` (bakeSprite), `axis` (`[1,0,0]`; zero-length means no turn), `center` (`[0,0,0]`), `ss` (integer supersampling, 2), `maxPixels` (4,194,304), `scale`/`ox`/`oy` (auto-fit and center so the shape fits at every roll angle), `margin` (2), `light`, `cull`, `outline` (`{ radius, color: [r, g, b] }`).
- Size ceiling: the working surface holds `width * height * ss * ss` pixels at 8 bytes each. Above `maxPixels` (about 32 MiB) `ss` is lowered until it fits (a 1024 x 1024 sprite at `ss` 4 bakes at `ss` 2); if even `ss` 1 is over, the bake returns `null`. `maxPixels: Infinity` switches it off.

**Materials**

- `SB.material(stops, opts)`: `stops` is `[[t, r, g, b], ...]`, t ascending in 0..1, baked to a 256-entry LUT. `opts` scale the lighting terms: `specular`, `bounce`, `pool`, `rimLight` (1 each) and `edge` (0.88; 1 means no silhouette darkening). A raw stops array works anywhere a material does; a plain object with your own `lut` (`Uint8Array(768)`) plus those terms is accepted as is. `SB.bakeRamp(stops)` gives just the LUT.
- Since 1.4.0, off unless given (they need the 8-number vertices `[x, y, z, nx, ny, nz, u, v]` that `drawMesh` makes): `texture: { w, h, data, uClamp: true, vWrap: 2 * Math.PI, shadeBase: 0.66, shadeWrap: 0.5 }` (RGBA bytes, not premultiplied, looked up at (u, v) with bilinear weights by alpha) and `ridge: { freq: 5, dark: -0.86, darkScale: 0.93, lit, litAdd: 0.06 }` (faint grooves from `cos(freq * v)`). The pictured path is about 4,100 bytes minified (1,700 gzipped).

**Drawing and shapes**

- `SB.Rast(w, h)`: z-buffered RGBA surface (`setLight`, `clear`, `toImageData`). `SB.tri(rast, a, b, c, mat, opts)` fills one triangle with vertices `[x, y, z, nx, ny, nz]`; `opts.cull` is -0.75 by default, or `false`.
- `SB.mesh(fn, nu, nv, opts)`: samples `fn(u, v)` (u, v in 0..1) and returns `[x, y, z]`, `[x, y, z, nx, ny, nz]` or `{ x, y, z, nx, ny, nz }`; `opts.flip` is `true`, `false` or `'auto'` (default). `SB.drawMesh(rast, mesh, mat, view, opts)` takes `view = { scale, ox, oy, rot, center }`; `opts.pose(p)` runs on every vertex after the roll turn and before the scale.
- Shapes: `sphere(radius | [rx, ry, rz], center)`, `rod(a, b, r0, r1)` (open tube), `capsule(a, b, r, { lobes, depth })` (`lobes` adds a ripple so a roll is visible), `torus(R, r, center, axis)` with axis `'z'` (default), `'y'` or `'x'`.
- Rotation: `rotationMatrix(axis, phi)`, `rotateAxis(p, axis, phi, center)`, `rotateX(p, phi, centerOrY)`. A positive angle about x turns the top toward the viewer; a full turn is exact, so a rolled loop repeats pixel for pixel. A NaN angle or zero axis gives no turn. A triangle with a NaN or infinite number is skipped (a small hole, no damage to the depth buffer).

**Masks and sheets** (since 1.2.0; they take baked pictures, never a canvas; `null` on bad input; the size ceiling applies)

```js
var mask = SB.alphaMask(SB.bakeSprite(scene, 64), { threshold: 8, color: [255, 255, 255] });
if (mask && SB.hit(mask, mouseX - spriteX, mouseY - spriteY)) { /* pointer is on the shape, not just its box */ }
var sheet = SB.toSheet(SB.bakeRoll(scene, 12, 96), { padding: 2, maxWidth: 1024 });   // { image, canvas, frames[i] = { x, y, w, h } }
```

`alphaMask` turns pixels with alpha above `threshold` (8) into `color` (default opaque white). `toSheet` packs pictures left to right in rows (`maxWidth` 2048, `padding` 1); `canvas` is `null` in Node or when the browser refuses, and `image` is still good.

## WebAssembly fill (since 1.6.0, optional add-on)

**What it is and how it works.** `sprite-baker-wasm.js` adds one function, `SpriteBaker.wasm()`, that returns a `Rast` and a `drawMesh` used exactly like `SB.Rast` and `SB.drawMesh`, but the triangle filler and the shader run in a small WebAssembly program (7,864 bytes, built from `wasm/tri.c`). The depth and color buffers live inside the wasm memory, so a fill copies nothing; `drawMesh` writes the turned vertices straight there and calls the filler once per mesh. It does the same arithmetic as the JavaScript, operation for operation (no fused multiply-add, no fast-math), so every byte of color and depth is the same: 833 scenes are compared byte for byte in each of the four test browsers, 0 differ. Two things the wasm computes itself (the cosine of the ridge lines and the 2.2 power of the rim light) are checked against the browser's own `Math.cos` and `Math.pow`, and any result within 1e-8 of a rounding edge is redone with the browser's function, the trick the JavaScript already uses for the highlight; do not widen that margin without re-proving equality (`test/wasm-battery.js`).

**Why it exists.** Baking is the one heavy loop in a game that uses this module (Fancy Banana's pictures: about half of the picture-building time). The owner's rule is that WebAssembly is the standard for heavy loops and plain JavaScript the fallback. The gain here is modest and only shortens the baking time; the fill never runs per frame, so it cannot raise the FPS.

```html
<script src="sprite-baker.js"></script>
<script src="sprite-baker-wasm.js"></script>     <!-- the page policy needs 'wasm-unsafe-eval' in script-src, nothing else loosened -->
<script>
  var E = SpriteBaker.wasm();               // E.available / E.engine: true / 'wasm', or false / 'js' when WebAssembly cannot start
  var rast = new E.Rast(140, 140);
  E.drawMesh(rast, mesh, material, { scale: 1, ox: 70, oy: 70 });   // same arguments and the same pixels as SpriteBaker.drawMesh
  // ... read rast.px, or hand rast.toImageData() to a canvas ...
  rast.release();                           // optional: "done with it" (see below)
</script>
```

In Node: `var SB = require('./sprite-baker-wasm.js')` loads `sprite-baker.js` itself and returns `SpriteBaker`.

**It always works.** When the browser has no WebAssembly, the page policy lacks `'wasm-unsafe-eval'`, or the module will not start, `E.available` is `false`, `E.engine` is `'js'`, and `E.Rast` / `E.drawMesh` are SpriteBaker's own, so the code you wrote against `E` runs unchanged. A single call can also fall back by itself and draw with the plain code (same pixels): a surface over 1,048,576 pixels, a picture over 229,376 pixels (about 478 x 478), a grid over 393,216 numbers, or a material that uses a part the loaded wasm file does not have. `E.stats` counts the calls the wasm filled and the ones it handed over.

**Rules to know.**
- All `Rast`s made by one `SpriteBaker.wasm()` result share one piece of wasm memory. Making a newer `Rast` first copies the older one out into plain arrays (about 0.06 ms for 140 x 140), so every `Rast` stays correct. Read `rast.px` and `rast.z` fresh and do not keep a reference to them across the making of another `Rast`. `toImageData()` returns a copy.
- `rast.release()` says "I am done with this one": the next `Rast` then skips that copy. It never changes a pixel; it only saves time when many small pictures are made one after another (a released `Rast` throws if you draw into it). It does nothing on a plain `Rast`.
- The texture is copied into the wasm on every call, so a picture changed in place is seen at once.
- `SpriteBaker.wasm(bytes)` takes another build of `tri.wasm` (for example the lean one below) instead of the one inside the file.

**Speed.** Milliseconds for 48 pictures of 140 x 140 pixels, filled and shaded (lower is better); "times faster" is the plain JavaScript time divided by the wasm time (higher is better); median of three full runs per browser, range in brackets; the last column also calls `rast.release()` after each picture. Browsers one at a time, each with its version:

| Browser | Picture | Plain JS (ms) | Wasm (ms) | Times faster | With `release()` |
|---|---|---|---|---|---|
| ungoogled-chromium 155.0.8059.39-1 | Fancy's face (picture + ridge lines) | 77.2 | 63.4 | 1.22x (1.07-1.45) | 1.20x |
| | gold coin (ridge lines, spin pose) | 60.5 | 51 | 1.19x (1.18-1.23) | 1.23x |
| | plain rod | 9.5 | 9.6 | 0.94x (0.76-0.99) | 1.48x |
| | glove | 32.4 | 31 | 1.13x (0.82-1.13) | 1.25x |
| Firefox 158.0 | Fancy's face | 79 | 59 | 1.34x (1.34-1.42) | 1.41x |
| | gold coin | 68 | 48 | 1.40x (1.32-1.42) | 1.40x |
| | plain rod | 13 | 10 | 1.30x (0.87-1.33) | 1.71x |
| | glove | 39 | 29 | 1.30x (1.27-1.34) | 1.39x |
| WebKitGTK 2.52.6 | Fancy's face | 98 | 81 | 1.15x (1.11-1.41) | 1.29x |
| | gold coin | 65 | 76 | 0.86x (0.83-0.87) | 0.83x |
| | plain rod | 9 | 9 | 1.00x | 1.12x |
| | glove | 28 | 28 | 0.93x (0.90-1.00) | 1.12x |
| GNOME Web 46.5 | Fancy's face | 92 | 79 | 1.25x (1.16-1.29) | 1.28x |
| | gold coin | 71 | 83 | 0.86x (0.79-1.15) | 0.86x |
| | plain rod | 8 | 8 | 1.00x | 1.29x |
| | glove | 28 | 29 | 0.96x (0.93-0.97) | 1.00x |

Plain reading: Chromium and Firefox bake 1.1 to 1.4 times as fast. The two WebKit browsers gain only on pictures with a texture (1.15 to 1.25 times) and are about 14% slower on the ridge-line coin, flat on the rod and glove. If most of your players use Safari-type browsers and your pictures have no texture, leave the add-on out. Starting the add-on (decode, compile, instantiate) takes 1 to 11 ms once. Not measured: a phone, Safari itself.

**Size.** `sprite-baker-wasm.js` is 21,643 bytes (9,749 gzipped), of which the wasm file (7,864 bytes) takes 10,488 as text. A lean wasm without the picture and ridge code is 5,561 bytes: `sh modules/sprite-baker/wasm/build.sh lean tri-lean.wasm` and `python3 modules/sprite-baker/wasm/embed.py --lean tri-lean.wasm -o sprite-baker-wasm-lean.js`; a material that needs a cut part is handed to the plain code, so the pixels stay the same.

**Rebuild.** `sh modules/sprite-baker/wasm/build.sh` needs clang 18 or newer with the wasm32 target (no other tool); `build.sh --check` says whether `wasm/tri.wasm` is byte for byte what `tri.c` builds, and `python3 modules/sprite-baker/wasm/embed.py` puts the file into `sprite-baker-wasm.js` (`--check` compares). The `fmod` inside `tri.c` is from musl libc (MIT license), used so `%` on decimals matches JavaScript bit for bit.

Tests: `node modules/sprite-baker/test/run.js` (the add-on section runs in Node); in a real browser, one at a time: `node tests/sprite-baker-wasm-browser.js chromium|firefox|webkit|epiphany`.

## Lean builds (since 1.5.0)

`sprite-baker.js` stays the full file. `python3 modules/sprite-baker/lean.py --without ramps,mesh,rotation,shapes,baking,sheets --no-comments -o spritebaker.js` writes a copy without those parts (`--list` names all seven; `--sizes` prints bytes, gzipped bytes and, if `terser` is installed, minified bytes). Kept parts behave exactly as in the full file; cut parts are simply missing. Cutting `mesh` or `rotation` also cuts `baking`, and cutting `baking` also cuts `sheets`. Always kept: `Rast`, `tri` (plain, picture and ridge) and `drawMesh`.

| Part | Holds | Minified bytes saved (of 18,364) | Gzipped bytes saved (of 8,080) |
|---|---|---|---|
| `ramps` | `material()`, `bakeRamp()` | 1,166 | 433 |
| `shapes` | `sphere`, `rod`, `capsule`, `torus` | 1,682 | 705 |
| `sheets` | `alphaMask`, `hit`, `toSheet` | 1,704 | 605 |
| `baking` | the bakers, `outline`, `toCanvas` | 5,922 | 2,366 |
| `rotation` | `rotationMatrix`, `rotateAxis`, `rotateX` | 6,644 | 2,660 |
| `mesh` | `mesh()` | 7,803 | 3,168 |
| `checks` | argument checks | 820 | 356 |

Each part cut alone; sizes from `terser -c passes=2 -m` 5.51.2 (smaller is better). A game that draws only meshes it builds itself and brings its own ramps (Fancy Banana) keeps 6,992 bytes minified (3,438 gzipped), 62% smaller than the whole file; keeping `ramps` too is 8,157 bytes (3,894 gzipped).

`node modules/sprite-baker/test/lean.js` builds every single cut and draws the 266 scenes of `test/fancy-scenes.js` through the lean filler byte for byte (about 3 s); `LEAN=1 node tests/sprite-baker-fancy-browser.js` does the same in a real browser. `lean.py` edits nothing; keep the `//@begin` / `//@else` / `//@end` marker lines in `sprite-baker.js` balanced.

## How it compares

sprite-baker is a narrow tool. It gives up the range and picture quality of three.js with WebGL (use that if you can), and in return needs no WebGL, no asset files and no scene engine, and loops a rolling shape exactly. Speed against the other tools: not measured.

| Alternative | Size (smaller is better) | Speed | Where it wins / loses |
|---|---|---|---|
| [three.js](https://threejs.org/) with WebGL (version: not read) | Not measured | Not measured | Wins on picture quality and range (real cameras, lights, shadows, loaders). This module wins when you cannot or do not want WebGL |
| [Easel](https://www.npmjs.com/package/@xsyetopz/easel) (MIT, 0.8.0, as reported on its page; not run) | Not measured | Not measured | CPU drawing into a 2D canvas with a scene graph; sprite sheets: unverified. Look at Easel first for more than a few shapes |
| [Zdog](https://zzz.dog/) (version and license: not read) | Not measured | Not measured | Wins for flat illustrated 3D, live. This module gives shaded surfaces and pre-rendered bitmaps |
| Fancy Banana's own triangle filler (the game this came from) | This module, minified: 18,364 bytes (8,080 gzipped); Fancy's set of parts only: 6,992 bytes (3,438 gzipped) | Picture path vs Fancy's filler on the same sphere, 48 pictures (lower is better): 84.7 vs 100.2 ms in ungoogled Chromium 155, 99 vs 108 ms in Firefox 158, 85 vs 106 ms in WebKitGTK 2.52.6, 83 vs 84 ms in GNOME Web 46.5 | Same pixels: 266 scenes, 0 bytes different. Equal or faster in all four browsers |

Baking a 24-frame, 192 px roll with an outline takes 240 ms in ungoogled Chromium 155, 293 ms in Firefox 158, 230 ms in WebKitGTK 2.52.6 and 242 ms in GNOME Web 46.5 (lower is better; version 1.3.0 timing). Readable file 55,804 bytes; minified 18,364 bytes (8,080 gzipped, terser 5.51.2).

**Where it loses:** less capable than WebGL; orthographic only (no perspective, no shadows, no texture mapping beyond the optional picture path, binary alpha); meant for load time, not per-frame drawing; sizes of three.js, Easel and Zdog not measured, so no size win is claimed. Also named, not measured: tinygl.js (a JavaScript port of the TinyGL software renderer; as reported, unverified and not run, it needs a canvas width that is a multiple of 4), [glMatrix](https://github.com/toji/gl-matrix), Blender and older three.js CPU renderers (the [three-software-renderer](https://github.com/AVGP/three-software-renderer) port needs three.js and is slower than WebGL).

## What it is not

- Orthographic only: no perspective, no transparency, no shadows, no texture mapping except the optional picture path. Alpha is binary inside the rasterizer; smooth edges come from `ss` (3 or 4 for cleaner edges; cost grows with `ss` squared). Depth is float32 and ties keep the first-drawn triangle: fine for sprites, not for coplanar overlapping surfaces.
- Automatic normals suit closed, roughly convex shapes; for open or hollow surfaces pass `flip: true` or `false`, or return exact normals, and pass `cull: false` for open one-sided surfaces.
- The bounce, pooled-shadow and right-edge rim terms point in fixed screen directions on purpose; only the main light and highlight follow `light`.
- A surface of revolution about the roll axis (a plain sphere, a smooth capsule) looks identical in every frame. Give it something off-axis: ridges (`lobes`), a bead, a decal part, a ring.
- `outline` rounds offsets to whole pixels, pixels pushed past the border are cut, and thin details with a radius of 4 or more can show a dotted halo.
- Speed: 16 frames of a 160 x 96 capsule at `ss: 2` took roughly 0.3 s in Node on a modest machine (one run, not a benchmark; a phone will be slower). Bake in slices with `baker`; no worker needed. A classic worker (`importScripts`) should also work, with `toCanvas` returning `null`; not tested.
- The module never reads a canvas back, so Firefox's canvas read-back noise cannot change what it bakes. Meshes are cached per part object: after changing `nu`, `nv` or `fn`, pass a new part object.

## For AI agents

- Keep the sampling and depth rules (pixel centers `x + 0.5`, inclusive edges with the `-1e-5` tolerance, strict `z > stored z`, `-1e9` clear value) and the shading constants in `tri` unless you are changing the look on purpose; then update the pinned hash in `test/run.js` after looking at the picture.
- `rotationMatrix` negates the angle and snaps tiny sines and cosines to zero, so a full turn is exact. `bakeRoll` renders `i / frames * turn` for `i < frames` with one scale and one reused `Rast`. All baking paths share one internal `setup()` and `render(phi)`; the test "next() x 8 equals bakeRoll" guards it.
- Loaders and probes do not throw (`null` or an inert `baker`); only programmer errors do. Only `toCanvas` may touch `document`; `alphaMask` and `toSheet` take pictures, never canvases.
- The WebAssembly fill must stay byte-identical to `tri`/`triUV`: change the JavaScript and `wasm/tri.c` together, rebuild with `wasm/build.sh`, re-embed with `wasm/embed.py`, and run `test/run.js` and `tests/sprite-baker-wasm-browser.js`; never widen the 1e-8 rounding-edge guard without re-proving equality.
- Keep the file dual-loading (last line), the license header (first line), no dependencies, no game-specific art, names or palettes. Do not rename exported names.

## Prior art and credits

- The barycentric triangle fill, z-buffer, half-Lambert wrap lighting (a published lighting trick from Valve's Half-Life work) and ramp-based toon shading are textbook techniques. Idea only, no code from others.
- [Tiny Renderer](https://github.com/ssloy/tinyrenderer) (ssloy) is the course this approach resembles; named for learning only, no code from it.
- three.js, three-software-renderer, Easel, tinygl.js, Zdog, glMatrix and Blender are named for comparison. None of their code is in this module.
- The rasterizer was extracted from Fancy Banana (LFC Foundry's own game), and the picture path draws the same bytes as that game's own triangle filler.
- terser 5.51.2 was used only to measure minified sizes; no terser code is in the module.
- The WebAssembly fill (`wasm/tri.c`) carries the `fmod` of musl libc (MIT license, Copyright (c) Rich Felker et al.) and the cosine and power kernels from the fdlibm algorithms (public ideas, written again here, checked against the browser's own functions).

No code from others; the ideas above are theirs.

## Full research notes

The long version of this page (the full per-feature API notes, the longer write-ups of each alternative, every limit with its reasoning, and the maintainer test notes) is kept in the project's private knowledge base.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
