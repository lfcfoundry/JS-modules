# netflow-engine developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 2.2.2 · API 2 · 2026-10-22

### Quick
2.2.2: Flow, Down, Spine and Lanes build layered drawings up to 250,000 stops (was 90,000), so maps of about 5,000 to 6,500 pages now draw in 0.5 to 1.6 s instead of being refused.

### Deep
Patch. Flow, Down, Spine and Lanes pass maxVertices: 250000 to netflow-layers (its own default is 90,000), so maps of about 5,000 to 6,500 pages with 3 links each build instead of being refused. Sankey, arc and matrix are untouched; larger maps (8,000 pages, about 367,000 stops) are still refused with the same plain message; layouts below the old limit are unchanged. First Flow layout, ms, lower is better (Chromium 155 / Firefox 158.0 / WebKitGTK 2.52.6 / GNOME Web 46.5): 5,000 pages refused to 576 / 837 / 561 / 513; 6,500 pages refused to 922 / 1,584 / 897 / 837; 3,000 pages unchanged (241 to 237, 497 to 503, 237 to 247, 236 to 225). Netflow Map's own engine gives identical results on 315 builds. Size: netflow-engine.js 209,807 to 210,105 bytes (+298); stress.wasm unchanged.

## 2.2.1 · API 2 · 2026-10-22

### Quick
The two-pair Distances sweeps no longer stop at 20,000 items: they run at any size (1.02 to 1.10 times faster at 30,000 and 60,000 items in the four test browsers), same positions.

### Deep
**The two-pair Distances sweeps now run at any size.** Nothing was removed or renamed, so the API number stays 2. Before, `stressWasm.simdMax` (20,000 items) kept flat Distances on the one-pair sweep above that size; the limit is gone and `sweepsv` runs whenever `stressWasm.simd` is on. Whole-build times of flat Distances on a moderate map, one-pair over two-pair (higher is better), in the order Chromium 155.0.8059.39-1 / Firefox 158.0 / WebKitGTK 2.52.6 / GNOME Web 46.5: 30,000 items 1.07 / 1.04 / 1.10 / 1.06; 60,000 items 1.04 / 1.06 / 1.04 / 1.02 (Netflow Map `docs/BENCHMARKS.md` section 29, alternating, medians). The positions are the same to the last digit (page check: two-pair against one-pair at 1,500, 5,000, 24,000 and 45,000 items, 0 differences in all four browsers). A two-pair Distances 3D sweep was written and measured at 0.95 to 1.08 times in the same browsers, so it is not part of the module (plain WebAssembly stays for 3D). The proposed 2.2.0 short changelog had a duplicate `## 2.2.0` heading; it is fixed. Size: `netflow-engine.js` 209,855 to 209,807 bytes.

## 2.2.0 · API 2 · 2026-10-18

### Quick
A page can keep finished Network map positions and put them back: reopening a big map is 2.4 to 14.9 times faster (higher is better), same picture. Distances sweeps run two pairs of items at a time in WebAssembly up to 20,000 items: 1.0 to 1.44 times faster, same positions.

### Deep
**The engine can hand finished layouts back, and the Distances sweeps run two pairs of items at a time.** Nothing was removed or renamed, so the API number stays 2. (1) Saved layouts: `layoutKey(graph, options)` returns a fingerprint of the data, the options, the tuning and the layout code (`null` for previews and views where saving makes no sense); `build()` takes `saveKey`, `wantSave` (returns `saveLayout`: key, `xy` Float64Array, width, height) and `saved` (a record with a matching key and the right length is put back, `fromSaved` is true, the positions are those of a new layout; a wrong or damaged record is ignored). Netflow Map keeps the records in IndexedDB for maps of 1,500 items or more. Reopening a map, second open against a plain build, higher is better (Chromium 155 / Firefox 158 / WebKitGTK 2.52.6 / GNOME Web 46.5, versions alternating): 3,000 items 13.8 / 14.9 / 9.5 / 10.4 times; 10,000 items 3.1 / 3.6 / 3.0 / 3.1; 30,000 items 2.6 / 2.4 / 2.6 / 2.4. The picture was identical in 12 of 12 cells. The first open of a map not seen before costs more (fingerprint and save), lower is better: -2% to +12%, about +3% in the middle. (2) Two-lane Distances sweeps (`sweepsv` in `wasm/stress.c`, 8,013 to 9,199 bytes): two neighbors in the shuffled order that share no item run side by side, so positions are identical to the one-lane sweeps; flat Distances only, up to `stressWasm.simdMax` (20,000) items, off with `stressWasm.simd = false`. Distances time, one-lane time over two-lane time, higher is better (same four browsers) at 1,000 / 5,000 / 15,000 items: 1.11 / 1.06 / 1.02, 1.14 / 1.13 / 1.00, 1.41 / 1.29 / 1.15, 1.42 / 1.32 / 1.16; "best quality" is about 1.0 beyond 1,000 items. No cell was more than 3% worse. Size: `netflow-engine.js` 205,069 to 209,855 bytes (65,612 gzipped); `stress.wasm` 8,013 to 9,199 bytes.

## 2.1.0 · API 2 · 2026-10-18

