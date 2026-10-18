# netflow-engine

**Version 1.0.0 · API 1**

**Tested in:** Node 22 (10 checks, plus 225 identical-layout comparisons against Netflow Map's own engine), ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5

The engine of Netflow Map as a module you can copy and adapt. You give it a list of items and links; it works out where everything goes (as a story laid out in rows, arcs, a matrix, a shape, or as a network of any size), scores the drawing, and hands back plain numbers ready to draw. It runs with no page, so it works in a worker, in Node, or on the main thread. It reads and prepares the data into flat typed arrays, finds choke points and traffic, then places items with a layered, force or distance-based method (the heavy force and distance steps run in WebAssembly when the page allows it and in plain JavaScript when not, with identical results).

Forged by LFC Foundry. Copyright (c) 2026 LFC Foundry, MIT license.

## Why it exists

Netflow Map keeps getting faster and lighter, and those gains live in its engine: a 30,000-item network went from 42 seconds to under a second in one week. The owner's rule (2026-10-18) is that **every significant update to the Netflow Map engine is also published here as a new version of this module**, so other people can adapt it for their own special cases. The optimized add-ons (layered drawing, Sankey flow chart, regular network maps) bolt onto this engine and are versioned on their own; none of them is the engine.

## Use

```html
<script src="netflow-layers.js"></script>   <!-- only for the story views (Flow, Top-down, Spine, Lanes, River, Arc, Matrix); the Network view does not need it -->
<script src="netflow-engine.js"></script>
```
```js
var graph = { start: 'a', nodes: [{ id: 'a', label: 'Start', group: '', valence: '', ghost: false, attrs: {} },
                                   { id: 'b', label: 'Next',  group: '', valence: '', ghost: false, attrs: {} }],
              edges: [{ from: 'a', to: 'b', label: '', kind: '', attrs: {} }] };
var L = NetflowEngine.build(graph, { view: 'network', arrange: 'stress', colorBy: 'group' });
// L.nodes: one record per item with its place (cx, cy for the Network view; x, y for rows), size and color value
// L.edges: one record per link; L.groups: the groups; L.ms: how long the build took
```
In Node: `const E = require('./netflow-engine.js'); E.use('layers', require('../netflow-layers/netflow-layers.js'));` (the layers module is also found on its own when it sits next to this folder).

## Views and arrangements

`NetflowEngine.VIEWS` lists the nine views: `flow`, `down`, `spine`, `lanes`, `shape`, `river`, `arc`, `matrix`, `network`. The Shape view returns `segs` and `spine` (stretches between choke points) and no `nodes`. For `network`, `arrange` picks the method: `stress` (Distances, the default for big maps), `closeness`, `force`, `radial`, `circle`, `rings`, `groups`, `grid`, `force3d`, `sphere`, `stack` (`NetflowEngine.ARRANGE_NAMES` has the names; `arrangeAdvice()` says which fits a given map). Other options: `colorBy`, `sizeBy`, `widthBy`, `edgeColorBy`, `laneBy`, `agg`, `mode`, `amounts` (see the comment above `build` in the file).

## Add-ons

- **Layered drawing (netflow-layers 1.2.0 or newer)**: required for every story view. Found as a global `NetflowLayers`, or as `../netflow-layers/netflow-layers.js` in Node, or handed over with `NetflowEngine.use('layers', impl)`. If it is missing, the view that needs it throws a message that says so; the Network view still works.
- **Sankey add-on**: optional (netflow-sankey 2.1.0 or newer). `NetflowEngine.use('sankey', impl)` and pass `sk` options to the River view; without it the River view keeps the plain layered picture. The River view calls three things on the add-on: `options(sk)`, `layout(layered, options)` and `apply(layered, result)`. netflow-sankey 2.0.0 has `layout` but not `options` or `apply` (Netflow Map's own copy has all three), so with 2.0.0 handed over, a River view that is given `sk` options throws "SK.options is not a function"; a River view without `sk` options works. netflow-sankey 2.1.0 added the two calls, so use 2.1.0 or newer.
- **Your own**: the engine's other parts (`separate`, `forceSim`, `networkLayout`, `communities`, `metrics`, `taskScore`) are exported so an add-on can call them. An add-on never reaches into the engine's private storage. This is the same shape the Netflow Map add-ons use.
- `NetflowEngine.columns` is the column reader (numbers as people write them, dates, categories, small formulas); `status()` returns `{ placeholder: false, version, api }`.

## WebAssembly

The Force and Distances steps have a WebAssembly twin (`forceWasm`, `stressWasm`: each has `on`, `minItems` (150), `calls`, `error`). Turn one off with `NetflowEngine.forceWasm.on = false`; the plain-JavaScript path gives the same positions to the last digit (a check proves it). The only page-policy addition needed is `'wasm-unsafe-eval'` in `script-src`; nothing else is loosened. Sources are in `wasm/` (`force.c`, `stress.c`); `sh wasm/build.sh` rebuilds both (clang 18 with the wasm32 target and wasm-ld; two builds give the same bytes) and `python3 wasm/embed.py` puts them into `netflow-engine.js`.

## Speed

Layout time, lower is better, one run each, cold start, the same network (1,000, 3,000, 10,000 items, Distances arrangement), in each browser one at a time:

| Browser | 1,000 items | 3,000 items | 10,000 items |
|---|---|---|---|
| Chromium 155.0.8059.39 | 192 ms | 924 ms | 746 ms |
| Firefox 158.0 | 240 ms | 854 ms | 810 ms |
| WebKitGTK 2.52.6 | 244 ms | 770 ms | 552 ms |
| GNOME Web 46.5 | 169 ms | 787 ms | 533 ms |

The 10,000-item map is quicker than the 3,000-item one because the first big layout in a fresh page is cold (the wasm code warms up); a layout after that is about 1.4× faster in Chromium. Against the first version of Netflow Map's engine (2026-10-14), the same maps in the app took: 10,000 items 7.25 s to 456 ms (16×, Firefox 159), 30,000 items 42.1 s to 812 ms (52×), 100,000 items from over 60 s to 4.29 s. Netflow Map's numbers come from the app's build of this same engine (identical layouts, see Tests).

## Size

191 KB as one file, 61 KB gzipped (about 24 KB of it is the two WebAssembly helpers as text). No dependencies other than the optional add-ons above.

## Tests

`node modules/netflow-engine/test/run.js` (9 checks, about 2 seconds): every view on a 300-page story and a 1,500-item network, repeatable output, identical positions with and without WebAssembly (Force and Distances, 600 items), no two items on top of each other (2,000 items, three arrangements), odd inputs (a start that does not exist, an empty map, one item), `use()` names, the column reader, and that the file builds no code from text. Separately, Netflow Map checks that this file gives the same layout as its own engine: 225 builds (5 maps × 9 views × 5 option sets), 0 differences.

## Limits

- Story views need netflow-layers. The Sankey look needs an add-on with `options`, `layout` and `apply` (see above; netflow-sankey 2.1.0 or newer has all three).
- It does not draw anything. Drawing (WebGL 2, plain canvas) lives in Netflow Map itself and is not part of this module.
- Item and link records follow Netflow Map's data shape (`nodes` with `id`, `label`, `group`, `valence`, `ghost`, `attrs`; `edges` with `from`, `to`, `label`, `kind`, `attrs`, optional `weight`). Importers for CSV, JSON and other formats are in Netflow Map, not here.
- The first layout in a fresh worker is slower than later ones (WebAssembly warm-up). Netflow Map warms its worker when idle; a page using this module can do the same by building a small map once.

## How updates ship

1. The Netflow Map team finishes an engine change and writes a short note (what changed, in numbers, from the four test browsers).
2. A new version of this module is published with a plain-words changelog entry. The module's file is cut from the app's engine by `tools/build-engine-module.mjs` in Netflow Map, so the two cannot drift apart.
3. Netflow Map then uses the published version. Add-ons keep their own version numbers and say which engine versions they were tested with.

Version meaning: patch for a fix, minor for something new that breaks nobody, major when someone could be caught out (the API number equals the major).

## For AI agents

The file is generated; do not hand-edit `netflow-engine.js`. It is made from Netflow Map's `src/engine.js` and `src/columns.js` by `node tools/build-engine-module.mjs X.Y.Z out.js`, and `node tools/check-engine-module.mjs out.js` proves it matches the app. To change the engine, change it in Netflow Map and publish a new version here. Bump with `python3 tools/versions/versions.py set netflow-engine X.Y.Z --tested "..." --note "..."`. Keep the engine free of any code that belongs to one add-on.

## Prior art and credits

- The engine is Netflow Map's own, by LFC Foundry. It starts from the layered, arc, matrix and shape drawings, choke points, traffic and drawing scores of the Story Editor's map (story-editor `editor/maplayout.js`, MIT, copied and generalized; no dependency on it).
- Choke points use the dominator tree of Cooper, Harvey and Kennedy (2001). The Distances (stress) layout minimizes stress by stochastic gradient descent (Zheng, Pawar and Goodman, 2018) and uses far-apart pivot items for big maps. The Force arrangement uses Barnes-Hut repulsion (a quadtree in 2D, an octree in 3D). Quick groups use label propagation. The source comments name no other published method.
- Related published pieces: [netflow-layers](../netflow-layers/README.md) and [netflow-sankey](../netflow-sankey/README.md), both cut from Netflow Map.
