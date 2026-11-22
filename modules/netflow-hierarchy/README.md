# netflow-hierarchy

**Version 1.12.0 · API 1**

**Tested in:** ungoogled-chromium 156, Firefox 158, WebKitGTK 2.52.6; 3,267 checks

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.

## What it is and how it works

**Load order:** `netflow-scene.js`, then `netflow-hierarchy.js` (this module draws through [netflow-scene](../netflow-scene/README.md)).

The nested views of Netflow Map as an add-on for [netflow-engine](../netflow-engine/README.md): Treemap, Sunburst, Icicle, Circle pack and Tree.

- `layout(view, G, options)` finds one parent for each item (from the links, or a box for each group) and lays the tree out.
- `scene(L, options, NetflowScene)` turns that layout into [netflow-scene](../netflow-scene/README.md) drawing lists, so the map's themes, names, key and SVG export apply.
- It also holds the tree and drawing helpers that [netflow-circular](../netflow-circular/README.md) builds on.
- No page, no DOM; netflow-scene is passed in, not loaded.

## Why it exists

Netflow Map draws these views from any map: a tree of links, or items grouped by a column. Kept here, the app and any other page use one tested copy. Netflow Map keeps the views built in.

**Where it helps**

- Seeing what holds how much (Treemap, Icicle, Sunburst, Circle pack).
- Drawing a map's start-out tree as a tidy tree.
- Pages that need these shapes without a chart library.

**Not for:** editing a tree by hand; it draws the tree it is given or finds.

## Use

Load `netflow-scene.js` first, then `netflow-hierarchy.js`. `netflow-hierarchy.min.js` is the same module minified (34.2 KB, 15.2 KB gzipped; same pictures), for pages that must stay small. One call, data only (links as `{ from, to, value }`, or `{ nodes, edges }`; each box is as big as what flows into it):

```js
// netflow-scene.js, then netflow-hierarchy.js
svgElement.outerHTML = NetflowHierarchy.toSvg(links);                         // treemap
containerDiv.innerHTML = NetflowHierarchy.toSvg(links);   // the same call into a <div> you already have
svgElement.outerHTML = NetflowHierarchy.toSvg(links, { type: 'sunburst', title: 'Budget' });
```

Links point from parent to child: `from` is the outer box, `to` the box inside it. A box with no size (leave `value` out or empty) takes the sum of the boxes inside it, and a row whose `from` is never a `to` is the root. Your table can keep its own column names: `toSvg(rows, { from: 'Source', to: 'Target', value: 'Amount' })`, or leave them out and the first two text columns and the first number column are used (rows straight from a CSV work). `toSvg` returns SVG text (a string): put it in the page with `element.outerHTML = ...` or save it as a `.svg` file. `title` is optional: it draws a bold title above the picture and names the picture for screen readers; leave it out for none.

The steps below keep the layout and scene:

## Use

```js
// netflow-scene.js, then netflow-hierarchy.js
var L = NetflowHierarchy.layout('treemap', { nodes: nodes, edges: edges }, { nest: 'auto', sized: true });
var S = NetflowHierarchy.scene(L, { theme: 'light' }, NetflowScene);
svgElement.outerHTML = NetflowScene.toSvg(S, 'Treemap');
```

