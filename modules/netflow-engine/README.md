# netflow-engine

**Version 2.0.0 · API 2**

**Tested in:** Node 22 checks (11) and 225 identical-layout comparisons with Netflow Map's own engine; 135 builds (3 maps x 9 views x 5 option sets, tight and wide) and 6 Sankey builds with sk options identical to Netflow Map's own engine in ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, one at a time

The engine of Netflow Map as a module you can copy and adapt. You give it a list of items and links; it works out where everything goes (as a story laid out in rows, arcs, a matrix, a shape, or as a network of any size), scores the drawing, and hands back plain numbers ready to draw. It runs with no page, so it works in a worker, in Node, or on the main thread. It reads and prepares the data into flat typed arrays, finds choke points and traffic, then places items with a layered, force or distance-based method (the heavy force and distance steps run in WebAssembly when the page allows it and in plain JavaScript when not, with identical results).

Forged by LFC Foundry. Copyright (c) 2026 LFC Foundry, MIT license.

## Why it exists

Netflow Map keeps getting faster and lighter, and those gains live in its engine: a 30,000-item network went from 42 seconds to under a second in one week. The owner's rule (2026-10-18) is that **every significant update to the Netflow Map engine is also published here as a new version of this module**, so other people can adapt it for their own special cases. The optimized add-ons (layered drawing, Sankey flow chart, regular network maps) bolt onto this engine and are versioned on their own; none of them is the engine.

## Use

