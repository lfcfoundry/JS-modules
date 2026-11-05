# netflow-plot developer changelog

## 2.5.0 · API 2 · 2026-11-01

### Quick
toSvg(rows, o): chart words (type, x, y, color, size, agg, stack, horizontal, bins, smooth, index, cols, sort) and drawing words (theme, width, height, title, subtitle, source, highlight, clean) in one object; with no x/y the first text co…

### Deep
toSvg(rows, o): chart words (type, x, y, color, size, agg, stack, horizontal, bins, smooth, index, cols, sort) and drawing words (theme, width, height, title, subtitle, source, highlight, clean) in one object; with no x/y the first text column and first number column (rows plain or { attrs }); NetflowScene found automatically. One-call toSvg(data, options) (owner's 11:55 AM ET 11.01 name card; CONSISTENT-SYNTAX-PROPOSAL). Old forms keep working (told apart by shape). Checked in Chromium 155, Firefox 158, WebKitGTK 2.52.6 from page scripts: all six one-call pictures drawn. Requested by the owner.

## 2.4.0 · API 2 · 2026-11-01

### Quick
Clean look as the default (owner's card 1:06 PM ET 11.01, 'Make it the default').

### Deep
Clean look as the default (owner's card 1:06 PM ET 11.01, 'Make it the default'). Bar: every bar end gets its value (stack totals above, parts inside when the number fits, % for normalize, values at the right end for horizontal bars); the number axis, its gridlines and the bold axis name go, and the axis name sits small at the top left unless a value would touch it. Falls back to the number axis when any end value would not fit beside its bar. Box: median written over each box (or beside the median line, with the middle half's ends, when the gaps allow); one calm color for every box. Calm colors (bar and box only): #1f4e79, #4f8cc9, #9cc3e6, #2a8c82, #c99a2e, #b4533c, ... (dark set lighter). Labels: crowded two-word names go on two lines before any name tilts; end names never run past the number axis or the picture edge. New option clean: false for the old look. 80 of 440 sample pictures change (every bar and box picture); the other 360 (other chart types) are byte-identical. Overlapping text across 52 changed charts: none in Chromium 155 and WebKitGTK 2.52.6; Firefox 158 flags only the two lines of a wrapped name (line boxes, letters apart). Requested by the owner.

## 2.3.0 · API 2 · 2026-11-01

### Quick
Band-axis labels (bar, box, dotplot and the like) used to tilt whenever more than about half the axis room was in use (labels > maxN/2).

### Deep
Band-axis labels (bar, box, dotplot and the like) used to tilt whenever more than about half the axis room was in use (labels > maxN/2). They now tilt only when two shown labels would really touch, measured at about 6.05 px a character at 11 px with a 6 px gap. Of 440 sample pictures (11 types x 5 category sets x light/dark x widths 400, 640, 900, 1,400), 66 changed, all from tilted to flat; the other 374 are byte-identical. Measured gap between flat labels in the 33 changed light pictures: at least 11.8 px in Chromium 155 and Firefox 158, 11.2 px in WebKitGTK 2.52.6; none touch. Tilted labels also no longer run into the axis name. Requested by the owner.

## 2.2.0 · API 2 · 2026-11-01

### Quick
options.highlight: a value of the color column (or of x on bar charts with no color column).

### Deep
options.highlight: a value of the color column (or of x on bar charts with no color column). The other series share one gray (theme muted mixed 45% toward the background); the chosen series is moved last in the shape lists so it is drawn over them; a highlighted name past the color limit keeps its own place instead of joining Other. An unknown name changes nothing.

## 2.1.0 · API 2 · 2026-11-01

### Quick
make(rows, spec, o, NS) calls NS.addTitles(S, o) last when netflow-scene 1.4.0 is loaded.

### Deep
make(rows, spec, o, NS) calls NS.addTitles(S, o) last when netflow-scene 1.4.0 is loaded. Option words follow the shared list (type, theme, width, height, title, subtitle, source, highlight).

## 2.0.0 · API 2 · 2026-11-01

### Quick
pie type removed (owner's call); donut unchanged.

### Details
TYPES, NEEDS and the drawing code lose pie; pieCore renamed donutCore and only the donut calls it; donut SVG identical to 1.0.0 (counts, sums and means, both themes). Major version because a type an existing user might pass is gone; an unknown type draws bars, as before.

### Deep
netflow-plot 2.0.0: pie chart removed (owner's call); donut kept.

## 1.0.0 · API 1 · 2026-11-01
- **Quick:** first version, cut from Netflow Map's Charts tab (src/plot.js); 23 types, 328 checks.
- **Details:** global renamed NFMPlot to NetflowPlot; characters above U+007F written as escapes; number text no longer calls toLocaleString('en-US') per mark (about 25 microseconds a call in Chromium: a 2,000 dot scatter built in 52.7 ms, now 3.2 ms; same text on 600,025 values); a date text column reads each distinct date once; a plain number string skips the cleaning step; hexbin cells keyed by one number. Same scene, SVG and marks as the Netflow Map copy on 276 charts (23 types, 6 sizes, 2 themes). Race against Observable Plot, ECharts and Vega-Lite in the README.
