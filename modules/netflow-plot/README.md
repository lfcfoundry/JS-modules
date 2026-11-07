# netflow-plot

**Version 2.10.0 · API 2**

**Tested in:** Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6 (the same SVG as Node for 12 public tables)

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.

## What it is and how it works

Plain charts from a table's columns: 22 chart types, drawn as the same drawing lists a [netflow-scene](../netflow-scene/README.md) map picture uses (rects, dots, curves, polys, labels).

- `make(rows, spec, options, NetflowScene)` reads the columns named in `spec` and returns a scene.
- One call draws a picture: `NetflowPlot.toSvg(rows)` returns SVG text (see Use). To draw it yourself, the scene works with any netflow-scene renderer or `NetflowScene.toSvg`. Themes, palettes and export are the map's own.
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

Load `netflow-scene.js` first, then `netflow-plot.js`. One call, data only (since 2.9.0 the chart is picked from the shape of the rows; see below):

```js
// netflow-scene.js, then netflow-plot.js
svgElement.outerHTML = NetflowPlot.toSvg([{ city: 'Detroit', share: 12 }, { city: 'Chicago', share: 16 }]);
svgElement.outerHTML = NetflowPlot.toSvg(rows, { type: 'line', x: 'day', y: 'sales', color: 'region', title: 'Sales' });
```

Name your own columns in the same options: `{ type: 'bar', x: 'Region', y: 'Sales', color: 'Channel' }` (rows straight from a CSV work; numbers written as text are read as numbers). `toSvg` returns SVG text (a string): put it in the page with `element.outerHTML = ...` or save it as a `.svg` file. `title` is optional: it draws a bold title above the picture and names the picture for screen readers; leave it out for none.

### The chart picked for you (since 2.9.0)

With no `type`, `x` or `y`, `toSvg(rows)` looks at the columns and picks the chart a person would most likely pick:

- `from` and `to` columns: a Sankey (needs netflow-sankey.js; the 40 biggest links). When there are more than 40 links and most places both send and receive (flights between airports), a chord of the 40 biggest links instead, with the Sankey as the next pick (needs netflow-hierarchy.js and netflow-circular.js; since 2.10.0). `type: 'chord'` with `from`, `to` and `value` asks for one.
- A `parent` column: a treemap (needs netflow-hierarchy.js).
- Latitude and longitude: a scatter.
- A time column (dates, or a whole-number year column) with one value per time step: a line, one per group. When a value that adds up repeats per time step: the total per step.
- Two number columns: a scatter, colored by a small group column.
- One number and names: a bar.
- One number alone: a histogram.
- No numbers: the rows counted per group.

Month names (Jan, Feb) stay in order as categories. Columns named like `id`, `zip` or `code` are never read as values.

`NetflowPlot.auto(rows, options)` draws the same pick and also says why. It returns `{ svg, type, spec, why, others, takeaway, alt }`:

- `why` is a plain sentence, such as `it has a time column "date" with one "price" per time step for each "symbol"`.
- `others` holds up to three more good picks, each with its own `why`. A one-click change is `NetflowPlot.toSvg(rows, result.others[0].spec)`.
- `NetflowPlot.guess(rows)` gives the pick without drawing it.
- A scatter where nearly every point sits on one thin line, because a few values are far out, says so in `why` (since 2.10.0).

We checked it on 54 real public tables (vega-datasets). It picked a chart a person would accept for 39 of 39 tables used to set the rules. It also did so for 15 of 15 held-out tables that were labeled before the rules ran on them. The research prototype got 20 of 39 and 10 of 15. In 2.10.0 the three flight tables were relabeled to also accept a chord, after a visual review found their Sankeys a tangle.

### Tidier labels (since 2.10.0)

- A line's first value stays beside its line. One that would touch another is left out, and lines that start later get none.
- Values on a line chart share one precision: -0.1, 4.3 and -10.8, not -0.079, 4.31 and -10.8; 10M next to 144M, not 9.7M.
- Number and date axes use fewer, rounder ticks when labels would touch (2005, 2010; Jan 1855, Jul). The first month label carries its year. A date or year axis has no "Date" or "Year" name under it.
- The key row's "+N more" never sits on the last name.

On the 53 public tables of the contact sheet, touching label pairs went from 295 to 13 (measured with the browser's own text boxes in Chromium; most of the 13 are tilted labels, whose boxes the count reads unturned).

### Takeaway and screen-reader text (since 2.9.0, opt-in)

`NetflowPlot.takeaway(rows, spec)` returns `{ text, alt }`. `text` is one plain sentence worked out from the rows, such as "West leads sales total with 1,227, 14% more than East (1,080)". `alt` lists the values for a screen reader. `auto()` returns both as `takeaway` and `alt`.

`title: 'auto'` draws the takeaway as the title. Nothing changes unless a call asks for it.

Because the numbers come from the rows, the sentence cannot claim what the data does not show:

- Ties, negatives, zeros and missing values are handled.
- A percent is given only on a base above zero that is at least a tenth of the bigger value. Otherwise the sentence says "3 times as much as" or gives both values.
- Column names read as words ("sales_total" reads "sales total").
- The wording is English only.

The steps below keep the scene, for pointing at marks.

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
- Clean look (on by default): bar and box charts write their values on the bars (and inside stacked parts that have room) and the median over each box, with no number axis or gridlines, in a calm blue-first color set. When the values would not fit, the number axis comes back on its own. Line charts (since 2.7.0) have no number axis or gridlines either: each line's first value sits at its left end and its last value after its name at the right end; a single line also gets its high and low. `clean: false` keeps the number axis and gridlines.
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