```html
<script src="netflow-layers.js"></script>   <!-- only for the story views (Flow, Top-down, Spine, Lanes, Sankey, Arc, Matrix); the Network view does not need it -->
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

`NetflowEngine.VIEWS` lists the nine view ids in this order: `flow`, `down`, `spine`, `lanes`, `shape`, `sankey`, `arc`, `matrix`, `network`. In 1.0.0 the sixth id had another name; 2.0.0 knows only `sankey` (an old id draws the Flow picture, like any unknown id). The Shape view returns `segs` and `spine` (stretches between choke points) and no `nodes`. For `network`, `arrange` picks the method: `stress` (Distances, the default for big maps), `closeness`, `force`, `radial`, `circle`, `rings`, `groups`, `grid`, `force3d`, `sphere`, `stack` (`NetflowEngine.ARRANGE_NAMES` has the names; `arrangeAdvice()` says which fits a given map). Other options: `colorBy`, `sizeBy`, `widthBy`, `edgeColorBy`, `laneBy`, `agg`, `mode`, `amounts` (see the comment above `build` in the file).

`spread: "wide"` (Flow, Top-down, Spine and Lanes only; needs netflow-layers 1.3.0 or newer, an older copy ignores it) draws the story views looser and more like a tree for wide screens: more room beside each box, and a box over the middle of the boxes it leads to. `"tight"`, or leaving it out, is the compact picture as before. Handy as a switch next to the view list.

## Add-ons

- **Layered drawing (netflow-layers 1.2.0 or newer; 1.3.0 for `spread: "wide"`)**: required for every story view. Found as a global `NetflowLayers`, or as `../netflow-layers/netflow-layers.js` in Node, or handed over with `NetflowEngine.use('layers', impl)`. If it is missing, the view that needs it throws a message that says so; the Network view still works.
- **Sankey add-on**: optional (netflow-sankey 2.1.0 or newer). `NetflowEngine.use('sankey', impl)` and pass `sk` options to the Sankey view; without it the Sankey view keeps the plain layered picture. The Sankey view calls three things on the add-on: `options(sk)`, `layout(layered, options)` and `apply(layered, result)`. netflow-sankey 2.0.0 has `layout` but not `options` or `apply` (Netflow Map's own copy has all three), so with 2.0.0 handed over, a Sankey view that is given `sk` options throws "SK.options is not a function"; a Sankey view without `sk` options works. netflow-sankey 2.1.0 added the two calls, so use 2.1.0 or newer.
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

## How it compares

Run on 2026-10-18 against d3-force 7.9.0, Cytoscape cose 3.34.4, dagre 0.8.5 and ELK (elkjs) 0.12.0, each with its default options, in ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5, one browser at a time. Every case is a fresh page under `script-src 'self' 'wasm-unsafe-eval'`; 3 runs per case (a case over 20 s ran once); 60 s limit per case. The networks are generated from a fixed seed. Speeds are from the browsers only.

**In short:** the engine was faster in every case that finished, in all four browsers (higher is better for the engine): 3.2x to 4.8x faster than d3-force, 20.8x to 93.6x than Cytoscape, 304x to 614x than ELK's stress layout (300 items; nothing larger finished), 9.8x to 243x than dagre and 17.9x to 138.7x than ELK's layered layout. Where it gives something up:

- Cytoscape's force layout has slightly lower stress at 300 and 1,000 items (by 0.001 to 0.011, lower is better), and takes 21x to 94x longer; at 3,000 items it went over 60 s in all four browsers.
- ELK's layered layout has fewer crossings at 1,000 items (6,471 against 6,499, about 0.4% fewer) and at 3,000 items (35,909 against 37,247, about 3.6% fewer). At 300 items the engine has the fewest (559 against ELK 632 and dagre 784).
- ELK's stress layout needed 15.9 s to 26.4 s for 300 items (one run each) and went over 60 s at 1,000 and 3,000; its stress at 300 was 0.170 against the engine's 0.161.

#### Force (springs), network

First layout in a fresh page, lower is better, median of 3. Quality (stress, lower is better) is ungoogled-chromium's value.

| Items | Library | ungoogled-chromium | Firefox | WebKitGTK | GNOME Web | Quality |
|---|---|---|---|---|---|---|
| 300 | Netflow engine | 113 ms | 93 ms | 104 ms | 101 ms | 0.178 |
| 300 | d3-force | 377 ms | 450 ms | 370 ms | 397 ms | 0.194 |
| 300 | Cytoscape (cose) | 2,361 ms | 3,943 ms | 2,880 ms | 2,965 ms | 0.167 |
| 1,000 | Netflow engine | 393 ms | 387 ms | 379 ms | 371 ms | 0.171 |
| 1,000 | d3-force | 1,505 ms | 1,768 ms | 1,429 ms | 1,441 ms | 0.194 |
| 1,000 | Cytoscape (cose) | 28.6 s (1 run) | over 60 s | over 60 s | 34.7 s (1 run) | 0.167 |
| 3,000 | Netflow engine | 1,399 ms | 1,462 ms | 1,584 ms | 1,473 ms | 0.190 |
| 3,000 | d3-force | 4,992 ms | 6,023 ms | 5,101 ms | 5,240 ms | 0.198 |
| 3,000 | Cytoscape (cose) | over 60 s | over 60 s | over 60 s | over 60 s | - |

#### Distances (stress), network

First layout in a fresh page, lower is better, median of 3. Quality (stress, lower is better) is ungoogled-chromium's value.

| Items | Library | ungoogled-chromium | Firefox | WebKitGTK | GNOME Web | Quality |
|---|---|---|---|---|---|---|
| 300 | Netflow engine | 55 ms | 43 ms | 34 ms | 54 ms | 0.161 |
| 300 | ELK | 22.8 s (1 run) | 26.4 s (1 run) | 15.9 s (1 run) | 16.4 s (1 run) | 0.170 |
| 1,000 | Netflow engine | 233 ms | 209 ms | 228 ms | 210 ms | 0.159 |
| 1,000 | ELK | over 60 s | over 60 s | over 60 s | over 60 s | - |
| 3,000 | Netflow engine | 1,367 ms | 1,323 ms | 1,123 ms | 1,180 ms | 0.172 |
| 3,000 | ELK | over 60 s | over 60 s | over 60 s | over 60 s | - |

#### Layered, top to bottom

First layout in a fresh page, lower is better, median of 3. Quality (crossing link pairs, lower is better) is ungoogled-chromium's value.

| Items | Library | ungoogled-chromium | Firefox | WebKitGTK | GNOME Web | Quality |
|---|---|---|---|---|---|---|
| 300 | Netflow engine | 38 ms | 28 ms | 17 ms | 22 ms | 559 |
| 300 | dagre | 369 ms | 346 ms | 455 ms | 537 ms | 784 |
| 300 | ELK | 714 ms | 500 ms | 862 ms | 786 ms | 632 |
| 1,000 | Netflow engine | 68 ms | 44 ms | 32 ms | 35 ms | 6,499 |
| 1,000 | dagre | 5,927 ms | 4,445 ms | 7,786 ms | 7,405 ms | 6,885 |
| 1,000 | ELK | 1,827 ms | 2,417 ms | 2,142 ms | 2,167 ms | 6,471 |
| 3,000 | Netflow engine | 116 ms | 91 ms | 80 ms | 98 ms | 37,247 |
| 3,000 | dagre | over 60 s | over 60 s | over 60 s | over 60 s | - |
| 3,000 | ELK | 8,404 ms | 12.6 s (1 run) | 7,688 ms | 7,997 ms | 35,909 |

"Over 60 s" means the case was stopped at the limit; a later browser did not run it again. The engine's quality differs by up to 0.007 between browsers on the same case, so the tables show Chromium's.

| Library (version, license) | Minified | Gzipped (smaller is better) |
|---|---|---|
| This engine 2.0.0 (MIT), layout only, readable source with WebAssembly | 195,252 bytes (not minified) | 61,043 bytes |
| d3 7.9.0 (ISC), whole bundle; d3-force is one part | 279,706 bytes | 92,370 bytes |
| Cytoscape 3.34.4 (MIT), also draws and edits graphs | 435,649 bytes | 136,431 bytes |
| dagre 0.8.5 (MIT) | 283,803 bytes | 64,833 bytes |
| ELK (elkjs) 0.12.0 bundled (EPL-2.0 or GPL-3.0-or-later) | 1,609,707 bytes | 466,978 bytes |

The libraries do more than this engine (drawing, routing, bundling, hundreds of options), so size is not like for like. Not measured: other graph libraries, tuned options, or real-world data. To rerun: `modules/netflow-engine/bench/compare/README.md`.

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
