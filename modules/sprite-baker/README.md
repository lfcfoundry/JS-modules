# sprite-baker

Run the tests (offline, about a second): `node modules/sprite-baker/test/run.js`

## What it is

A tiny software 3D rasterizer for Canvas 2D games. You describe a few smooth parametric shapes, it shades them with a toon color ramp on the CPU (no WebGL), and it bakes the result into ordinary 2D sprites: one picture, or N pictures of the shape rolling about a fixed horizontal axis. Your game then draws those pictures with `drawImage` and never touches 3D again.

About 650 lines of plain JavaScript, a third of them comments, no dependencies, no build step. The core works in Node without a canvas; the browser helpers are optional.

![A capsule with five ridges baked into 16 frames, and a torus with a bead baked into 12 frames](preview.png)

*What `demo.html` shows: shapes shaded by the rasterizer, baked once into frames, then played back with plain `drawImage`.*

## Why it exists

It was extracted from a shipped single-file browser game that wanted glossy, rounded characters and props, but only one HTML file, no image assets and no WebGL context to manage. Baking each pose once at load time into a cached picture made the look cheap at runtime: the game only stamps pictures. The rasterizer is small enough to read in one sitting, so it is also a reasonable starting point if you want to change the shading.

This repository is useful because the pieces are small, readable and tested, not because the ideas are new. See the comparison below.

## Quick start

Browser (open the file by double-click; this is `demo.html` in miniature):

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

Bake one frame per tick instead of all at once (so the page keeps moving while it loads):

```js
var b = SB.baker(scene, 96, { frames: 12, outline: { radius: 2, color: [14, 24, 40] } }), sheet = [];
function tick() {
  var img = b.next();                                   // bakes ONE frame, or returns null when all are done
  if (img) { var c = SB.toCanvas(img); if (c) sheet.push(c); setTimeout(tick, 0); }
  else { /* sheet is ready: start the game */ }
}
setTimeout(tick, 0);                                    // building the meshes already happened inside baker(); frames follow, one per tick
```

Node (no canvas; the result is `{ width, height, data }` with RGBA bytes):

```js
const SB = require('./sprite-baker.js');
const scene = [{ fn: SB.sphere(10), nu: 24, nv: 36, material: SB.material([[0, 40, 60, 120], [1, 220, 240, 255]]) }];
const img = SB.bakeSprite(scene, 32);          // one 32 x 32 picture
console.log(img.width, img.height, img.data.length);   // 32 32 4096
```

## API

Screen conventions: pixels, x right, y **down**, z toward the viewer (larger z is nearer), orthographic projection.

**Surface**

- `new SB.Rast(w, h)`: z-buffered RGBA surface. Fields `w`, `h`, `z` (Float32Array, cleared to -1e9), `px` (Uint8ClampedArray RGBA). Methods: `setLight(x, y, z)` (or an array; direction the light comes from, normalized for you), `clear()`, `toImageData()` (a real `ImageData` if the platform has one, else a plain `{ width, height, data }`).

**Materials**

- `SB.material(stops, opts)`: `stops` is `[[t, r, g, b], ...]`, t ascending in 0..1, baked to a 256-entry LUT. Options scale the lighting terms: `specular` (1), `bounce` (1), `pool` (1), `rimLight` (1), `edge` (0.88; 1 means no silhouette darkening). A raw stops array is accepted anywhere a material is.
- `SB.bakeRamp(stops)`: just the `Uint8Array(768)` LUT.

**Drawing**

- `SB.tri(rast, a, b, c, mat, opts)`: fill one triangle. Vertices are `[x, y, z, nx, ny, nz]` in raster pixels. `opts.cull` (default -0.75, or `false`) skips triangles whose normals face well away.
- `SB.mesh(fn, nu, nv, opts)`: sample `fn(u, v)` (u, v in 0..1) on a grid. `fn` returns `[x, y, z]` (normals by finite differences), or `[x, y, z, nx, ny, nz]`, or `{ x, y, z, nx, ny, nz }`. Returns `{ nu, nv, pos, nrm }`. `opts.flip`: `true`, `false` or `'auto'` (default, flips finite-difference normals that point inward on closed convex-ish shapes).
- `SB.drawMesh(rast, mesh, mat, view, opts)`: transform and fill every quad as two triangles. `view = { scale, ox, oy, rot, center }` where `rot` comes from `rotationMatrix`.

**Shapes** (each returns an `fn(u, v)` for `mesh`)

