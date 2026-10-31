# netflow-layers

**Version 1.5.1 · API 1**

**Tested in:** Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6

Lays out a graph in rows (a layered, Sugiyama-style drawing): top to bottom or left to right, with long links drawn as tags, rows in the order of the story, a column for the pages every route passes, and tall maps cut into columns. It is the layered engine of Netflow Map, which draws Flow, Top-down, Spine, Lanes, Arc and Matrix from it. About 28 KB (28,868 bytes; 9.3 KB gzipped), no dependencies. Works in a browser (global `NetflowLayers`) and in Node (`module.exports`).

It puts each page in a row (by fewest steps from the start, or in story order), reorders the pages inside each row to cut crossings, then gives every page a place. Links that skip many rows get stand-in stops along the way or, with `tagLen`, are drawn as short tags at each end. It returns places and link paths as plain data, and `toSvg` can draw them.

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.

## Why it exists

Netflow Map draws how people move through many pages, including long stories with thousands of pages, where the ordinary layered drawing makes a mess of "going back" links and very long links. This is that drawing engine cut out of Netflow Map, with switches aimed at such maps (tags for long links, story order, a column for the pages every route passes, columns for tall maps), so other pages can use it too.

## Use

Copy `netflow-layers.js`.

```js
var R = NetflowLayers.layout({
  root: "start",
  nodes: [{ id: "start", w: 140, h: 44 }, { id: "a", w: 140, h: 44 }, { id: "b", w: 140, h: 44 }],
  edges: [{ from: "start", to: "a" }, { from: "start", to: "b" }, { from: "a", to: "b" }, { from: "b", to: "start" }]
}, { dir: "TB", rows: "story", tagLen: 8 });
svgElement.innerHTML = NetflowLayers.toSvg(R);        // or draw R.nodes and R.edges yourself
```

Your input is never changed: the result holds copies of your nodes and links with the places added. **Try it:** `demo.html` (type links, the picture redraws). **Test it:** `node modules/netflow-layers/test/run.js` (19 checks, about 0.4 s).

## Options

`layout(graph, opts)`. Input: `graph.nodes` are `{ id, w, h }` plus anything you like (`label`, `choke: true` for the must-pass pages, `lane` as a number); `graph.edges` are `{ from, to }` (`count` optional); `graph.root` is the id where the story starts (without it, the first pages with no way in start the rows).

| Option | Meaning |
|---|---|
| `dir` | `"LR"` (default, rows go left to right) or `"TB"` (rows go down). |
| `rows` | `"route"` (default: a page sits at its fewest steps from the start) or `"story"` (a page sits below every page that leads to it; only real loops go back). |
| `tagLen` | A number such as 8: links longer than this many rows become `kind: "tag"` (a stub and a name at each end), with no stand-in stops. `0` = off (default). |
| `spine` | `true` puts the nodes marked `choke: true` in one line. |
| `better` | `true` adds six more rounds of reordering; never worse, a little slower. |
| `bundle` | `true` lets links that start at the same page share one run of stand-in stops, and links that end at the same page and are alone at their start share one run from the end upward. Fewer stops and crossings on maps without tags; about the same where tags already removed the long links. |
| `wrap` | `true` (with `dir: "TB"`) cuts a map more than 2.2 times taller than wide into columns side by side; links between columns become tags. |
| `lanes` | `true` puts nodes with the same `lane` number in their own band. |
| `prev` | `{ id: 0-1 order from the last drawing }` keeps the order stable. |
| `spread` | `"wide"` gives a looser, more tree-like drawing for wide screens: boxes beside each other get 2.4 times the gap top to bottom (1.4 times left to right), rows are 1.7 times further apart left to right (same top to bottom), and a box that leads to several boxes sits over the middle of them instead of over their weighted average. `"tight"` or nothing is the older, compact drawing exactly. |
| `gapNode`, `gapLayer`, `maxVertices` | Spacing, and the stop limit (default 90,000 stand-in stops, then it throws with `tooBig: true`). |

All the switches are off by default; with everything off the drawing is exactly Netflow Map's older one (15 checks, 8 pinned fingerprints made by the app's own engine).

