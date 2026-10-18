# netflow-sankey

**Version 2.0.0 · API 2**

**Tested in:** Node 22 checks (15, about 0.3 s); the same-pictures comparison against river-layout 1.0.0 and the timings of seven test charts in ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, one at a time; the demo page drawn and edited in the same four (2026-10-17). Not run: a phone

Lays out a flow chart (a Sankey diagram, "where did it come from and where did it go") from a plain list of links, and draws it as an SVG if you want. About 34 KB (11.6 KB gzipped), no dependencies. Cut from Netflow Map. Called river-layout (global `RiverLayout`) in version 1.x.

It reads your list of links, puts each item in a column by the direction of the flow, and makes each band as thick as its flow on one scale for the whole picture. A long link passes through the columns in between. It then searches for the order of items in each column that gives the fewest weighted crossings (big flows crossing big flows cost most), restarting several times within a time budget and keeping the best order. Backward links are drawn as bands under the picture, and `toSvg` draws the result as an SVG.

## Why it exists
Flow charts are read by the thick bands. If the thick ones tangle, the chart is useless, so the search spends its effort there. And data from real life has loops, which must not crash the page.

## Try it and test it
**Test it:** `node modules/netflow-sankey/test/run.js` (15 checks, about 0.3 s). **Try it:** `demo.html` (type links, the chart redraws).

## Use
```js
var R = NetflowSankey.layoutFlows({ links: [
  { from: "Wages", to: "Rent",  value: 40 },
  { from: "Wages", to: "Food",  value: 25 },
  { from: "Food",  to: "Wages", value: 3 }     // a link that runs backwards is fine
] }, { height: 360 });
svgElement.innerHTML = NetflowSankey.toSvg(R, { title: "Where the wages go" });
```
`layoutFlows(input, opts)` returns `{ nodes, bands, loops, width, height, ky, crossingWeight, ignored, ms }`:
- `nodes`: `{ id, label, x, y, w, h, layer, flow }` (the bars)
- `bands`: `{ link, value, from, to, x0, y0a, y0b, x1, y1a, y1b, xm }` (one per link per layer step; a long link has several; `link` is the index in your list)
- `loops`: backward links, drawn as bands under the picture (`link`, `value`, `d`, `w`, `pts`)
- `ignored`: how many of your links were dropped (to itself, or not above 0)

`opts`: `height` (aim for this picture height), `nodeW`, `gapLayer` (space between columns), `pad` (space between bars), `restarts` and `budgetMs` (how hard to search for a good order), `seed`, `unweighted`, `justifySinks`. `toSvg` takes `colors`, `labels`, `fontSize`, `textColor`, `bandOpacity` and `title`; all text is escaped. `fromLinks`, `layout`, `layering`, `crossWeight`, `roundPath` and `toBezier` are exported for people who want the pieces.

## How it compares
netflow-sankey is bigger than d3-sankey, but on three made-up charts it leaves about half the weighted crossings (47% to 58% of d3-sankey's; lower is better), and it draws a chart with loops where d3-sankey stops with an error. Speed against d3-sankey in browsers: not measured.

| Alternative | Size (smaller is better) | Speed | Features | Where it wins / loses |
|---|---|---|---|---|
| [d3-sankey](https://github.com/d3/d3-sankey) (BSD-3-Clause, 0.12.3) | 5.7 KB minified, 2.0 KB gzipped, plus d3-array and d3-shape (their size: not measured). This module: 34,081 bytes readable, 11.6 KB gzipped; minified size: not measured | In browsers: not measured (Node numbers are in "Numbers" below) | No loops (throws "circular link"); crossing order not weighted by flow | Wins on size. Loses on weighted crossings (about half as many here) and on loops |
| d3-sankey-circular and similar forks (version and license: not read) | Not measured | Not measured | Add loops to d3-sankey | Same job as the loop support here; pictures not compared |
| Plotly and Google Charts Sankey (versions: not read) | Not measured (each is a whole charting library) | Not measured | Sankey as one chart type among many | Pick one if you already ship it; this module is only the Sankey layout and SVG |

The browser race of Netflow Map against D3 measured the app's own flow engine, not this module, so it gives no browser number for netflow-sankey.

**Where it loses**
- Bigger than d3-sankey.
- Speed against d3-sankey: not measured in browsers (an older Node run is in "Numbers" below). Version 2.0.0 is faster than 1.0.0: a 12,600-link chart lays out in 168 ms against 666 ms in ungoogled Chromium 155.0.8059.39-1 (smaller is better).
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

## Limits
- The search is a heuristic (it restarts several times within a time budget); it finds a good order, not always the best.
- Items are placed in columns by flow direction; you cannot pin an item to a chosen column.
- No dragging or editing: it returns numbers, and `toSvg` is a simple drawing. For anything fancier draw `nodes`, `bands` and `loops` yourself.
- The d3-sankey times above were taken with river-layout 1.0.0; 2.0.0 lays out the same kind of charts about 3.7 to 4.1 times faster (66, 102 and 194 links: 2.0, 3.2 and 4.4 ms in Node 22). Bigger charts, layout and `toSvg` together in Chromium 155: 12,600 links about 0.27 s, 31,500 links about 0.25 s (the order search does less work on very big charts, so the time does not simply grow with the links). Redraw big charts when the page is idle, not on every key press.

## Prior art and credits
- [d3-sankey](https://github.com/d3/d3-sankey) (BSD-3-Clause, 0.12.3, 5.7 KB minified, 2.0 KB gzipped, plus d3-array and d3-shape): the standard. Smaller; speed against this module in browsers is not measured; it throws on a loop, and its crossing order is not weighted by flow. d3-sankey-circular and similar forks add loops. Use d3-sankey if you already use D3 and your data has no loops. Used here only as the thing to measure against; no d3-sankey code is in this module.
- Google Charts and Plotly draw Sankey diagrams too, as part of larger libraries. Not used.
- Idea only, no code: scoring a layout by the sum, over every pair of crossing links, of the two flows multiplied together (Dwyer and others, "Optimal Sankey Diagrams via Integer Programming"; their method needs a commercial solver, which is not used here).
- Idea only, no code: ordering each column by flow-weighted averages of the neighbors' places (Zhang and others, "Crossing Reduction of Sankey Diagram with Barycentre Ordering via Markov Chain"), and the rules of many random restarts and keeping the best order by weighted crossings (OmicsSankey).
- The crossing counter is a standard Fenwick-tree count and the layer-by-layer order search is the usual textbook method; no code from others.
- Netflow Map's flow chart (LFC Foundry's own) is where this code was cut from.
No code from others; the ideas above are theirs.

## For AI agents
Give `layoutFlows` a plain list of `{ from, to, value }`, draw with `toSvg` or from the result, and show `ignored` to the user if it is not 0. Names such as `__proto__` are rejected on purpose.