- `SB.sphere(radius | [rx, ry, rz], center)`, `SB.rod(a, b, r0, r1)` (open tube), `SB.capsule(a, b, r, { lobes, depth })` (cylinder plus two caps in one surface; `lobes` adds a cosine ripple so a roll is visible), `SB.torus(R, r, center, axis)` with axis `'z'` (default), `'y'` or `'x'`.

**Rotation**

- `SB.rotationMatrix(axis, phi)`, `SB.rotateAxis(p, axis, phi, center)`, `SB.rotateX(p, phi, centerOrY)`. `p` is `[x, y, z]` or `[x, y, z, nx, ny, nz]`. A positive angle about x turns the top of a shape toward the viewer. A full turn is exact (tiny sines snap to zero), so a rolled loop repeats pixel for pixel.

**Baking**

- `SB.bakeSprite(scene, size, opts)`: one `{ width, height, data }`.
- `SB.bakeRoll(scene, frames, size, opts)`: an array of `frames` pictures, frame i turned by `i / frames` of `opts.turn` (default a full turn) about the x axis through `opts.center`. The full turn is not repeated, so the sequence loops. All frames share one scale. Returns `null` (does not throw) when nothing can be baked: `frames` below 1, a zero or missing size, or a picture over the size ceiling even at `ss` 1. **Callers must handle `null`.**
- `SB.baker(scene, size, opts)`: the same roll, baked in slices. It prepares the meshes, the scale and one working surface once, then bakes a frame only when asked. `opts` is the same as for `bakeRoll` plus `frames` (default 12) and `turn`. It returns `{ count, width, height, ss, scale, index, frame(i), next(), reset() }`:
  - `frame(i)` bakes picture `i` (any order, any number of times) or returns `null` if `i` is not an integer from 0 to `count - 1`.
  - `next()` bakes the picture at `index` and moves on; it returns `null` after the last one. `reset()` starts over.
  - The pictures are byte for byte what `bakeRoll` returns for the same input (a test checks this). Each picture owns its pixel array.
  - If nothing can be baked you still get an object, with `count` 0 and a `reason` (`'size'`, `'frames'` or `'too-big'`); `frame()` and `next()` return `null`. Check `count`.
  - Building the meshes happens inside `baker()` itself, so call it in its own tick. Bad scenes (empty, a bad material, a bad mesh function) still throw, because they are mistakes in your code, not load conditions.
- A scene is an array of parts `{ fn, nu, nv, material }` or `{ mesh, material }`. Meshes are built once and reused for every frame.
- `size`: a number, `[w, h]` or `{ width, height }` in output pixels. `bakeSprite` also returns `null` for a zero or missing size.
- `opts`: `phi` (bakeSprite only), `axis` (`[1,0,0]`; a zero-length axis means no turn), `center` (`[0,0,0]`), `ss` (integer supersampling, default 2), `maxPixels` (see below), `scale`/`ox`/`oy` (default: auto-fit and center so the shape fits at every roll angle), `margin` (2), `light`, `cull`, `outline` (`{ radius, color: [r, g, b] }`).
- **Size ceiling.** The working surface holds `width * height * ss * ss` pixels at 8 bytes each. `opts.maxPixels` (default `SB.DEFAULT_MAX_PIXELS`, 4,194,304, about 32 MiB) caps that count: if you ask for more, `ss` is lowered automatically until it fits (the `baker` object tells you the `ss` it used), and if even `ss` 1 is over the ceiling the bake returns `null`. A 1024 x 1024 sprite at `ss` 4 is therefore baked at `ss` 2. Pass `maxPixels: Infinity` to switch the ceiling off.
- Non-finite numbers: a triangle with a NaN or infinite number in it is skipped, so a custom shape that produces one bad vertex leaves a small hole instead of damaging the depth buffer. A NaN angle or a zero axis in `rotationMatrix` gives the identity (no turn), not a shrunken shape.
- `SB.outline(img, radius, color)`, `SB.downsample(rast, ss)`, `SB.toImageData(img)` (falls back to a plain `{ width, height, data }` if the platform will not build an `ImageData`).
- `SB.toCanvas(img, opts)`: browser only. Returns a new `<canvas>`, or **`null`** when there is no `document` (Node, a worker), the image is empty or malformed, or the browser will not give a 2D context (it can refuse a very large canvas). It never throws, so callers must handle `null`. `opts.willReadFrequently: true` asks for a plain-memory canvas (`getContext('2d', { willReadFrequently: true })`); the default is unchanged (`getContext('2d')`). Whether the flag helps drawing speed on your target phone is worth a quick A/B test with per-frame drawing included; it is meant for canvases you read back, which this module itself never does.