Returns `{ nodes, edges, pos, order, lanes, width, height, crossings, rows, ruler, info, dir }`:
- `nodes`: yours with `x, y` (top left) and `layer` (row number) added; `pos` is the same by id.
- `edges`: yours with `kind` (`fwd`, `back`, `flat` = same row, `self`, `tag`) and `pts` (the stand-in stops of a long link, each `[x, y]`). A `tag` has `tagFwd` (true when it goes on down the page) and no `pts`.
- `info`: `{ rows, columns, stops, back, flat, tags, goldTags, rowMode }`. `ruler`: for each row `{ at, edge }` (where to write "step 12" and where its column starts).

`toSvg(result, colors)` draws boxes, curves and tag chips as a plain SVG string (text is escaped); `taper: true` draws forward links as shapes that narrow from 5 px to 1 px, so direction shows without arrowheads.

## WebAssembly (1.5.0)
The row-order search (crossing counts, sweeps, neighbor swaps) and the row placement run in WebAssembly, built from `wasm/order.c` (`sh wasm/build.sh`, then `python3 wasm/embed.py` puts the 8,040 bytes into `netflow-layers.js` as base64). A page needs only `'wasm-unsafe-eval'` in `script-src`; nothing is fetched. The pictures are the same to the last digit as the plain JavaScript, which stays in the file as the fallback (no WebAssembly, blocked by the page rule, a map under 100 stops, or a failed call). `NetflowLayers.wasm` is `{ on, min, calls, error }`: set `on = false` to force JavaScript, `min` to change the 100-stop limit, read `calls` and `error` to see what happened. Measured in ungoogled Chromium 155, Firefox 158 and WebKitGTK 2.52.6, 5,000 pages (lower is better): 37.7 to 26.9, 55 to 41 and 53 to 43 ms with wasm off and on; 1,000 pages 6.65 to 4.8, 10 to 8 and 8.5 to 7 ms. The first map of 100 stops or more compiles the module once (about 4 ms in WebKitGTK, under 1 ms in Chromium).

## How it compares

A small layered-graph drawer. It does less than ELK, and adds switches aimed at long story maps; ELK also wraps tall maps and bundles edges. Speed in browsers against any alternative: not measured.

