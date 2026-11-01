# netflow-plot developer changelog

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
