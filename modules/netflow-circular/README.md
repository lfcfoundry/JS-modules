# netflow-circular

**Version 1.2.0 · API 1**

**Tested in:** Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.

## What it is and how it works

The circular views of Netflow Map as an add-on for [netflow-engine](../netflow-engine/README.md): Chord and Bundles.

- **Chord:** arcs around a circle, one per item or per group, and bands as wide as what each link carries. The order around the circle can be searched for fewer crossing bands.
- **Bundles:** items on a circle and each link bent along the tree between its ends, so links that go the same way run together (Holten 2006).
- `layout(view, G, options)` and `scene(L, options, NetflowScene)` work as in [netflow-hierarchy](../netflow-hierarchy/README.md), which this module builds on (load it first).

## Why it exists

Who sends how much to whom, and which parts of a map talk to each other, read best around a circle. Kept here, the app and any other page use one tested copy. Netflow Map keeps the views built in.

**Where it helps**

- Flows between groups or items (Chord).
- Many links on a tree-shaped map without a tangle (Bundles).

**Not for:** maps where position along a route matters; use the layered views.

## Use

One call, data only:

```js
// netflow-scene.js, netflow-hierarchy.js, then netflow-circular.js
svgElement.outerHTML = NetflowCircular.toSvg(links);                          // chord; { type: 'bundles' } for edge bundles
```

The steps below keep the layout and scene:

## Use

```js
// netflow-scene.js, netflow-hierarchy.js, then netflow-circular.js
var L = NetflowCircular.layout('chord', { nodes: nodes, edges: edges }, { chordBy: 'auto' });   // searches the order; chordOrder: 'fast' keeps it
var S = NetflowCircular.scene(L, { theme: 'dark' }, NetflowScene);
```

- Views: `chord`, `bundles` (`NetflowCircular.VIEWS`).
- Options: `chordBy` (`auto`, `items` or `groups`; auto gives one arc per group above 60 items), `chordOrder` (`fast` keeps the group order, about d3-chord's work; left out or anything else searches the order for fewer crossing bands, up to 3,000 bands), `nest` (Bundles: the tree it bends along), `beta` (Bundles: how tightly links follow the tree, default 0.85).
- Title block (optional, off unless given): `title` (bold, top left), `subtitle` (under it) and `source` (small, under the picture), set in the `scene()` options. The block sits outside the picture, so nothing in the picture moves, and the SVG export draws it.
- `bsplineToBezier(points)` is exported for drawing smooth curves.

Use with netflow-engine: load the files as page scripts (or keep the folders side by side in Node) and the views join `NetflowEngine.VIEWS`; or hand them over with `NetflowEngine.use('circular', NetflowCircular)`. Then `NetflowEngine.build(graph, { view: 'chord' })` lays the map out and `NetflowCircular.scene(L, options, NetflowScene)` draws it.

## How it compares

Against d3-chord 3.0.1, measured by Netflow Map on its own copy of this code (the same layouts to the last digit) in the cloud test browsers, random flows with 4 links per item: with the order kept (no search, like d3) it takes 0.3 to 1.0 of d3's time. With the crossing search it takes 3.5 to 15 times d3's time and its bands cross 53%, 16% and 3% less at 20, 60 and 200 items (weighted: two crossing bands count the smaller amount); d3-chord keeps the order it is given. The crossing count was made 3 to 4 times faster before this release.

## For AI agents

One file, global `NetflowCircular` (also `module.exports`); needs netflow-hierarchy (global `NetflowHierarchy`, or `../netflow-hierarchy/netflow-hierarchy.js` in Node). Tests: `node modules/netflow-circular/test/run.js` (runs the shared 925 checks).
