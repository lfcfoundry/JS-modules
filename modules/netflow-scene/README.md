# netflow-scene

**Version 1.1.0 · API 1**

**Tested in:** Node 22 (4 checks); Firefox 158.0, ungoogled Chromium 155.0.8059.39-1, WebKitGTK 2.52.6 one at a time (page check: flat links equal, rules + bends equal; speed 1.0.0 vs 1.1.0 alternating, 30,000 items). Not tried on a real phone.

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

## Limits
- Needs the layout shape of netflow-engine 2.2.2 or newer (`nodes`, `edges`, `is3d`, `parked`/`wake`).
- Number formatting uses netflow-engine's formatter when `NetflowEngine` is loaded (or `NFMColumns`); without either it rounds to two digits.
- Drawing itself (Canvas, WebGL, WebGPU) is not in this module.
- Not tried on a real phone.

## Prior art and credits
The scene lists follow the common "scene graph for a chart" idea; links as typed arrays follow struct-of-arrays practice. No code from other projects.

## For AI agents
Copy `netflow-scene.js` (single file, no dependencies). Run `node modules/netflow-scene/test/run.js` (pass/fail) and `node tools/test-runner/cli.js all tests/netflow-scene-browser.js` (three browsers). Do not change a released version; ship a new one.
