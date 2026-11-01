# netflow-plot

**Version 2.3.0 · API 2**

**Tested in:** Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.

## What it is and how it works

Plain charts from a table's columns: 22 chart types, drawn as the same drawing lists a [netflow-scene](../netflow-scene/README.md) map picture uses (rects, dots, curves, polys, labels).

- `make(rows, spec, options, NetflowScene)` reads the columns named in `spec` and returns a scene.
- The scene is drawn by any netflow-scene renderer, or turned into SVG with `NetflowScene.toSvg`. Themes, palettes and export are the map's own.
- `markAt(scene, x, y)` finds the bar, dot, slice or cell under the pointer, with the rows behind it and a tooltip text.
- No page, no DOM, no dependencies beyond netflow-scene.

## Why it exists

Netflow Map's Charts tab draws these charts from a map's table of items or links, with the map's own look and export. Keeping the chart code here means the app and any other page use one tested copy.

**Where it helps**

- Charts of a map's items or links, drawn with the map's look.
- Quick charts in an offline, single-file page.
- A chart picture that exports to SVG with its own key.

**Not for:** animated or interactive chart editing; it draws one chart from one spec.

## Use

```js
// netflow-scene.js first, then netflow-plot.js
var S = NetflowPlot.make(rows, { type: 'bar', x: 'region', y: 'sales', color: 'kind' }, { theme: 'dark', width: 900, height: 560 }, NetflowScene);
svgElement.outerHTML = NetflowScene.toSvg(S, 'Sales by region');
var hit = NetflowPlot.markAt(S, x, y);   // { rows, t } or null
```

- `rows`: plain objects. A column is read from `row.attrs[key]`, then `row[key]`; pass `options.get(row, key)` to read it another way.
- `spec`: `type` (one of `NetflowPlot.TYPES`), `x`, `y`, `color`, `size`, `agg` (`sum`, `mean`, `count`, `min`, `max`, `median`), `stack` (`stack`, `group`, `normalize`, `stream`, `none`), `horizontal`, `bins`, `smooth` (moving average window), `index` (lines from 100), `cols` (parallel lines and scatter matrix), `sort` (`value`, `name`, `none`).
- `options`: `theme`, `palette`, `width`, `height`, `get`, and the optional `title`, `subtitle`, `source`, `highlight`.
- Title block (optional, off unless given): `title` (bold, top left), `subtitle` (under it) and `source` (small, under the picture), set in the `options` options. The block sits outside the picture, so nothing in the picture moves, and the SVG export draws it.
- `highlight` (optional): a series name from the `color` column (or, with no color column, one bar) keeps its color and is drawn on top; the rest turn one gray. Works on every type that colors by a column. A name that is not there changes nothing, and a highlighted name is never folded into Other.
- `NetflowPlot.NEEDS` lists which columns each type needs (a number, a category, text, or any).
- Helpers: `ticks`, `timeTicks`, `kde`, `normInv`, `voronoiCells`, `quant`, `fmtNum`.

**Chart types:** bar, line, area, scatter, connected, beeswarm, dotplot, hist, box, density, ridgeline, hexbin, heat, donut, radialbar, parallel, splom, qq, slope, marimekko, voronoi, words. A date column gives a calendar heat map.

A chart colored by a column keeps a 44 px key row at the top, so its picture and SVG carry their own key.

## Limits

- Text sizes are estimated, not measured, so very long labels are cut with an ellipsis.
- A scatter of tens of thousands of dots makes one SVG element per dot, which is slow for a page to read; see the race below.

## How it compares

Rows to an SVG on the page, each library drawing the same rows (cloud test machine, median of 7, after 2 warm-up runs). netflow-plot is `make` plus `NetflowScene.toSvg` put into the page; Observable Plot 0.6.17 builds its SVG in the page; ECharts 5.6.0 uses its SVG renderer with animation off; Vega-Lite 5.21.0 compiles and renders to SVG with Vega 5.30.0. n/a means the library has no such chart built in. Firefox and WebKitGTK time in whole milliseconds.

**2,000 rows** (ms, lower is better; Chromium / Firefox / WebKitGTK)

| Chart | netflow-plot | Observable Plot | ECharts | Vega-Lite |
|---|---|---|---|---|
| bar | 1.2 / 1 / 1 | 2.2 / 2 / 4 | 4.6 / 6 / 7 | 11.1 / 12 / 12 |
| line | 4.9 / 4 / 6 | 4.1 / 6 / 9 | 6.9 / 8 / 13 | 18 / 28 / 29 |
| scatter | 16 / 14 / 16 | 11.6 / 12 / 18 | 35.2 / 39 / 65 | 47.7 / 48 / 47 |
| hist | 1.2 / 1 / 2 | 2 / 3 / 3 | n/a | 6.9 / 12 / 12 |
| box | 1.3 / 1 / 2 | 6.9 / 6 / 9 | n/a | 13.6 / 21 / 22 |
| hexbin | 6.6 / 8 / 10 | 5.3 / 6 / 8 | n/a | n/a |
| density | 5.4 / 5 / 9 | n/a | n/a | 21.2 / 29 / 24 |

**20,000 rows** (ms, lower is better; Chromium / Firefox / WebKitGTK)

| Chart | netflow-plot | Observable Plot | ECharts | Vega-Lite |
|---|---|---|---|---|
| bar | 3.7 / 5 / 5 | 3.7 / 6 / 8 | 4.4 / 8 / 13 | 9.9 / 21 / 22 |
| line | 11 / 15 / 15 | 10 / 13 / 26 | 9.2 / 14 / 16 | 30.9 / 56 / 70 |
| scatter | 129.4 / 206 / 179 | 84.7 / 126 / 165 | 40.2 / 108 / 72 | 295.1 / 298 / 402 |
| hist | 2.2 / 3 / 4 | 7.2 / 7 / 12 | n/a | 13 / 19 / 28 |
| box | 7.2 / 5 / 9 | 45.7 / 41 / 55 | n/a | 44 / 53 / 77 |
| hexbin | 11.8 / 14 / 16 | 19.6 / 19 / 23 | n/a | n/a |
| density | 12.5 / 10 / 20 | n/a | n/a | 138.2 / 221 / 104 |

netflow-plot is the fastest of the four on bars, histograms, box plots and density charts at both sizes (at 20,000 rows it ties Observable Plot on bars in Chromium). Lines take up to 1.2 times the fastest library's time. Hexbins are the fastest at 20,000 rows and take 1.25 to 1.33 times Observable Plot's time at 2,000. Scatters are slower: at 2,000 rows up to 1.4 times Observable Plot (faster in WebKitGTK), and at 20,000 rows 1.9 to 3.2 times ECharts. Most of that time is the page reading 20,000 dots of SVG text; building the chart itself takes about 6 ms.

## For AI agents

One file, global `NetflowPlot` (also `module.exports`). Load netflow-scene first and pass it as the fourth argument. Tests: `node modules/netflow-plot/test/run.js` (314 checks: every type at 0, 1, 7 and 2,000 rows and with missing columns draws finite shapes; pointer lookup; ticks, density and the normal quantile).
