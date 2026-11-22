# netflow-sankey

**Version 2.15.0 · API 2**

**Tested in:** node tests; Chromium, Firefox, WebKitGTK

## What it is and how it works

netflow-sankey lays out a flow chart (a Sankey diagram) from a list of links (`from`, `to`, `value`) and can draw it as an SVG. One file, 28.4 KB gzipped (19.5 KB minified and gzipped), no dependencies. Version 1.x had a different name; a project on 1.x only changes the folder, file and global to `netflow-sankey`, `netflow-sankey.js` and `NetflowSankey`.

- Items go into columns by flow direction, and every band is as thick as its flow.
- It searches for the order with the fewest crossings, counting big flows crossing big flows as the worst.
- Backward links (loops) are drawn under the chart instead of stopping it.

## Why it exists

A flow chart is read through its thick bands, so a crossing between two big flows matters far more than one between thin ones. d3-sankey counts every crossing the same and throws an error when the data has a loop. On three test charts netflow-sankey left about half the weighted crossings of d3-sankey.

**Where it helps**

- Budgets and money flows.
- Energy, material and supply chains, including recycling loops.
- User journeys where people go back a step.

**Not for:** pages that already ship D3, have no loops and want the smallest code (d3-sankey is about 2 KB gzipped).

## Try it and test it
**Test it:** `node modules/netflow-sankey/test/run.js` (31 checks, about 1 s). **Try it:** `demo.html` (type links, the chart redraws).

## Use
Load `netflow-sankey.js` (nothing else needed). One call, data only:
```js
svgElement.outerHTML = NetflowSankey.toSvg([{ from: "Wages", to: "Rent", value: 40 }, { from: "Wages", to: "Food", value: 25 }]);
containerDiv.innerHTML = NetflowSankey.toSvg([{ from: "Wages", to: "Rent", value: 40 }, { from: "Wages", to: "Food", value: 25 }]);   // the same call into a <div> you already have
```
`value`, `weight` or `count` names the amount. Options (the same words in every chart module) go in a second argument: `NetflowSankey.toSvg(links, { title: "Where the wages go", height: 360 })`. The two steps below give you the layout to draw yourself.

Your table can keep its own column names: `toSvg(rows, { from: 'Source', to: 'Target', value: 'Amount' })`, or leave them out and the first two text columns and the first number column are used (rows straight from a CSV work). `toSvg` returns SVG text (a string): put it in the page with `element.outerHTML = ...` or save it as a `.svg` file. `title` is optional: it draws a bold title above the picture and names the picture for screen readers; leave it out for none.

```js
var R = NetflowSankey.layoutFlows({ links: [
  { from: "Wages", to: "Rent",  value: 40 },
  { from: "Wages", to: "Food",  value: 25 },
  { from: "Food",  to: "Wages", value: 3 }     // a link that runs backwards is fine
] }, { height: 360 });
svgElement.innerHTML = NetflowSankey.toSvg(R, { title: "Where the wages go" });
```
`layoutFlows(input, opts)` returns `{ nodes, bands, loops, width, height, simplified, note, ky, crossingWeight, ignored, ms }` (`simplified` is how many very long links were drawn as one straight band because routing all of them would be too slow, 0 when none, and `note` is a sentence saying so; the cap is 20,000 stand-in points):
- `nodes`: `{ id, label, x, y, w, h, layer, flow }` (the bars)
- `bands`: `{ link, value, from, to, x0, y0a, y0b, x1, y1a, y1b, xm }` (one per link per layer step; a long link has several; `link` is the index in your list)
- `loops`: backward links, drawn as bands under the picture (`link`, `value`, `d`, `w`, `pts`)
- `ignored`: how many of your links were dropped (to itself, or not above 0)

**Dragging a bar (since 2.14.0):** `layout()` results carry a hidden `state`. Pass it back as `opts.resume` (same items, same settings and `fixedOrder`, only `fixY` different) and the order, sizes and relaxed places are not worked out again: 10,000 items and 15,000 links take 0.32 (Chromium 156), 0.22 (Firefox 158) and 0.28 (WebKitGTK 2.52.6) of the time per move, with the same picture. A state from other settings is ignored and the full layout runs.

