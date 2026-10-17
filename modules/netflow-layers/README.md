# netflow-layers

**Version 1.1.0 · API 1**

**Tested in:** Node 22 checks (15, about 0.4 s); the demo check (now also bundle and taper) passes in ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, one at a time, same numbers in each (stops 1,456 to 205 with tags, to 1,356 with bundle; taper SVG 277,577 to 563,821 characters; 7 columns), 3 to 7 s each including start-up (tests/flow-demos.js, 2026-10-17)

Lays out a graph in rows (a layered, Sugiyama-style drawing): top to bottom or left to right, with long links drawn as tags, rows in the order of the story, a column for the pages every route passes, and tall maps cut into columns. It is the layered engine of Netflow Map, which draws Flow, Top-down, Spine, Lanes, Arc and Matrix from it. About 24 KB, no dependencies. Works in a browser (global `NetflowLayers`) and in Node (`module.exports`).

**Test it:** `node modules/netflow-layers/test/run.js` (15 checks, about 0.4 s). **Try it:** `demo.html` (type links, the picture redraws).

## Use
```js
var R = NetflowLayers.layout({
  root: "start",
  nodes: [{ id: "start", w: 140, h: 44 }, { id: "a", w: 140, h: 44 }, { id: "b", w: 140, h: 44 }],
  edges: [{ from: "start", to: "a" }, { from: "start", to: "b" }, { from: "a", to: "b" }, { from: "b", to: "start" }]
}, { dir: "TB", rows: "story", tagLen: 8 });
svgElement.innerHTML = NetflowLayers.toSvg(R);        // or draw R.nodes and R.edges yourself
```
Your input is never changed: the result holds copies of your nodes and links with the places added.

`layout(graph, opts)`:
- `graph.nodes`: `{ id, w, h }` plus anything you like (`label`, `choke` for the must-pass pages, `lane` as a number). `graph.edges`: `{ from, to }` (`count` optional). `graph.root`: the id where the story starts (without it the first pages with no way in start the rows).
- `opts.dir`: `"LR"` (default, rows go left to right) or `"TB"` (rows go down).
- `opts.rows`: `"route"` (default: a page sits at its fewest steps from the start) or `"story"` (a page sits below every page that leads to it; only real loops go back).
- `opts.tagLen`: a number (for example 8): links longer than this many rows become `kind: "tag"` (a stub and a name at each end), with no stand-in stops. `0` = off (default).
- `opts.spine`: `true` puts the nodes marked `choke: true` in one line.
- `opts.better`: `true` adds six more rounds of reordering; never worse, a little slower.
- `opts.bundle`: `true` lets links that start at the same page share one run of stand-in stops (as far as the longest goes), and links that end at the same page and are alone at their start share one run from the end upward. Fewer stops and fewer crossings on maps without tags; about the same where tags already removed the long links.
- `opts.wrap`: `true` (with `dir: "TB"`) cuts a map more than 2.2 times taller than wide into columns side by side; links between columns become tags.
- `opts.lanes`: `true` puts nodes with the same `lane` number in their own band. `opts.prev`: `{ id: 0-1 order from the last drawing }` keeps the order stable. `gapNode`, `gapLayer`, `maxVertices` (default 90,000 stops, then it throws an error with `tooBig: true`).

Returns `{ nodes, edges, pos, order, lanes, width, height, crossings, rows, ruler, info, dir }`:
- `nodes`: your nodes with `x, y` (top left), `layer` (the row number) added. `pos` is the same by id.
- `edges`: your links with `kind` (`fwd`, `back`, `flat` = same row, `self`, `tag`) and `pts` (the stand-in stops a long link passes, each `[x, y]`). A `tag` has `tagFwd` (true when it goes on down the page) and no `pts`.
- `info`: `{ rows, columns, stops, back, flat, tags, goldTags, rowMode }`. `ruler`: for each row `{ at, edge }` (where to write "step 12" and where its column starts).

`toSvg(result, colors)` draws boxes, curves and tag chips as a plain SVG string (text is escaped).

## What it does that is different
- **Story order** makes "going back" honest: on a 5,002-page story, links drawn as back or sideways drop from 1,027 to 97 (the real loops).
- **Tags** replace the stand-in stops of very long links: 33,087 stops become 11 on that story, and a 20,000-page story that is refused as too big draws in about 0.4 s.
- **Bundling** lets links that share a page share their stops: on a 5,002-page story with the shortest-route rows, stand-in stops go 33,087 to 30,654 and crossings 1,216 to 1,065 (about 12% fewer); on a loop-free random map of 1,000 pages stops go 531 to 326 (39% fewer). With tags on there is little left to bundle. In `toSvg`, `taper: true` draws forward links as shapes that narrow from 5 px to 1 px, so direction shows without arrowheads.
- **The must-pass column, columns for tall maps and harder untangling** are one switch each, all off by default. With everything off the drawing is exactly Netflow Map's older one (15 checks, 8 pinned fingerprints made by the app's own engine).

## Numbers (Node 22, median of 5 builds, 2026-10-17; story-shaped test maps; smaller is better in every column)
These are from Netflow Map's full build path, which first folds straight runs of pages into one box, so page counts differ a little from feeding the module the raw map. The drawing code is the same (8 pinned fingerprints from the app's own engine match). Full tables: Netflow Map `docs/TOPDOWN.md`.

| Story (5,002 pages) | Rows | Stand-in stops | Gold links | Crossings | Width x height (px) | Build time (ms) |
|---|---|---|---|---|---|---|
| today (rows by fewest steps) | 1,337 | 33,087 | 1,027 | 1,216 | 4,223 x 160,446 | 392 |
| story order | 1,908 | 48,779 | 97 | 805 | 2,862 x 228,966 | 532 |
| tags (links over 8 rows) | 1,337 | 11 | 1,027 | 60 | 5,816 x 160,446 | 60 |
| tags + must-pass column | 1,337 | 11 | 1,027 | 60 | 1,913 x 160,446 | 54 |
| tags + column + columns for tall maps | 1,337 | 11 | 1,027 | 60 | 17,389 x 13,446 | 114 |
| everything on | 1,908 | 1,286 | 97 | 36 | 16,874 x 13,566 | 198 |

Story order is a choice, not the default: on a random map with no loops at all, gold links drop from 851 to 0 but crossings rise from 90,351 to 131,569 (worse).

## Limits
Plain boxes only: you give each node's size; link labels, ports and curved-edge routing around boxes are not here. The rows are by fewest steps from `root` unless `rows: "story"`. More than 90,000 stand-in stops (page boxes plus the stops long links need) throws; turn on `tagLen` first.

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.
