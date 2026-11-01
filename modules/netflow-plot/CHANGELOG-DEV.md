# netflow-plot developer changelog

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
