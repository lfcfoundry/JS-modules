# netflow-layers

**Version 1.2.0 · API 1**

**Tested in:** Node 22 checks (16, about 0.4 s); the demo check passes in ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, one at a time, the same numbers as 1.1.0 in each (stops 1,456 to 205 with tags, to 1,356 with bundle; 7 columns), 1 to 7 s each including start-up; Netflow Map itself with this module swapped in (run by the Netflow Map thread): Chromium 155.0.8059.39 159 of 159 checks, Firefox 158.0 148, WebKitGTK 2.52.6 148, GNOME Web 46.5 148

Lays out a graph in rows (a layered, Sugiyama-style drawing): top to bottom or left to right, with long links drawn as tags, rows in the order of the story, a column for the pages every route passes, and tall maps cut into columns. It is the layered engine of Netflow Map, which draws Flow, Top-down, Spine, Lanes, Arc and Matrix from it. About 28 KB (28,868 bytes; 9.3 KB gzipped), no dependencies. Works in a browser (global `NetflowLayers`) and in Node (`module.exports`).

**Test it:** `node modules/netflow-layers/test/run.js` (16 checks, about 0.4 s). **Try it:** `demo.html` (type links, the picture redraws).

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

## How it compares
netflow-layers is a small layered-graph drawer (28,868 bytes, no dependencies). It does less than ELK, and it adds switches aimed at long story maps (tags for long links, story order, a must-pass column, columns for tall maps); ELK also wraps tall maps and bundles edges. Speed in browsers against any alternative: not measured.

| Alternative | Size (smaller is better) | Speed | Features | Where it wins / loses |
|---|---|---|---|---|
| ELK layered (elkjs; EPL license per the research notes, version: not read) | Not measured | In browsers: not measured | Cycle breaking, network-simplex rows, Brandes-Koepf placement, edge routing (polyline, orthogonal, spline), edge bundling, wrapping tall maps, over 140 options | ELK wins on routing and options. An older Netflow Map report found 76% to 103% more crossings than dagre or ELK at 400 items (lower is better; not rechecked, and measured on the app's older flow layout, not this module) |
| dagre (license and version: not read) | Not measured | In browsers: not measured | Layered boxes-and-links drawing | Not compared here; same crossings note as above |
| d3-dag (license and version: not read) | Not measured | In browsers: not measured | Layered drawing with quality levels ("fast", "medium", "slow" optimal) | Not compared here; its fast level is the class this module is in |
| d3-sankey (BSD-3-Clause, 0.12.3), a different tool for weighted flows | 5.7 KB minified, 2.0 KB gzipped (this module: 28,868 bytes readable, 9.3 KB gzipped) | 1,500 items and 2,283 links, whole app build with extra work: 30 vs 21 ms in ungoogled Chromium 155, 80 vs 74 ms in Firefox 158, 25 vs 146 ms in WebKitGTK 2.52.6, 22 vs 78 ms in GNOME Web 46.5 (lower is better; Netflow Map's Flow view built on this engine, then d3-sankey) | No loops in d3-sankey; this engine handles them | Fewer crossings on 100, 400 and 1,500 items (173, 1,039, 3,761 against 468, 5,415, 107,409; lower is better; counted as straight lines between item centers). Slower than d3-sankey at 100 items in all four browsers; at 1,500 items slower in Chromium and Firefox, faster in WebKitGTK (5.8 times) and GNOME Web (3.5 times) (higher is better) |

**Where it loses**
- Plain boxes only: link labels, ports and curved routing around boxes are not here (ELK has them).
- Not measured: size, browser speed and crossings against ELK, dagre and d3-dag. The one browser race on file was run on the app's Flow view, not on this module alone.
- It was slower than d3-sankey in Chromium 155 at all three sizes in the race above (28, 20 and 30 ms against 5.4, 7.8 and 21 ms at 100, 400 and 1,500 items; lower is better), and the race time includes extra work (must-pass pages, scores, loops) that d3-sankey does not do.
- Story order is a choice, not the default: on a loop-free random map crossings rise from 90,351 to 131,569 (worse). Tags and bundling are the same kind of choice.
- Brandes-Koepf straight-line placement was built, measured and left out: fewer slanted pieces but wider maps (4,223 to 49,496 px at 5,002 pages).
- More than 90,000 stand-in stops throws an error; turn on `tagLen` first.

### What it does differently
- **Story order** makes "going back" honest: on a 5,002-page story, links drawn as back or sideways drop from 1,027 to 97 (the real loops).
- **Tags** replace the stand-in stops of very long links: 33,087 stops become 11 on that story, and a 20,000-page story that is refused as too big draws in about 0.4 s.
- **Bundling** lets links that share a page share their stops: on a 5,002-page story with the shortest-route rows, stand-in stops go 33,087 to 30,654 and crossings 1,216 to 1,065 (about 12% fewer); on a loop-free random map of 1,000 pages stops go 531 to 326 (39% fewer). With tags on there is little left to bundle. In `toSvg`, `taper: true` draws forward links as shapes that narrow from 5 px to 1 px, so direction shows without arrowheads.
- **The must-pass column, columns for tall maps and harder untangling** are one switch each, all off by default. With everything off the drawing is exactly Netflow Map's older one (15 checks, 8 pinned fingerprints made by the app's own engine).

## Numbers (Node 22, median of 5 builds, 2026-10-17; story-shaped test maps; smaller is better in every column)

> **Node numbers.** The speeds in this section were measured in Node, not in the four test browsers (ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5), so they are not what a visitor's browser does. Use them to compare rows with each other, not as page speeds. Sizes and counts are exact; only the times depend on the browser. Re-measuring in the four browsers is not done (open item on `TASKS.md`).

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

## Prior art and credits
- The layered ("Sugiyama-style") way of drawing a graph in rows: rows first, then an order inside each row to cut crossings, then places. Idea only, no code. The same steps are in [Eclipse ELK](https://eclipse.dev/elk/) (EPL license; its overview was read, its code was not), dagre and d3-dag.
- Ideas read about in ELK's documentation and papers and written fresh here: wrapping a tall map into columns (ELK calls it edge wrapping and layer unzipping) and letting links that share a page share their stops (bundling, also in a Microsoft Research paper on layered drawings with edge bundling). Idea only, no code.
- Tapered links (narrow from the source to the target, so direction shows without arrowheads) follow the idea of Holten and van Wijk; the research notes mark that study as not re-read, so treat the credit as a pointer.
- Brandes-Koepf placement (a published method) was tried in the research, measured and not included; none of its code is in this module.
- The crossing counter is a standard Fenwick-tree (binary indexed tree) count. Textbook technique, no code from others.
- The engine was cut from Netflow Map (LFC Foundry's own code).
No code from others; the ideas above are theirs.

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.