| Alternative | Size (smaller is better) | Where it wins / loses |
|---|---|---|
| ELK layered ([elkjs](https://github.com/kieler/elkjs) 0.12.1, EPL-2.0 or GPL-3.0-or-later) | 1,502,625 bytes minified, 439,741 gzipped (`elk.bundled.js`, the layout code in one file; the API file alone is 4,365 bytes with the layout code in a separate worker file) | ELK wins on routing (polyline, orthogonal, spline), edge bundling, wrapping, network-simplex rows, Brandes-Koepf placement and over 140 options. An older Netflow Map report found 76% to 103% more crossings than dagre or ELK at 400 items (lower is better; not rechecked, and measured on the app's older flow layout, not this module). |
| [dagre](https://github.com/dagrejs/dagre) 0.8.5 (MIT) | 101,693 bytes minified, 27,772 gzipped (whole `dagre.js`, terser 5.51.2 `-c passes=2 -m`) | The long-standing layered layout for boxes and arrows. Not compared on speed or crossings here. This module is about a third of its size |
| [d3-dag](https://github.com/erikbrinkman/d3-dag) 1.2.2 (MIT) | 137,471 bytes minified, 42,115 gzipped (the published `d3-dag.iife.min.js`, minified again) | Not compared here on speed or crossings; its "fast" quality level is the class this module is in |
| d3-sankey (BSD-3-Clause, 0.12.3), a different tool for weighted flows | 5.7 KB minified, 2.0 KB gzipped (this module: 28,868 bytes readable, 9.3 KB gzipped) | No loops in d3-sankey; this engine handles them. Fewer crossings (see below). In the race below it is faster in WebKitGTK and GNOME Web at 1,500 items and slower elsewhere. |

**The one race on file** (1,500 items and 2,283 links, lower is better, ms; Netflow Map's Flow view built on this engine, then on d3-sankey; the whole app build with extra work such as must-pass pages, scores and loops, so it was not run on this module alone): ungoogled Chromium 155 30 against 21, Firefox 158 80 against 74, WebKitGTK 2.52.6 25 against 146, GNOME Web 46.5 22 against 78. In Chromium 155 it was slower at all three sizes (28, 20 and 30 ms against 5.4, 7.8 and 21 ms at 100, 400 and 1,500 items), and slower than d3-sankey at 100 items in all four browsers.

**Crossings** at 100, 400 and 1,500 items (lower is better; counted as straight lines between item centers): 173, 1,039 and 3,761 for this engine against 468, 5,415 and 107,409 for d3-sankey.

**Where it loses**
- Plain boxes only: link labels, ports and curved routing around boxes are not here (ELK has them).
- Not measured: browser speed and crossings against ELK, dagre and d3-dag.
- Story order is a choice, not the default: on a loop-free random map crossings rise from 90,351 to 131,569 (worse). Tags and bundling are the same kind of choice.
- Brandes-Koepf straight-line placement was built, measured and left out: fewer slanted pieces but wider maps (4,223 to 49,496 px at 5,002 pages).

## What it does differently (Node 22, median of 5 builds, 2026-10-17; story-shaped test maps)

Node numbers are not what a visitor's browser does: use them to compare rows with each other. Sizes and counts are exact; only the times depend on the browser. They come from Netflow Map's full build path, which first folds straight runs of pages into one box, so page counts differ a little from feeding the module a raw map; the drawing code is the same.

| Story (5,002 pages) | Rows | Stand-in stops | Gold links | Crossings | Width x height (px) | Build time (ms) |
|---|---|---|---|---|---|---|
| today (rows by fewest steps) | 1,337 | 33,087 | 1,027 | 1,216 | 4,223 x 160,446 | 392 |
| story order | 1,908 | 48,779 | 97 | 805 | 2,862 x 228,966 | 532 |
| tags (links over 8 rows) | 1,337 | 11 | 1,027 | 60 | 5,816 x 160,446 | 60 |
| tags + must-pass column | 1,337 | 11 | 1,027 | 60 | 1,913 x 160,446 | 54 |
| tags + column + columns for tall maps | 1,337 | 11 | 1,027 | 60 | 17,389 x 13,446 | 114 |
| everything on | 1,908 | 1,286 | 97 | 36 | 16,874 x 13,566 | 198 |

All columns are smaller-is-better. Story order makes "going back" honest (links drawn as back or sideways drop from 1,027 to 97, the real loops). Tags replace the stand-in stops of very long links (33,087 stops become 11), and a 20,000-page story that is refused as too big draws in about 0.4 s. Bundling on this story with shortest-route rows: stand-in stops 33,087 to 30,654 and crossings 1,216 to 1,065 (about 12% fewer); on a loop-free random map of 1,000 pages stops go 531 to 326 (39% fewer); with tags on there is little left to bundle. On a random map with no loops, story order drops gold links from 851 to 0.

## What it is not

- Plain boxes only: you give each node's size; no link labels, ports or curved routing around boxes.
- Rows are by fewest steps from `root` unless `rows: "story"`.
- More than 90,000 stand-in stops (page boxes plus the stops long links need) throws; turn on `tagLen` first.

## See it in action

Used right now in Netflow Map (its repository is private, so there is no link). Checked in each app's shipped file on its main branch on 2026.10.29. The module's own page is `demo.html` in this folder.

## For AI agents

- Give every node `w` and `h`, set `root`, and try `rows: "story"` and `tagLen: 8` for long stories; use `dir: "TB"` with `wrap: true` for tall maps. Handle the `tooBig` error by turning on `tagLen`.
- The result is plain data (`R.nodes`, `R.edges`); draw it yourself or use `toSvg`. The input is never changed.

## Prior art and credits

- The layered ("Sugiyama-style") way of drawing a graph in rows: rows first, then an order inside each row to cut crossings, then places. Idea only, no code. The same steps are in [Eclipse ELK](https://eclipse.dev/elk/) (EPL license; its overview was read, its code was not), dagre and d3-dag.
- Ideas read about in ELK's documentation and papers and written fresh here: wrapping a tall map into columns (ELK calls it edge wrapping and layer unzipping) and letting links that share a page share their stops (bundling, also in a Microsoft Research paper on layered drawings with edge bundling). Idea only, no code.
- Tapered links (narrow from the source to the target, so direction shows without arrowheads) follow the idea of Holten and van Wijk; the research notes mark that study as not re-read, so treat the credit as a pointer.
- Brandes-Koepf placement (a published method) was tried in the research, measured and not included; none of its code is in this module.
- The crossing counter is a standard Fenwick-tree (binary indexed tree) count. Textbook technique, no code from others.
- The engine was cut from Netflow Map (LFC Foundry's own code).

No code from others; the ideas above are theirs.

## Full research notes

The long version of this page (the full tables from Netflow Map's own notes, the history of each switch, and the longer comparison write-ups) is kept in the project's private knowledge base.