- `G`: `{ nodes: [{ id, label, group, sizeV }], edges: [{ from, to, weight, count, widthV }] }` (edges from parent to child; `sizeV` is a box's own size, 1 when missing; a link's amount is `widthV` when given, else its flow, else `weight`, else `count`, the number of times it was taken; `nest: 'auto'` follows the links when they already form a tree, else boxes by `group` when there are 2 or more groups, else the links from the start), plus optional `eA` and `eB` (Int32Array item numbers of each link's ends; with them no id lookup is built).
- `parentKey` (option, since 1.9.0): when each item already carries its parent's id in a field, name that field and leave `edges` out: `layout('icicle', { nodes: [{ id: 'b', up: 'a' }, ...] }, { nest: 'links', parentKey: 'up' })`. An item whose field is missing, `null`, empty, its own id or an id that is not in the list is a top item. The picture is the same as with the matching list of links, and no list is built unless something reads `edges` on the result (the drawing does). It saves building and reading the links: on the icicle layout with no sorting, 5 to 8% less time in ungoogled-chromium 156 and up to half in Firefox 158 at 100,000 items.
- Rows as they are (options `sizeKey` and `write`, since 1.10.0): the fastest way to lay out rows that already exist, with no copy of them and nothing written onto them. `sizeKey: 'value'` reads each item's size from that field instead of `sizeV`. `write: false` leaves the items untouched: the places stay in the lists of `L.chart` (`chart.at[i]` is the box of item `i`; `chart.R` holds four numbers per box for treemap, icicle and sunburst, `chart.X`, `chart.Y` and `chart.Rr` hold the centers and radii for tree and circle pack), and `chart.placed` is `false`. `NetflowHierarchy.place(L)` writes `x`, `y`, `w`, `h`, `cx`, `cy` and `hv` onto the items when you want them, and `scene()` calls it itself, so drawing needs no extra step. Example: `layout('icicle', { nodes: rows }, { nest: 'links', parentKey: 'parent', sizeKey: 'value', write: false })`. Same picture as the usual way. Measured against d3-hierarchy 3.1.3 fed the same rows, on 100 items in ungoogled-chromium 156: 0.44 to 0.62 of its time across the five views.
- Small trees (since 1.10.0): layouts of up to about 300 items cut their lists from shared blocks of memory (each block is about 130 KB or less and is let go when the layouts that use it are), and trees of up to 32 boxes get `kids`, `label` and `group` at once instead of on first read. A 3-item layout takes about a fifth of the time it took in 1.9.0 in ungoogled-chromium 156. Results are the same.
- Tiny trees (icicle and sunburst since 1.11.0, treemap, circle pack and tree since 1.12.0): trees of up to 24 items that name their own parent (`parentKey`) are laid out by their own small piece of code, which shares nothing with the general path (plain lists in it made the code that lays out big trees slower for seconds afterwards, so it is kept apart). The result is the same as the general path gives. Against d3-hierarchy 3.1.3 fed the same rows in ungoogled-chromium 156, Firefox 158 and WebKitGTK 2.52.6, trees of 10 to 24 items take about 0.5 to 1.0 of d3's time in every view; at 3 items WebKitGTK's one-millisecond clock cannot tell the two apart. A loop, an item marked as the start, nesting by group, `nest: 'auto'` with no link at all, or a size that is not a plain number (treemap) use the general path.
- Speed tip: a layout writes seven fields onto each item (`x`, `y`, `w`, `h`, `cx`, `cy`, `hv`). Chromium is slow at adding fields to an object after it is made, so make each item with them already present: `{ id, label, sizeV, x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0, hv: 0 }`. Measured on the icicle layout in ungoogled-chromium 156: 12% less time at 1,000 items and 23% less at 100,000. Firefox 158 and WebKitGTK 2.52.6 do not change. The picture is the same either way.
- Views: `treemap`, `sunburst`, `icicle`, `pack`, `tree` (`NetflowHierarchy.VIEWS`).
- Options: `nest` (`auto`, `links` or `groups`), `sized` (box sizes from `sizeV`), `treeShape` (`tidy`, the default, `cluster`, `radial`, `radialCluster` or `indented`).
- Title block (optional, off unless given): `title` (bold, top left), `subtitle` (under it) and `source` (small, under the picture), set in the `scene()` options. The block sits outside the picture, so nothing in the picture moves, and the SVG export draws it.
- Helpers: `hierarchy`, `sums`, `place`, `packSiblings`, `enclose`, `linkValue`, `itemValue`, `sector`, `pushSector`.
- `typedRects: true` (option of `scene`, since 1.7.0): treemap and icicle tiles are written to `S.rectsT` as typed arrays (`x`, `y`, `w`, `h` as Float64Array, `node` as Int32Array with -1 for none, `fill` and `stroke` as indexes into `fills` and `strokes`, `sw`, `a`; every tile has layer 1 and radius 0) instead of one object each in `S.rects`, which is then empty. `toSvg` and `style` (netflow-scene 1.14.0 or newer) handle both forms and give the same picture text; `NetflowScene.rectTAt(S.rectsT, i)` returns tile `i` as the usual object. The object form stays the default. With an older netflow-scene the option is ignored.
- `NetflowHierarchy.warm()` (optional, since 1.6.0): call it from an idle callback, after `netflow-scene.js` has loaded. It draws a small made-up treemap and sunburst once and throws them away, so the engine has already optimized the drawing code when your first real picture comes. 6 to 11 ms of work; the first treemap and sunburst of 250 items then took 0.50 (ungoogled Chromium 156), 0.82 (Firefox 158) and 0.60 (WebKitGTK 2.52.6) of the time without it. Returns `true`, or `false` when `NetflowScene` is missing. Pictures are the same with or without it.

Use with netflow-engine: load the files as page scripts (or keep the folders side by side in Node) and the views join `NetflowEngine.VIEWS`; or hand them over with `NetflowEngine.use('hierarchy', NetflowHierarchy)`. Then `NetflowEngine.build(graph, { view: 'treemap' })` lays the map out and `NetflowHierarchy.scene(L, options, NetflowScene)` draws it.

## How it compares

Real trees (2026.11.22; SEC filings and retail orders, 1,000 to 100,000 rows; ungoogled Chromium 156, Firefox 158, WebKitGTK 2.52.6, against d3-hierarchy 3.1.3): ahead in 106 of 108 cells at 21% to 125% of d3's time, 21% to 80% at 100,000 rows; the two cells that are not ahead are 1,000-row cells within the clock step. Earlier, on generated trees, against d3-hierarchy 3.1.2, measured by Netflow Map on its own copy of this code (the same layouts to the last digit) in the cloud test browsers, one at a time, early-stop A/B: ahead on 35 of 36 cases (treemap, icicle, pack and tree at 1,000, 10,000 and 100,000 items), at 0.29 to 0.98 of d3's time; one tie (WebKitGTK icicle at 1,000 items, 1.03, range 0.86 to 1.20). At 100,000 items: 0.29 to 0.78 of d3's time.

## Prior art and credits

The code is Netflow Map's own (LFC Foundry), cut out for this module; no code from other projects.

**Original sources** (links checked 2026-11-14; ideas only):

- Treemap: Bruls, Huizing and van Wijk, ["Squarified Treemaps"](https://doi.org/10.1007/978-3-7091-6783-0_4), 2000
- Tree: Reingold and Tilford, ["Tidier Drawings of Trees"](https://doi.org/10.1109/TSE.1981.234519), IEEE TSE, 1981, in the linear-time form of Buchheim, Junger and Leipert, ["Improving Walker's Algorithm to Run in Linear Time"](https://doi.org/10.1007/3-540-36151-0_32), Graph Drawing 2002
- Circle pack: Wang, Wang, Dai and Wang, ["Visualization of large hierarchical data by circle packing"](https://doi.org/10.1145/1124772.1124851), CHI 2006, with the smallest enclosing circle by Emo Welzl, ["Smallest enclosing disks (balls and ellipsoids)"](https://doi.org/10.1007/BFb0038202), 1991

## For AI agents

One file, global `NetflowHierarchy` (also `module.exports`). Tests: `node modules/netflow-hierarchy/test/run.js` (925 checks with netflow-circular: no overlaps, children inside parents, tidy rows apart, chord totals, the same layout with and without `eA`/`eB`, the fast chord crossing count equals a plain count, on 0 to 2,000 items).