### Quick
More of the engine runs as WebAssembly, there is a new Distances 3D arrangement, and big flat Force maps are 1.5 to 2.4 times faster at 5,000 to 10,000 items (higher is better).

### Deep
test

## 2.0.0 · API 2 · 2026-10-18

### Quick
The sixth view is now called "sankey" (the old name is gone), so a page that typed the old name by hand must change it. New tight or wide spread for the story views.

### Deep
**The sixth view is called `sankey`, and the story views take a tight or wide spread.** (1) Changed: the Sankey view's id in `build(graph, { view })` and in `VIEWS` is now `sankey`; the id used in 1.0.0 is gone and draws the Flow picture like any unknown id. That is why this is 2.0.0 · API 2: a page that typed the old id by hand must change it (the README had asked people to read it from `VIEWS[5][0]`, which keeps working). Netflow Map's own engine made the same change (build 2026.10.18.1220). (2) New: option `spread: "wide"` for Flow, Top-down, Spine and Lanes, passed to netflow-layers 1.3.0 (looser, more tree-like, for wide screens; `"tight"` or nothing is the picture as before; an older netflow-layers ignores it). On a 120-page story map with netflow-layers 1.3.0 the Top-down picture goes from 1,353 to 1,618 pixels wide (1.2 times) and Flow from 9,480 x 558 to 11,832 x 626. The Sankey view needs netflow-sankey 2.1.0 or newer for its `sk` options (2.1.0 added the two calls the view makes). Nothing else changed: the file differs from 1.0.0 in 20 lines (the id, the option, two comments), the layout code and the WebAssembly are untouched.

## 1.0.0 · API 1 · 2026-10-18

### Quick
The engine code arrives: the engine of Netflow Map as one file you can adapt, with nine map views and layouts for networks of any size.

### Deep
**The engine code arrives.** This is the engine of Netflow Map (build 2026.10.18.1101), cut out as one file you can adapt. What each part does:
- **Nine views** of a map from `build(graph, options)`: Flow, Top-down, Choke-point spine, Lanes, Shape, Sankey, Arc, Matrix and Network. The story views need netflow-layers 1.2.0 or newer; the Network view does not.
- **Network layouts for any size**: Distances (stress), Closeness, Force, Radial, Circle, Rings, Groups, Grid and three 3D ones. Layout of a 30,000-item network took 42.1 s in the first Netflow Map version and 812 ms now (52×, Firefox 159); 10,000 items 7.25 s to 456 ms (16×); 100,000 items from over 60 s to 4.29 s. In this module's own four-browser run (cold, one run each): 10,000 items in 533 to 810 ms.
- **No two items on top of each other**: checked on 2,000 items in three arrangements (0 touching pairs).
- **WebAssembly twins** for Force and Distances (sources and a reproducible rebuild in `wasm/`; 7,260 and 5,616 bytes), with the plain-JavaScript path giving the same positions (checked). Page policy needs only `'wasm-unsafe-eval'`.
- **Add-on hand-over**: `use('layers', impl)` and `use('sankey', impl)`; both are also found on their own. This is new: in Netflow Map they were fixed script names. Known gap, said plainly: the Sankey view's look needs an add-on with `options`, `layout` and `apply`; the published netflow-sankey 2.0.0 has only `layout`, so the Sankey view works without `sk` options and throws with them until netflow-sankey gains the two calls.
- **The column reader** (numbers as people write them, dates, categories, small formulas) is included as `NetflowEngine.columns`.
- **Size**: 191 KB as one file, 61 KB gzipped.

The file is cut from Netflow Map's engine by a script, and 225 comparison builds (5 maps × 9 views × 5 option sets) give 0 differences.

The demo page (`demo.html`, page policy `script-src 'self' 'wasm-unsafe-eval'`, nothing else loosened) was run in all four browsers, one at a time, with `test/demo-browsers.js`: 3,000 items, Stress and Force, WebAssembly on and off. Every run laid out, drew (the same number of pixels is drawn with and without WebAssembly), used the WebAssembly twin only when it was on, and showed no console or page error. Layout time in ms, one cold run each, lower is better (a first look, not a benchmark; gaps under about 20% are noise, and Stress is a tie):

| Browser | Stress, WebAssembly on / off | Force, WebAssembly on / off |
|---|---|---|
| ungoogled Chromium 155.0.8059.39-1 | 1,465 / 1,661 | 1,348 / 2,442 |
| Firefox 158.0 | 1,434 / 2,084 | 1,473 / 3,486 |
| WebKitGTK 2.52.6 | 1,083 / 1,119 | 1,217 / 1,968 |
| GNOME Web 46.5 | 1,167 / 968 | 1,610 / 2,436 |

Force is faster with WebAssembly in all four browsers (about 1.6 to 2.4 times). Not done yet, said plainly: no comparison against general graph-layout libraries (that section is left out rather than guessed), and the Sankey view's look cannot be used with the published netflow-sankey 2.0.0 (see the add-on note above).

## 0.1.0 · API 0 · 2026-10-18

### Quick
Placeholder with no engine code yet.

### Deep
New placeholder module for the engine of Netflow Map, so other people can adapt it later. It had no engine code: the file only had `NetflowEngine.status()`, which said `placeholder: true`. Nothing to measure: 0 layouts, 0 bytes of engine (the file was under 1 KB).
