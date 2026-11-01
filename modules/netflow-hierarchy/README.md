# netflow-hierarchy

**Version 1.3.0 · API 1**

**Tested in:** Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.

## What it is and how it works

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

One call, data only (links as `{ from, to, value }`, or `{ nodes, edges }`; each box is as big as what flows into it):

```js
// netflow-scene.js, then netflow-hierarchy.js
svgElement.outerHTML = NetflowHierarchy.toSvg(links);                         // treemap
svgElement.outerHTML = NetflowHierarchy.toSvg(links, { type: 'sunburst', title: 'Budget' });
```

The steps below keep the layout and scene:

## Use

```js
// netflow-scene.js, then netflow-hierarchy.js
var L = NetflowHierarchy.layout('treemap', { nodes: nodes, edges: edges }, { nest: 'auto', sized: true });
var S = NetflowHierarchy.scene(L, { theme: 'light' }, NetflowScene);
svgElement.outerHTML = NetflowScene.toSvg(S, 'Treemap');
```

- `G`: `{ nodes: [{ id, label, group, sizeV }], edges: [{ from, to, weight, count, widthV }] }`, plus optional `eA` and `eB` (Int32Array item numbers of each link's ends; with them no id lookup is built).
- Views: `treemap`, `sunburst`, `icicle`, `pack`, `tree` (`NetflowHierarchy.VIEWS`).
- Options: `nest` (`auto`, `links` or `groups`), `sized` (box sizes from `sizeV`), `treeShape` (`tidy`, the default, `cluster`, `radial`, `radialCluster` or `indented`).
- Title block (optional, off unless given): `title` (bold, top left), `subtitle` (under it) and `source` (small, under the picture), set in the `scene()` options. The block sits outside the picture, so nothing in the picture moves, and the SVG export draws it.
- Helpers: `hierarchy`, `sums`, `packSiblings`, `enclose`, `linkValue`, `itemValue`, `sector`, `pushSector`.

Use with netflow-engine: load the files as page scripts (or keep the folders side by side in Node) and the views join `NetflowEngine.VIEWS`; or hand them over with `NetflowEngine.use('hierarchy', NetflowHierarchy)`. Then `NetflowEngine.build(graph, { view: 'treemap' })` lays the map out and `NetflowHierarchy.scene(L, options, NetflowScene)` draws it.

## How it compares

Against d3-hierarchy 3.1.2, measured by Netflow Map on its own copy of this code (the same layouts to the last digit) in the cloud test browsers, one at a time, early-stop A/B: ahead on 35 of 36 cases (treemap, icicle, pack and tree at 1,000, 10,000 and 100,000 items), at 0.29 to 0.98 of d3's time; one tie (WebKitGTK icicle at 1,000 items, 1.03, range 0.86 to 1.20). At 100,000 items: 0.29 to 0.78 of d3's time.

## For AI agents

One file, global `NetflowHierarchy` (also `module.exports`). Tests: `node modules/netflow-hierarchy/test/run.js` (925 checks with netflow-circular: no overlaps, children inside parents, tidy rows apart, chord totals, the same layout with and without `eA`/`eB`, the fast chord crossing count equals a plain count, on 0 to 2,000 items).
