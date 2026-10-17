# river-layout

**Version 1.0.0 · API 1**

**Tested in:** Node checks; the demo page in Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6, one at a time (`tests/flow-demos.js`, 2026-10-17; WebKitGTK 2.52.6 through `tools/webkit-driver`). Not run: GNOME Web (Epiphany) 46.5, a phone.

Lays out a flow chart (a Sankey diagram, "where did it come from and where did it go") from a plain list of links, and draws it as an SVG if you want. About 27 KB (8.9 KB gzipped), no dependencies. Cut from Net Flow Map.

**Test it:** `node modules/river-layout/test/run.js` (12 checks, about 0.2 s). **Try it:** `demo.html` (type links, the chart redraws).

## Use
```js
var R = RiverLayout.layoutFlows({ links: [
  { from: "Wages", to: "Rent",  value: 40 },
  { from: "Wages", to: "Food",  value: 25 },
  { from: "Food",  to: "Wages", value: 3 }     // a link that runs backwards is fine
] }, { height: 360 });
svgElement.innerHTML = RiverLayout.toSvg(R, { title: "Where the wages go" });
```
`layoutFlows(input, opts)` returns `{ nodes, bands, loops, width, height, ky, crossingWeight, ignored, ms }`:
- `nodes`: `{ id, label, x, y, w, h, layer, flow }` (the bars)
- `bands`: `{ link, value, from, to, x0, y0a, y0b, x1, y1a, y1b, xm }` (one per link per layer step; a long link has several; `link` is the index in your list)
- `loops`: backward links, drawn as bands under the picture (`link`, `value`, `d`, `w`, `pts`)
- `ignored`: how many of your links were dropped (to itself, or not above 0)

`opts`: `height` (aim for this picture height), `nodeW`, `gapLayer` (space between columns), `pad` (space between bars), `restarts` and `budgetMs` (how hard to search for a good order), `seed`, `unweighted`, `justifySinks`. `toSvg` takes `colors`, `labels`, `fontSize`, `textColor`, `bandOpacity` and `title`; all text is escaped. `fromLinks`, `layout`, `layering`, `crossWeight`, `roundPath` and `toBezier` are exported for people who want the pieces.

## What it does that is different
- **Every link is drawn,** and a band is as thick as its flow everywhere, on one scale for the whole picture.
- **Long links go through the columns in between** instead of jumping across them.
- **Order by weighted crossings:** big flows crossing big flows cost most, so the picture keeps the important flows clear.
- **Backward links are drawn** as bands under the picture. They never stop the layout.

## Numbers (Node 22, measured 2026-10-17, against d3-sankey 0.12.3)
Three made-up charts (64, 118 and 222 links). One yardstick for both: for every pair of links that cross, add their two flows multiplied together. Lower is better.

| Links | river-layout | d3-sankey | river-layout as a share of d3-sankey | time (river-layout / d3-sankey) |
|---|---|---|---|---|
| 64 | 2,147 | 4,608 | 47% | 17 ms / 5 ms |
| 118 | 10,840 | 22,131 | 49% | 25 ms / 4 ms |
| 222 | 35,454 | 61,492 | 58% | 26 ms / 7 ms |

So about half the weighted crossings, at about 4 to 5 times the time (still under 30 ms). The two tools place the columns differently, so this is one yardstick on three charts, not a proof for every chart. A chart with a loop (a to b to c to a): d3-sankey throws "circular link"; river-layout draws it (2 bands and 1 loop).

## Why
Flow charts are read by the thick bands. If the thick ones tangle, the chart is useless, so the search spends its effort there. And data from real life has loops, which must not crash the page.

## Limits
- The search is a heuristic (it restarts several times within a time budget); it finds a good order, not always the best.
- Items are placed in columns by flow direction; you cannot pin an item to a chosen column.
- No dragging or editing: it returns numbers, and `toSvg` is a simple drawing. For anything fancier draw `nodes`, `bands` and `loops` yourself.
- Measured up to 222 links (under 30 ms). Larger charts were not measured; expect the time to grow.

## Prior art
- [d3-sankey](https://github.com/d3/d3-sankey) (BSD-3-Clause, 0.12.3, 5.7 KB minified, 2.0 KB gzipped, plus d3-array and d3-shape): the standard. Smaller and faster; it throws on a loop, and its crossing order is not weighted by flow. d3-sankey-circular and similar forks add loops. Use d3-sankey if you already use D3 and your data has no loops.
- Google Charts and Plotly draw Sankey diagrams too, as part of larger libraries.

## For AI agents
Give `layoutFlows` a plain list of `{ from, to, value }`, draw with `toSvg` or from the result, and show `ignored` to the user if it is not 0. Names such as `__proto__` are rejected on purpose.
