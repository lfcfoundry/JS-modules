# netflow-sankey

**Version 2.3.3 · API 2**

**Tested in:** Chromium 155, Firefox 158, WebKitGTK 2.52.6 (cloud); laptop Chromium 156 and Firefox 160 (16 cores); early-stop A/B

## What it is and how it works

netflow-sankey lays out a flow chart (a Sankey diagram) from a list of links (`from`, `to`, `value`) and can draw it as an SVG. One file, 21.3 KB gzipped (15.5 KB minified and gzipped), no dependencies. Version 1.x had a different name; a project on 1.x only changes the folder, file and global to `netflow-sankey`, `netflow-sankey.js` and `NetflowSankey`.

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

**For Netflow Map's engine (2.1.0):** `NetflowSankey.options(sk)` cleans up a person's settings (`nodeW`, `gap`, `pad`, `height`, `fixY`, `justify`, `order`; anything missing or out of range gets its default or the nearest limit) into the `opts` that `layout()` reads, and `NetflowSankey.apply(L, r)` writes a `layout(L, opts)` result `r` into the engine's drawing `L`: bar positions (`x, y, w, h, cx, cy, layer`, plus `skIn`, `skOut`, `skPinned`), the picture's `width` and `height`, `dir = 'LR'`, and `L.sk = { bands, loops, ky, order, cols, crossingWeight, ms }`. With netflow-engine: `NetflowEngine.use('sankey', NetflowSankey)`.

`opts`: `height` (aim for this picture height), `nodeW`, `gapLayer` (space between columns), `pad` (space between bars), `restarts` and `budgetMs` (how hard to search for a good order), `seed`, `unweighted`, `justifySinks`. `toSvg` takes `colors`, `labels`, `fontSize`, `textColor`, `bandOpacity` and `title`; all text is escaped. `fromLinks`, `layout`, `layering`, `crossWeight`, `roundPath` and `toBezier` are exported for people who want the pieces.

