# netflow-scene

**Version 1.3.1 · API 1**

**Tested in:** Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6

Turns a map laid out by [netflow-engine](../netflow-engine/README.md) into plain drawing lists (dots, links, labels, ribbons, shapes, a legend) that Canvas 2D, WebGL2, WebGPU or an SVG export can all draw the same way. It decides colors, widths, dashes, arrows, which labels fit and what a click would hit; it never touches a page. Big flat maps (2,000 or more straight links) keep their links in typed lists instead of one object per link, and a map rebuilt only because items moved or labels changed reuses each link's look from the last picture.

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry. This is the scene builder of Netflow Map as a module you can adapt.

## Why it exists
Netflow Map draws maps of up to 100,000 items with four different drawing backends. Each one needs the same answers (where, what color, how thick), so those answers live in one place with no page code in it. Others who draw their own networks, flows or matrices can take the same step and draw the lists with whatever they like.

## Use

```js
var L = NetflowEngine.build(graph, { view: 'network', colorBy: 'group' });   // netflow-engine 2.2.2 or newer
var S = NetflowScene.make(L, { theme: 'light', colorBy: 'group' });
// S.dots, S.curves, S.labels, S.rects, S.ribbons, S.polys, S.icons, S.legend; draw them yourself, or:
svgElement.innerHTML = NetflowScene.toSvg(S, 'My map');
```

`make(L, options)`: the options are listed at the top of `netflow-scene.js` (theme, colorBy, palette, nodeStyle, linkStyle, labelFn, lab, widthScale, hulls, cam, lens, curve and more). `style`, `restyle`, `pick`, `pickEdge`, `pickLabel`, `inRect`, `inLasso` and `hit` work on the scene it returns. Colors are `[r, g, b, a]` with 0 to 1 numbers.

## Reusing link looks (`lookPlan`)
Pass the same empty object as `lookPlan` on every rebuild that only moved items or changed label sizes. You own it: **drop it (pass nothing) on every other kind of change**. The scene starts it over by itself for another map, theme, palette, color mode or link count. 3D maps and fisheye lenses never use it.

## Flat link lists and the link accessors
A flat map of 2,000 or more links is built straight into typed lists, also with link rules (`linkStyle`), dashes, arrowheads and bent links (`curve`); arrowhead tips are kept in a `TIP` list. Pass `flat: false` to force one object per link (used by the tests). Read the links without waking them with these scene methods (public API):

| Method | Meaning |
|---|---|
| `curveCount()` | Number of links. |
| `curvesPacked()` | True while the links are typed lists. |
| `curvesStraight()` | True when every link is a plain straight line (false when any link has a dash, arrow or bend). |
| `eachCurveView(fn)` | Calls `fn(link, i)` for each link; the object is reused, so do not keep it. A link has `tip` (an array of two numbers, or undefined). |
| `curveView(i)`, `curveAt(i)` | One link for reading; `curveAt` makes a real object. |
| `curveFlat()` | The typed lists themselves (`P, COL, W, DASH, A, EDGE, FR, TO, FL, TIP`) or null. |
| `curves` | Reading it makes every link an object (the lists are let go). |
| `packNow()`, `autoPack(opts)` | Pack the links now, or after a pause. |

Values in the lists are 32-bit.

## Position index for big maps (since 1.3.0; optional file)
`netflow-scene-index.js` (global `NetflowSceneIndex`, needs [elias-fano](../elias-fano/README.md) 1.0.0 or newer) is an optional companion for maps of 100,000 items or more (up to 1,048,576). Pass it as `spatial` and the scene keeps the sorted Z-order (Morton) codes of the item centers as Elias-Fano instead of the pick grid; `NetflowScene.pick` and `NetflowScene.inRect` then read a few short stretches of that list. Under 100,000 items nothing changes (the grid wins there), and boxes bigger than 10% of the picture's area still use the plain scan.

```js
var S = NetflowScene.make(L, { theme: 'light', spatial: NetflowSceneIndex });   // S.spatial is null on small maps
```

`inRect` gives the same keys in the same order as before; `pick` gives the same item except when two overlapping boxes share the very same paint order number. After items move, the index is rebuilt together with the grid it replaces.

1,000,000 items (Firefox 158 / Chromium 155 / WebKitGTK 2.52.6, ms; test `tests/netflow-scene-index-browser.js`):

| Job | Today (grid, scan) | With the index |
|---|---|---|
| Build | 115 / 81 / 126 | 135 / 62 / 76 |
| 3,000 picks | 76 / 51 / 49 | 18 / 16 / 19 |
| 20 small box selects (2% side) | 398 / 596 / 391 | 2 / 3 / 3 |
| 20 mid box selects (10% side) | 424 / 584 / 395 | 48 / 65 / 100 |
| 20 big box selects (40% side) | 562 / 648 / 604 | scan used: 588 / 621 / 603 |

Memory: 1.8 MB of codes plus a 4 MB item order, against about 1.25 million grid entries.

## Look settings (since 1.2.0; optional file)
`netflow-scene-look.js` (global `NetflowSceneLook`) is an optional companion. One small object says how a map is colored and set in type: `{ base: 'auto'|'light'|'dark', slots: { bg: '#hex', ... }, groups: [12 colors or ''], ramp: [2 to 6 colors], font, nodeScale: 0.4..3 }`. `clean()` makes any outside object (saved text, a shared view, an imported file) safe; `resolve()` lays it over a scene theme; `register(NetflowScene, look, 'light')` puts the result into this module's exported, mutable `THEMES`, `PALETTES` and `RAMPS` under a name made from a hash of the look and returns `{ theme, palette, ramp }` to pass to `make()`, so `netflow-scene.js` itself needs no change to use it. It also holds 12 `PRESETS` and `warnings()` (text contrast under 4.5, link contrast under 2). No DOM, no storage: runs in a page, a worker and Node (`node modules/netflow-scene/test/look.js`, 23 checks).

```js
var look = NetflowSceneLook.clean({ base: 'dark', slots: { bg: '#101820' }, nodeScale: 1.4 });
var names = NetflowSceneLook.register(NetflowScene, look, 'light');
var S = NetflowScene.make(L, { theme: names.theme, palette: names.palette, ramp: names.ramp });
```

## Limits
- Needs the layout shape of netflow-engine 2.2.2 or newer (`nodes`, `edges`, `is3d`, `parked`/`wake`).
- Number formatting uses netflow-engine's formatter when `NetflowEngine` is loaded (or `NFMColumns`); without either it rounds to two digits.
- Drawing itself (Canvas, WebGL, WebGPU) is not in this module.
- Not tried on a real phone.

## See it in action

Used right now in Netflow Map (its repository is private, so there is no link). Checked in each app's shipped file on its main branch on 2026.10.29. The module's own page is `demo.html` in this folder.

## Prior art and credits
The scene lists follow the common "scene graph for a chart" idea; links as typed arrays follow struct-of-arrays practice. No code from other projects.

## For AI agents
Copy `netflow-scene.js` (single file, no dependencies). Run `node modules/netflow-scene/test/run.js` (pass/fail) and `node tools/test-runner/cli.js all tests/netflow-scene-browser.js` (three browsers). Do not change a released version; ship a new one.
