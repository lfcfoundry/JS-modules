# sprite-baker

Run the tests (offline, about a second): `node modules/sprite-baker/test/run.js`

## What it is

A tiny software 3D rasterizer for Canvas 2D games. You describe a few smooth parametric shapes, it shades them with a toon color ramp on the CPU (no WebGL), and it bakes the result into ordinary 2D sprites: one picture, or N pictures of the shape rolling about a fixed horizontal axis. Your game then draws those pictures with `drawImage` and never touches 3D again.

About 600 lines of plain JavaScript, a third of them comments, no dependencies, no build step. The core works in Node without a canvas; the browser helpers are optional.

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
  var frames = SB.bakeRoll(scene, 12, 96, { outline: { radius: 2, color: [14, 24, 40] } }).map(SB.toCanvas);
  var g = document.getElementById('c').getContext('2d'), i = 0;
  setInterval(function () { g.clearRect(0, 0, 96, 96); g.drawImage(frames[i++ % frames.length], 0, 0); }, 100);
</script>
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
- `SB.bakeRoll(scene, frames, size, opts)`: an array of `frames` pictures, frame i turned by `i / frames` of `opts.turn` (default a full turn) about the x axis through `opts.center`. The full turn is not repeated, so the sequence loops. All frames share one scale.
- A scene is an array of parts `{ fn, nu, nv, material }` or `{ mesh, material }`. Meshes are built once and reused for every frame.
- `size`: a number, `[w, h]` or `{ width, height }` in output pixels.
- `opts`: `phi` (bakeSprite only), `axis` (`[1,0,0]`), `center` (`[0,0,0]`), `ss` (integer supersampling, default 2), `scale`/`ox`/`oy` (default: auto-fit and center so the shape fits at every roll angle), `margin` (2), `light`, `cull`, `outline` (`{ radius, color: [r, g, b] }`).
- `SB.outline(img, radius, color)`, `SB.downsample(rast, ss)`, `SB.toImageData(img)`, `SB.toCanvas(img)` (browser only).

## How it differs from existing open source

Prior art is large and mostly better. Pick one of these first unless your constraints match the "Why it exists" list above.

- [three.js](https://threejs.org/) with WebGL is the practical way to render 3D in a browser: real cameras, lights, shadows, model loaders, and far more speed. If you can use WebGL, you can render to a canvas and `drawImage` the result as a sprite, and you will get a better picture than this. Older three.js releases also shipped CPU renderers (a canvas renderer and a software renderer); the community port [three-software-renderer](https://github.com/AVGP/three-software-renderer) keeps one alive for Node, but it needs three.js, is slower than WebGL, and its last tested three.js version listed on its page is 0.112.1.
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
- Speed: baking 16 frames of a 160 x 96 capsule at `ss: 2` takes roughly 0.3 s in Node on a modest machine. This is meant for load time or in a worker, not per-frame use.
- The pinned hash in the tests depends on `Math.sin`/`Math.cos` results. They are stable across Node versions in practice, but if a platform differs in the last bit and the hash moves, check the images before blindly updating the constant.

## For AI agents

Invariants to preserve unless you are changing the look on purpose (and then update the pinned hash in `test/run.js` deliberately, after looking at the picture):

- Pixel sampling at centers (`x + 0.5`), inclusive edges with the `-1e-5` barycentric tolerance, and the strict `z > stored z` depth test with `-1e9` clear value. Do not switch to "greater or equal" or to exclusive edges: that reopens cracks or flips tie behavior.
- The shading constants in `tri` (0.35/0.65 wrap, 0.9 and 0.16 bounce, 0.3 pool, the three highlight lobes 16/110/380 with 0.55/0.55/0.5, the 0.4 rim) are the look. Change them only deliberately.
- `rotationMatrix` negates the angle so positive x rotation brings the top toward the viewer; it snaps tiny sines and cosines to zero so a full turn is exact. The "frame 0 equals a full-turn render" test relies on both.
- `bakeRoll` renders angles `i / frames * turn` for `i < frames` (the end angle is not repeated), uses one scale for all frames and reuses one `Rast`.
- Keep the file dual-loading (last line), the license header (first line), and keep it dependency-free and canvas-free at its core. Only `toCanvas` may touch `document`.
- Keep game-specific content out: no character art, names, or palettes from the source game. Use American English.

Run the tests: `node modules/sprite-baker/test/run.js` (exits non-zero on failure). To check the example headless, use Playwright for Python with Chromium: open `demo.html` over `file://`, collect `console` errors and `pageerror` events, and read both baked canvases back with `getImageData` to confirm they are not blank.

What not to change: the exported names listed in the API section (other code may call them), and the "no dependencies, no build step" rule.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Fancy, the Banana](https://github.com/JNFoo/fancy-banana)