**For Netflow Map's engine (2.1.0):** `NetflowSankey.options(sk)` cleans up a person's settings (`nodeW`, `gap`, `pad`, `height`, `fixY`, `justify`, `order`; anything missing or out of range gets its default or the nearest limit) into the `opts` that `layout()` reads, and `NetflowSankey.apply(L, r)` writes a `layout(L, opts)` result `r` into the engine's drawing `L`: bar positions (`x, y, w, h, cx, cy, layer`, plus `skIn`, `skOut`, `skPinned`), the picture's `width` and `height`, `dir = 'LR'`, and `L.sk = { bands, loops, ky, order, cols, crossingWeight, ms }`. With netflow-engine: `NetflowEngine.use('sankey', NetflowSankey)`.

`opts`: `height` (aim for this picture height), `nodeW`, `gapLayer` (space between columns), `pad` (space between bars), `restarts` and `budgetMs` (how hard to search for a good order), `stall` (since 2.15.0, off by default: `3` stops the restarts after three in a row that found no better order; about 2 times faster at 500 links with the same picture on the three real flows tried, but a later restart does find a better order on some networks), `quick` (true: skip the extra restarts for speed on small charts; see below), `seed`, `unweighted`, `justifySinks`, and `stopCap` with `stopCapFrom` (off by default: on maps with at least `stopCapFrom` items, default 1,000, at most `stopCap` stand-in stops; the lightest long links beyond that are drawn as one straight band each, which is faster but a different picture: at 1,500 items `stopCap: 500` takes about 4 ms instead of 24 in Node). `toSvg` takes `colors`, `labels`, `fontSize`, `textColor`, `bandOpacity`, and the optional `title`, `subtitle` and `source` (a bold title and lighter subtitle drawn above the picture, a small source line below; the title is also the picture's hidden label for screen readers); `highlight` (optional, since 2.8.0) names one item by id or label: that item and every band that touches it keep their colors, and the rest fade toward the background, the same word as in netflow-plot. Since 2.11.0 `toSvg` also takes `valueLabel` (`'none'`, `'under'`, `'inline'`, `'percent'` or `'both'`), `unit` (a money sign before the number, a word after; `unitAt` decides it instead), `percentOf` (`'total'` or `'column'`) and `notes` (`[{ text, x, y, anchor, size, color, bold, align }]`: plain text at 0 to 1 across and down the picture, a thin leader line to `anchor` (an item or `"from>to"`), live words `{total}`, `{value:id}`, `{share:id}`, `{flow:from>to}`, `{top}` (the biggest flow with its amount, "Salary to Rent, $1,800") and, since 2.12.0, `{topbox}` (the biggest item with its amount, "Salary, $3,000")). These are the same words netflow-scene reads. A note past the edge widens the picture. All text is escaped. `fromLinks`, `layout`, `layering`, `crossWeight`, `roundPath` and `toBezier` are exported for people who want the pieces.

## How it compares
netflow-sankey is bigger than d3-sankey, but on four real retail revenue charts (72 to 1,500 links) it leaves 12% to 77% of d3-sankey's weighted crossings (lower is better), and it draws a chart with loops where d3-sankey stops with an error. Speed against d3-sankey on real retail revenue flows (country to month to product, the top links by value; ungoogled Chromium 156, Firefox 158, WebKitGTK 2.52.6, 2026.11.22): at 72 links d3-sankey is faster in Chromium (0.39x) and Firefox (0.5x) and level in WebKitGTK; at 200 links it is level or ahead (Chromium 1.17x, Firefox 0.67x, WebKitGTK 1.0x); at 500 links this module is 1.0 to 1.5 times as fast; at 1,500 links 2.1 to 3.8 times as fast. The earlier 3.7 to 5.5 times (laptop Firefox 160, generated charts) did not hold on real data.

| Alternative | Size (smaller is better) | Speed | Features | Where it wins / loses |
|---|---|---|---|---|
| [d3-sankey](https://github.com/d3/d3-sankey) (BSD-3-Clause, 0.12.3) | 5.7 KB minified, 2.0 KB gzipped, plus d3-array and d3-shape (their size: not measured). This module: 81,657 bytes readable, 28.4 KB gzipped; 47,326 bytes minified, 19.5 KB minified and gzipped (terser 5.51.2) | Real retail flows, three test browsers: d3-sankey faster or level up to 200 links (down to 0.39x), this module 1.0 to 1.5 times as fast at 500 links and 2.1 to 3.8 times at 1,500 | No loops (throws "circular link"); crossing order not weighted by flow | Wins on size. Loses on weighted crossings (12% to 77% as many on real charts) and on loops |
| d3-sankey-circular and similar forks (version and license: not read) | Not measured | Not measured | Add loops to d3-sankey | Same job as the loop support here; pictures not compared |
| Plotly and Google Charts Sankey (versions: not read) | Not measured (each is a whole charting library) | Not measured | Sankey as one chart type among many | Pick one if you already ship it; this module is only the Sankey layout and SVG |

The browser race of Netflow Map against D3 measured the app's own flow engine, not this module, so it gives no browser number for netflow-sankey.

**Where it loses**
- Bigger than d3-sankey.
- Speed against d3-sankey is measured in one browser only (laptop Firefox 160), and d3-sankey is faster on small charts with the default settings (with `quick: true` this module is faster there and still tidier; see Limits).
- The crossing result is one yardstick on three charts, not a proof for every chart.
- d3-sankey is the standard: use it if you already use D3 and your data has no loops.

**What it does differently**
- **Every link is drawn,** and a band is as thick as its flow everywhere, on one scale for the whole picture.
- **Long links go through the columns in between** instead of jumping across them.
- **Order by weighted crossings:** big flows crossing big flows cost most, so the picture keeps the important flows clear.
- **Backward links are drawn** as bands under the picture. They never stop the layout.

## Numbers (Node 22, measured 2026-10-17, against d3-sankey 0.12.3)

> **Node numbers.** The speeds in this section were measured in Node, not in the three test browsers (ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6), so they are not what a visitor's browser does. Use them to compare rows with each other, not as page speeds. Sizes and counts are exact; only the times depend on the browser. Re-measuring in the three browsers is not done (open item on `TASKS.md`).

Four real charts (2026.11.22): retail revenue flows, country to month to product, the top 72, 200, 500 and 1,500 links by value. One yardstick for both: for every pair of bands between the same two columns that cross, add their two flows multiplied together. Lower is better. Counts are exact and do not depend on the browser; the harness is `tools/real-corpus`.

| Links | netflow-sankey | d3-sankey | netflow-sankey as a share of d3-sankey |
|---|---|---|---|
| 72 | 2.10e12 | 2.95e12 | 71% |
| 200 | 4.44e12 | 5.94e12 | 75% |
| 500 | 5.60e12 | 45.68e12 | 12% |
| 1,500 | 7.94e12 | 10.36e12 | 77% |

So 12% to 77% of the weighted crossings, at 0.4 to 3.8 times the speed of d3-sankey depending on size and browser (table in the Speed paragraph above). The two tools place the columns differently, so this is one yardstick on four charts, not a proof for every chart. The earlier generated charts (64, 118 and 222 links; 47% to 58%) were replaced. A chart with a loop (a to b to c to a): d3-sankey throws "circular link"; netflow-sankey draws it.

## WebAssembly (since 2.3.0)

**What.** The inner loop of the order search (counting weighted crossings, sorting each column by the average position of its neighbors, trying swaps; `wasm/order.c`, 5,319 bytes) also exists as WebAssembly, embedded in `netflow-sankey.js` and used first. The restarts, the random numbers and everything else stay JavaScript, so a layout comes out the same as before: 48 test layouts identical to the last digit, with and without the CSP word, in each of 12 browser runs. `NetflowSankey.wasmAvailable()` says whether the browser allows it; `layout(..., { wasm: false })` forces the JavaScript code.

**Why.** Median of 3 passes of 5 rounds in rotating order, JavaScript to WebAssembly in ms (lower is better; times faster, higher is better; WebKit's clock moves in whole milliseconds, so quick layouts there are timed 10 in a row). Only the order search is faster; the rest of a layout is still JavaScript, so big charts gain little.

| Chart | Chromium 155 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---|---|---|
| small, 70 bars | 3.0 to 1.9 (1.58x) | 3.2 to 1.7 (1.88x) | 2.1 to 1.7 (1.24x) |
| medium, 240 bars | 19.3 to 11.7 (1.65x) | 23.1 to 14.0 (1.65x) | 14.8 to 14.2 (1.04x) |
| dense, 320 bars | 7.6 to 6.5 (1.17x) | 7.3 to 7.0 (1.04x) | 6.0 to 6.1 (0.98x) |
| large, 640 bars | 5.9 to 5.1 (1.16x) | 6.4 to 6.1 (1.05x) | 4.8 to 4.9 (0.98x) |
| big, 1000 bars | 7.2 to 6.5 (1.11x) | 8.9 to 8.3 (1.07x) | 6.3 to 6.3 (1.00x) |
| first layout, right after the page loads | 40.4 to 30.7 (1.32x) | 34 to 22 (1.55x) | 31 to 29 (1.07x) |
| first layout, 250 ms after the page loads | 43.4 to 29.4 (1.48x) | 36 to 22 (1.64x) | 26 to 26 (1.00x) |

Chromium and Firefox rows are the median of 3 passes of 5 rounds; WebKitGTK's chart rows were run again as 3 passes of 9 rounds (a first run had shown two cells 9 to 10% slower, which did not repeat); the first-layout rows are the median of 11 fresh pages.

**Use.**
- Add `'wasm-unsafe-eval'` to `script-src` if your page has a Content Security Policy. Without it, or if anything goes wrong at the start, the JavaScript code runs and gives the same layout. A chart with a flow that is negative, not a number or above 1e100 also uses the JavaScript code.
- The wasm compiles in the background when the file loads; a layout asked for before that is done compiles it on the spot. `NetflowSankey.wasmReady()` is a promise (true or false) and `NetflowSankey.wasmModule()` gives the compiled module once ready (else null). Nothing is stored in the browser.
- **`warm()`** (opt-in, 2.13.0) returns a promise (true, or false if the warm-up could not run). Call it once when the page is idle, after the first screen. It waits for the wasm, then lays out a made-up 30-item Sankey in one short task and draws it as SVG in the next, and throws both away. The first real Sankey then skips most of the cold start: a fresh page's first 100-item Sankey (layout plus SVG) took 0.67 to 0.90 of the time in Chromium 155, Firefox 158 and WebKitGTK 2.52.6, and 400 items 0.71 to 0.94. It moves work rather than removing it (about 6 ms in two tasks in Node). Nothing is kept, and later pictures are exactly the same.
- All layouts on a page share one WebAssembly memory, which grows as needed and is not freed.
- Source `wasm/order.c`, rebuild `wasm/build.sh`, embed `wasm/embed.py`; both have `--check` to prove the committed files match.

**Honest limits.** Gains are in Chromium and Firefox (up to 1.9x on small charts, about 1.05 to 1.2x on big ones). In WebKitGTK the chart rows are a wash (0.98x to 1.24x). Costs bytes: +11,578 as written (37,790 to 49,368), +9,493 minified (19,377 to 28,870) and +4,301 gzipped (8,097 to 12,398) with terser 5.51.2 (smaller is better). Not run: a phone, Safari.

## Limits
- `quick: true` (opt-in, 2.10.0) trades some tidiness for speed. Measured on real retail revenue flows (2026.11.22, medians of 5 warm runs, ms per chart; d3-sankey / quick / default; Chromium 156 / Firefox 158 / WebKitGTK 2.52.6):

  | Links | Chromium | Firefox | WebKitGTK |
  |---|---|---|---|
  | 72 | 1.6 / 0.7 / 1.2 | 2 / 1 / 1 | 1 / 1 / 1 |
  | 200 | 2.7 / 1.5 / 1.6 | 3 / 2 / 2 | 2 / 1 / 2 |
  | 500 | 8.3 / 2.0 / 4.8 | 7 / 2 / 6 | 5 / 2 / 7 |
  | 1,500 | 46.9 / 4.6 / 15.5 | 47 / 6 / 17 | 31 / 5 / 15 |

  Quick mode is level with or faster than d3-sankey at every size; the default is slower than d3-sankey at 500 links in WebKitGTK (7 against 5 ms) and level elsewhere below 500 links. Firefox and WebKitGTK report whole milliseconds, so the small cells carry a rounding of up to 1 ms. Crossings for the default are in the Numbers section; the earlier generated-chart figures (74 to 78% for quick, 68 to 73% for the default) were removed and quick mode's crossings have not been re-counted on real charts.
- The search is a heuristic (it restarts several times within a time budget); it finds a good order, not always the best.
- Items are placed in columns by flow direction; you cannot pin an item to a chosen column.
- No dragging or editing: it returns numbers, and `toSvg` is a simple drawing. For anything fancier draw `nodes`, `bands` and `loops` yourself.
- The d3-sankey times above were taken with version 1.0.0 (the earlier name of this module); 2.0.0 lays out the same kind of charts about 3.7 to 4.1 times faster (66, 102 and 194 links: 2.0, 3.2 and 4.4 ms in Node 22). Bigger charts, layout and `toSvg` together in Chromium 155: 12,600 links about 0.27 s, 31,500 links about 0.25 s (the order search does less work on very big charts, so the time does not simply grow with the links). Redraw big charts when the page is idle, not on every key press.

## See it in action

Used right now in Netflow Map (its repository is private, so there is no link). Checked in each app's shipped file on its main branch on 2026.10.29. The module's own page is `demo.html` in this folder.

## Prior art and credits
- [d3-sankey](https://github.com/d3/d3-sankey) (BSD-3-Clause, 0.12.3, 5.7 KB minified, 2.0 KB gzipped, plus d3-array and d3-shape): the standard. Smaller, and faster or level on charts up to about 200 links; 2.1 to 3.8 times slower at 1,500 links on real retail flows in the three test browsers; it throws on a loop, and its crossing order is not weighted by flow. d3-sankey-circular and similar forks add loops. Use d3-sankey if you already use D3 and your data has no loops. Used here only as the thing to measure against; no d3-sankey code is in this module.
- Google Charts and Plotly draw Sankey diagrams too, as part of larger libraries. Not used.
- Idea only, no code: scoring a layout by the sum, over every pair of crossing links, of the two flows multiplied together (Zarate, Le Bodic, Dwyer, Gange and Stuckey, ["Optimal Sankey Diagrams via Integer Programming"](https://doi.org/10.1109/PacificVis.2018.00025), PacificVis 2018; their method needs a commercial solver, which is not used here).
- Idea only, no code: ordering each column by flow-weighted averages of the neighbors' places (Li, Li, Tan and Li, ["Crossing Reduction of Sankey Diagram with Barycentre Ordering via Markov Chain"](https://arxiv.org/abs/1912.05339), 2019), and the rules of many random restarts and keeping the best order by weighted crossings (OmicsSankey).
- The crossing counter is a standard Fenwick-tree count and the layer-by-layer order search is the usual textbook method; no code from others.
- Netflow Map's flow chart (LFC Foundry's own) is where this code was cut from.
No code from others; the ideas above are theirs.

**Original sources** (links checked 2026-11-14; ideas only unless the section above says code is included):

- Crossing counting in n log n: Barth, Junger and Mutzel, ["Simple and Efficient Bilayer Cross Counting"](https://doi.org/10.7155/jgaa.00088), JGAA 2004, with a Fenwick tree (Peter Fenwick, ["A new data structure for cumulative frequency tables"](https://doi.org/10.1002/spe.4380240306), 1994)

## For AI agents
Give `layoutFlows` a plain list of `{ from, to, value }`, draw with `toSvg` or from the result, and show `ignored` to the user if it is not 0. Names such as `__proto__` are rejected on purpose.
