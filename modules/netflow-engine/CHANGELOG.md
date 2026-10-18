# netflow-engine changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-18
**The engine code arrives.** This is the engine of Netflow Map (build 2026.10.18.1101), cut out as one file you can adapt. What each part does:
- **Nine views** of a map from `build(graph, options)`: Flow, Top-down, Choke-point spine, Lanes, Shape, River, Arc, Matrix and Network. The story views need netflow-layers 1.2.0 or newer; the Network view does not.
- **Network layouts for any size**: Distances (stress), Closeness, Force, Radial, Circle, Rings, Groups, Grid and three 3D ones. Layout of a 30,000-item network took 42.1 s in the first Netflow Map version and 812 ms now (52×, Firefox 159); 10,000 items 7.25 s to 456 ms (16×); 100,000 items from over 60 s to 4.29 s. In this module's own four-browser run (cold, one run each): 10,000 items in 533 to 810 ms.
- **No two items on top of each other**: checked on 2,000 items in three arrangements (0 touching pairs).
- **WebAssembly twins** for Force and Distances (sources and a reproducible rebuild in `wasm/`; 7,260 and 5,616 bytes), with the plain-JavaScript path giving the same positions (checked). Page policy needs only `'wasm-unsafe-eval'`.
- **Add-on hand-over**: `use('layers', impl)` and `use('sankey', impl)`; both are also found on their own. This is new: in Netflow Map they were fixed script names. Known gap, said plainly: the River view's Sankey look needs an add-on with `options`, `layout` and `apply`; the published netflow-sankey 2.0.0 has only `layout`, so River works without `sk` options and throws with them until netflow-sankey gains the two calls.
- **The column reader** (numbers as people write them, dates, categories, small formulas) is included as `NetflowEngine.columns`.
- **Size**: 191 KB as one file, 61 KB gzipped.

The file is cut from Netflow Map's engine by a script, and 225 comparison builds (5 maps × 9 views × 5 option sets) give 0 differences.

Tested in: Node 22 (10 checks), Firefox 158.0, ungoogled-chromium 155.0.8059.39-1, WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, one at a time.

The demo page (`demo.html`, page policy `script-src 'self' 'wasm-unsafe-eval'`, nothing else loosened) was run in all four browsers, one at a time, with `test/demo-browsers.js`: 3,000 items, Stress and Force, WebAssembly on and off. Every run laid out, drew (the same number of pixels is drawn with and without WebAssembly), used the WebAssembly twin only when it was on, and showed no console or page error. Layout time in ms, one cold run each, lower is better (a first look, not a benchmark; gaps under about 20% are noise, and Stress is a tie):

| Browser | Stress, WebAssembly on / off | Force, WebAssembly on / off |
|---|---|---|
| ungoogled Chromium 155.0.8059.39-1 | 1,465 / 1,661 | 1,348 / 2,442 |
| Firefox 158.0 | 1,434 / 2,084 | 1,473 / 3,486 |
| WebKitGTK 2.52.6 | 1,083 / 1,119 | 1,217 / 1,968 |
| GNOME Web 46.5 | 1,167 / 968 | 1,610 / 2,436 |

Force is faster with WebAssembly in all four browsers (about 1.6 to 2.4 times). Not done yet, said plainly: no comparison against general graph-layout libraries (that section is left out rather than guessed), and the River view's Sankey look cannot be used with the published netflow-sankey 2.0.0 (see the add-on note above).

## 0.1.0 · API 0 · 2026-10-18
New placeholder module for the engine of Netflow Map, so other people can adapt it later. It had no engine code: the file only had `NetflowEngine.status()`, which said `placeholder: true`. Nothing to measure: 0 layouts, 0 bytes of engine (the file was under 1 KB).