**Sharp on high-density screens.** The module bakes exactly the pixel size you ask for. If the sprite is drawn at 96 CSS pixels, bake it at `Math.round(96 * devicePixelRatio)` pixels (for example 288 on a 3x phone) and draw it with the 96 CSS pixel size, otherwise the browser upscales it and it looks soft or blocky. The size ceiling above still applies.

## How it differs from existing open source

Prior art is large and mostly better. Pick one of these first unless your constraints match the "Why it exists" list above.

- [three.js](https://threejs.org/) with WebGL is the practical way to render 3D in a browser: real cameras, lights, shadows, model loaders, and far more speed. If you can use WebGL, you can render to a canvas and `drawImage` the result as a sprite, and you will get a better picture than this. Older three.js releases also shipped CPU renderers (a canvas renderer and a software renderer); the community port [three-software-renderer](https://github.com/AVGP/three-software-renderer) keeps one alive for Node, but it needs three.js, is slower than WebGL, and its last tested three.js version listed on its page is 0.112.1.
- [Easel](https://www.npmjs.com/package/@xsyetopz/easel) (`@xsyetopz/easel`) is the closest current cousin. As reported when this README was checked (2026-10-15; not run here): MIT, version 0.8.0 (2026-09-27), no dependencies, draws on the processor into a 2D canvas, with a three.js-style scene graph. Unverified: how it shades, how fast it is, and whether it can bake sprite sheets. It looks like a general scene engine; sprite-baker is a narrow toon baker with a looping roll and no scene graph. Look at Easel first if you want more than a few shapes.
- **tinygl.js** is a JavaScript port of the TinyGL software renderer that needs no WebGL. As reported (unverified, not run, no project page checked): it lists a limit that the canvas width be a multiple of 4. It aims at OpenGL-style drawing, not at baked, outlined sprite frames.
- [Tiny Renderer](https://github.com/ssloy/tinyrenderer) (ssloy) is the best place to learn how a software rasterizer works: a step-by-step course covering lines, triangles, z-buffers, perspective and shaders, with real model files. It is a tutorial in C++, not a drop-in JavaScript library, and sprite-baker is a small, narrow take on the same ideas (barycentric fill, z-buffer, per-pixel normals).
- [Zdog](https://zzz.dog/) is a pseudo-3D engine for canvas and SVG. It draws flat, vector-style shapes (it is not a shaded rasterizer), has a friendly designer-oriented API and animates live. If you want flat illustrated 3D, use it. sprite-baker gives per-pixel shaded surfaces and pre-rendered bitmaps instead.
- [glMatrix](https://github.com/toji/gl-matrix) is the standard fast vector and matrix library. sprite-baker has only the three small rotation helpers it needs, with no perspective, no cameras and no scene graph. If you need real 3D math, use glMatrix.
- Blender or any offline renderer will bake far better sprite sheets (global lighting, anti-aliasing, any model). The upside of this library is that the sprites are generated at load time from a few lines of code, with no art pipeline and no asset files.

What is honestly not new: the barycentric triangle fill, z-buffer, wrap lighting and ramp-based toon shading are textbook. The small contribution here is the packaging: one dependency-free file, canvas-free so it is testable in Node, with a roll baker that loops exactly.

## Limits and gotchas

- Orthographic only. No perspective, no clipping against a near plane, no texture mapping, no transparency, no shadows.
- Alpha is binary inside the rasterizer. Smooth edges come from `ss` (supersampling, box filter). Raise `ss` to 3 or 4 for cleaner edges; cost grows with `ss` squared.
- Depth is float32 and ties keep the first-drawn triangle. Fine for sprites, not for coplanar overlapping surfaces.
- Normals from finite differences take their sign from `dP/du x dP/dv`. The default `'auto'` orientation works for closed, roughly convex shapes. For open or hollow surfaces (a tube you look into) pass `flip: true` or `false`, or return exact normals from `fn`.
- Faces are culled when the three vertex normals' z components sum below -0.75. That suits closed meshes. For open one-sided surfaces or surfaces whose normals you supplied backwards, pass `cull: false`.
- The bounce, pooled-shadow and right-edge rim terms point in fixed screen directions on purpose (they are part of the look); only the main light and highlight follow `light`.
- A shape that is a surface of revolution about the roll axis (a plain sphere, a smooth capsule) looks identical in every roll frame. Give it something off-axis: ridges (`lobes`), a bead, a decal part, a ring.
- `outline` rounds its stamp offsets to whole pixels and merges them with a maximum. The original blended fractional offsets through canvas compositing, so outlines here are a touch harder-edged. Leave a margin (auto-fit does) because outline pixels pushed past the image border are cut.
- Speed: baking 16 frames of a 160 x 96 capsule at `ss: 2` took roughly 0.3 s in Node on a modest machine. That is a rough figure from one run, not a benchmark, and a phone will be slower. This is meant for load time, not per-frame use.
- No worker is needed: bake in slices with `SB.baker` and `frame(i)` or `next()`, one frame per tick, so the title screen keeps moving. Slicing is the supported way to avoid a long freeze when the project does not use workers (the single-file games this was extracted from do not). The core has no DOM use, so it also runs in a classic worker (`importScripts`) if yours allows one; there `toCanvas` returns `null` and you transfer the pixel arrays instead (not tested here). The first `drawImage` of each new canvas can still cost a graphics-card upload.
- The module never reads a canvas back: no `getImageData`, `toBlob` or `toDataURL`. Pictures live in typed arrays and go to a canvas only through `putImageData`. So Firefox's canvas read-back noise (on with resist-fingerprinting, Strict mode and private windows) cannot alter what it bakes. Only the headless-test tip below (reading a canvas with `getImageData`) would be affected.
- Meshes are cached per part object. If you change a part's `nu`, `nv` or `fn` after it was baked, pass a new part object (or a mesh you built yourself); the old mesh is reused.
- Thin 1 to 2 pixel details with an outline radius of 4 or more can show as a dotted halo, because the outline is stamped at 24 rounded offsets. Straight edges are fine.
- The pinned hash in the tests depends on `Math.sin`/`Math.cos` results. They are stable across Node versions in practice, but if a platform differs in the last bit and the hash moves, check the images before blindly updating the constant.

## For AI agents

Invariants to preserve unless you are changing the look on purpose (and then update the pinned hash in `test/run.js` deliberately, after looking at the picture):

- Pixel sampling at centers (`x + 0.5`), inclusive edges with the `-1e-5` barycentric tolerance, and the strict `z > stored z` depth test with `-1e9` clear value. Do not switch to "greater or equal" or to exclusive edges: that reopens cracks or flips tie behavior.
- The shading constants in `tri` (0.35/0.65 wrap, 0.9 and 0.16 bounce, 0.3 pool, the three highlight lobes 16/110/380 with 0.55/0.55/0.5, the 0.4 rim) are the look. Change them only deliberately.
- `rotationMatrix` negates the angle so positive x rotation brings the top toward the viewer; it snaps tiny sines and cosines to zero so a full turn is exact. The "frame 0 equals a full-turn render" test relies on both.
- `bakeRoll` renders angles `i / frames * turn` for `i < frames` (the end angle is not repeated), uses one scale for all frames and reuses one `Rast`.
- Keep the file dual-loading (last line), the license header (first line), and keep it dependency-free and canvas-free at its core. Only `toCanvas` may touch `document`.
- Keep game-specific content out: no character art, names, or palettes from the source game. Use American English.

- Every baking path goes through one internal `setup()` (meshes, ceiling, scale, one `Rast`) and its `render(phi)`, so `bakeSprite`, `bakeRoll` and `baker` cannot drift apart. Keep it that way: the test "next() x 8 gives frames byte-identical to bakeRoll" guards it.
- `tri` skips any triangle with a non-finite number. Keep that check: a NaN depth never loses a depth test and corrupts the buffer.
- Probes and loaders do not throw: `toCanvas` and the bakers return `null` (or an inert `baker`) for load conditions. Only programmer errors (empty scene, bad material or mesh) throw.

Run the tests: `node modules/sprite-baker/test/run.js` (exits non-zero on failure). To check the example headless, use Playwright for Python with Chromium: open `demo.html` over `file://`, collect `console` errors and `pageerror` events, and read both baked canvases back with `getImageData` to confirm they are not blank. That read-back is the one place a canvas is read, and it is scrambled in Firefox with resist-fingerprinting, Strict mode or private windows, so do this check in Chromium (or turn that Firefox setting off).

What not to change: the exported names listed in the API section (other code may call them), and the "no dependencies, no build step" rule.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Fancy, the Banana](https://github.com/JNFoo/fancy-banana)