## How it compares
netflow-sankey is bigger than d3-sankey, but on three made-up charts it leaves about half the weighted crossings (47% to 58% of d3-sankey's; lower is better), and it draws a chart with loops where d3-sankey stops with an error. Speed against d3-sankey (laptop Firefox 160, 16 cores, 2026.10.30): 3.7 to 5.5 times as fast at 200 and 500 nodes; at 72 nodes d3-sankey is about twice as fast with the default settings.

| Alternative | Size (smaller is better) | Speed | Features | Where it wins / loses |
|---|---|---|---|---|
| [d3-sankey](https://github.com/d3/d3-sankey) (BSD-3-Clause, 0.12.3) | 5.7 KB minified, 2.0 KB gzipped, plus d3-array and d3-shape (their size: not measured). This module: 61,115 bytes readable, 21.3 KB gzipped; 37,858 bytes minified, 15.5 KB minified and gzipped (terser 5.51.2) | Laptop Firefox 160: 3.7 to 5.5 times as fast at 200 and 500 nodes; d3-sankey about twice as fast at 72 nodes | No loops (throws "circular link"); crossing order not weighted by flow | Wins on size. Loses on weighted crossings (about half as many here) and on loops |
| d3-sankey-circular and similar forks (version and license: not read) | Not measured | Not measured | Add loops to d3-sankey | Same job as the loop support here; pictures not compared |
| Plotly and Google Charts Sankey (versions: not read) | Not measured (each is a whole charting library) | Not measured | Sankey as one chart type among many | Pick one if you already ship it; this module is only the Sankey layout and SVG |

The browser race of Netflow Map against D3 measured the app's own flow engine, not this module, so it gives no browser number for netflow-sankey.

**Where it loses**
- Bigger than d3-sankey.
- Speed against d3-sankey is measured in one browser only (laptop Firefox 160), and d3-sankey is faster on small charts with the default settings. Version 2.0.0 is faster than 1.0.0: a 12,600-link chart lays out in 168 ms against 666 ms in ungoogled Chromium 155.0.8059.39-1 (smaller is better).
- The crossing result is one yardstick on three charts, not a proof for every chart.
- d3-sankey is the standard: use it if you already use D3 and your data has no loops.

**What it does differently**
- **Every link is drawn,** and a band is as thick as its flow everywhere, on one scale for the whole picture.
- **Long links go through the columns in between** instead of jumping across them.
- **Order by weighted crossings:** big flows crossing big flows cost most, so the picture keeps the important flows clear.
- **Backward links are drawn** as bands under the picture. They never stop the layout.

## Numbers (Node 22, measured 2026-10-17, against d3-sankey 0.12.3)

> **Node numbers.** The speeds in this section were measured in Node, not in the four test browsers (ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5), so they are not what a visitor's browser does. Use them to compare rows with each other, not as page speeds. Sizes and counts are exact; only the times depend on the browser. Re-measuring in the four browsers is not done (open item on `TASKS.md`).

Three made-up charts (64, 118 and 222 links). One yardstick for both: for every pair of links that cross, add their two flows multiplied together. Lower is better.

| Links | netflow-sankey | d3-sankey | netflow-sankey as a share of d3-sankey | time (netflow-sankey / d3-sankey) |
|---|---|---|---|---|
| 64 | 2,147 | 4,608 | 47% | 17 ms / 5 ms |
| 118 | 10,840 | 22,131 | 49% | 25 ms / 4 ms |
| 222 | 35,454 | 61,492 | 58% | 26 ms / 7 ms |

So about half the weighted crossings, at about 4 to 5 times the time (still under 30 ms). The two tools place the columns differently, so this is one yardstick on three charts, not a proof for every chart. A chart with a loop (a to b to c to a): d3-sankey throws "circular link"; netflow-sankey draws it (2 bands and 1 loop).

## WebAssembly (since 2.3.0)

**What.** The inner loop of the order search (counting weighted crossings, sorting each column by the average position of its neighbors, trying swaps; `wasm/order.c`, 5,319 bytes) also exists as WebAssembly, embedded in `netflow-sankey.js` and used first. The restarts, the random numbers and everything else stay JavaScript, so a layout comes out the same as before: 48 test layouts identical to the last digit, with and without the CSP word, in each of 12 browser runs. `NetflowSankey.wasmAvailable()` says whether the browser allows it; `layout(..., { wasm: false })` forces the JavaScript code.

**Why.** Median of 3 passes of 5 rounds in rotating order, JavaScript to WebAssembly in ms (lower is better; times faster, higher is better; WebKit's clock moves in whole milliseconds, so quick layouts there are timed 10 in a row). Only the order search is faster; the rest of a layout is still JavaScript, so big charts gain little.

| Chart | Chromium 155 | Firefox 158 | WebKitGTK 2.52.6 | GNOME Web 46.5 |
|---|---|---|---|---|
| small, 70 bars | 3.0 to 1.9 (1.58x) | 3.2 to 1.7 (1.88x) | 2.1 to 1.7 (1.24x) | 2.2 to 1.9 (1.16x) |
| medium, 240 bars | 19.3 to 11.7 (1.65x) | 23.1 to 14.0 (1.65x) | 14.8 to 14.2 (1.04x) | 14.5 to 13.8 (1.05x) |
| dense, 320 bars | 7.6 to 6.5 (1.17x) | 7.3 to 7.0 (1.04x) | 6.0 to 6.1 (0.98x) | 5.9 to 5.8 (1.02x) |
| large, 640 bars | 5.9 to 5.1 (1.16x) | 6.4 to 6.1 (1.05x) | 4.8 to 4.9 (0.98x) | 4.9 to 5.0 (0.98x) |
| big, 1000 bars | 7.2 to 6.5 (1.11x) | 8.9 to 8.3 (1.07x) | 6.3 to 6.3 (1.00x) | 6.3 to 6.4 (0.98x) |
| first layout, right after the page loads | 40.4 to 30.7 (1.32x) | 34 to 22 (1.55x) | 31 to 29 (1.07x) | 33 to 37 (0.89x) |
| first layout, 250 ms after the page loads | 43.4 to 29.4 (1.48x) | 36 to 22 (1.64x) | 26 to 26 (1.00x) | 34 to 34 (1.00x) |

Chromium and Firefox rows are the median of 3 passes of 5 rounds; the two WebKit browsers' chart rows were run again as 3 passes of 9 rounds (a first run had shown two cells 9 to 10% slower, which did not repeat); the first-layout rows are the median of 11 fresh pages.

**Use.**
- Add `'wasm-unsafe-eval'` to `script-src` if your page has a Content Security Policy. Without it, or if anything goes wrong at the start, the JavaScript code runs and gives the same layout. A chart with a flow that is negative, not a number or above 1e100 also uses the JavaScript code.
- The wasm compiles in the background when the file loads; a layout asked for before that is done compiles it on the spot. `NetflowSankey.wasmReady()` is a promise (true or false) and `NetflowSankey.wasmModule()` gives the compiled module once ready (else null). Nothing is stored in the browser.
- All layouts on a page share one WebAssembly memory, which grows as needed and is not freed.
- Source `wasm/order.c`, rebuild `wasm/build.sh`, embed `wasm/embed.py`; both have `--check` to prove the committed files match.

**Honest limits.** Gains are in Chromium and Firefox (up to 1.9x on small charts, about 1.05 to 1.2x on big ones). In the two WebKit browsers the chart rows are a wash (0.98x to 1.24x). The one real cost: a layout started right after the page loads in GNOME Web is about 4 ms slower (33 to 37 ms, 0.89x) because the wasm is still compiling in the background; 250 ms later it is equal. Costs bytes: +11,578 as written (37,790 to 49,368), +9,493 minified (19,377 to 28,870) and +4,301 gzipped (8,097 to 12,398) with terser 5.51.2 (smaller is better). Not run: a phone, Safari.

## Limits
- The search is a heuristic (it restarts several times within a time budget); it finds a good order, not always the best.
- Items are placed in columns by flow direction; you cannot pin an item to a chosen column.
- No dragging or editing: it returns numbers, and `toSvg` is a simple drawing. For anything fancier draw `nodes`, `bands` and `loops` yourself.
- The d3-sankey times above were taken with version 1.0.0 (the earlier name of this module); 2.0.0 lays out the same kind of charts about 3.7 to 4.1 times faster (66, 102 and 194 links: 2.0, 3.2 and 4.4 ms in Node 22). Bigger charts, layout and `toSvg` together in Chromium 155: 12,600 links about 0.27 s, 31,500 links about 0.25 s (the order search does less work on very big charts, so the time does not simply grow with the links). Redraw big charts when the page is idle, not on every key press.

## See it in action

Used right now in Netflow Map (its repository is private, so there is no link). Checked in each app's shipped file on its main branch on 2026.10.29. The module's own page is `demo.html` in this folder.

## Prior art and credits
- [d3-sankey](https://github.com/d3/d3-sankey) (BSD-3-Clause, 0.12.3, 5.7 KB minified, 2.0 KB gzipped, plus d3-array and d3-shape): the standard. Smaller, and faster on small charts (72 nodes); 3.7 to 5.5 times slower at 200 and 500 nodes in laptop Firefox 160; it throws on a loop, and its crossing order is not weighted by flow. d3-sankey-circular and similar forks add loops. Use d3-sankey if you already use D3 and your data has no loops. Used here only as the thing to measure against; no d3-sankey code is in this module.
- Google Charts and Plotly draw Sankey diagrams too, as part of larger libraries. Not used.
- Idea only, no code: scoring a layout by the sum, over every pair of crossing links, of the two flows multiplied together (Dwyer and others, "Optimal Sankey Diagrams via Integer Programming"; their method needs a commercial solver, which is not used here).
- Idea only, no code: ordering each column by flow-weighted averages of the neighbors' places (Zhang and others, "Crossing Reduction of Sankey Diagram with Barycentre Ordering via Markov Chain"), and the rules of many random restarts and keeping the best order by weighted crossings (OmicsSankey).
- The crossing counter is a standard Fenwick-tree count and the layer-by-layer order search is the usual textbook method; no code from others.
- Netflow Map's flow chart (LFC Foundry's own) is where this code was cut from.
No code from others; the ideas above are theirs.

## For AI agents
Give `layoutFlows` a plain list of `{ from, to, value }`, draw with `toSvg` or from the result, and show `ignored` to the user if it is not 0. Names such as `__proto__` are rejected on purpose.
