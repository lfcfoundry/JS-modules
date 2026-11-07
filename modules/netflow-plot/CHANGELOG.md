# netflow-plot changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 2.9.0 · API 2 · 2026-11-07
- toSvg(rows) picks the chart; auto() says why; opt-in takeaway

## 2.8.0 · API 2 · 2026-11-05
- Axis names read like words: sales_total shows as Sales total, and one-letter column names (r, v) are left out.

## 2.7.0 · API 2 · 2026-11-05
- Line charts follow the clean look: no number axis or gridlines, first and last values on each line.

## 2.6.0 · API 2 · 2026-11-05
- Line charts name each line at its end instead of in a key row, crowded bar names show on two rows not every other name, years print as 2015, not 2,015, and a highlight keeps the other series faint in their own colors instead of gray.

## 2.5.0 · API 2 · 2026-11-01
- One call draws a picture: NetflowPlot.toSvg(rows) makes a bar chart of the first text and number columns; chart and drawing words share one options object.

## 2.4.0 · API 2 · 2026-11-01
- Bar and box charts now show their numbers on the bars and boxes instead of a number axis and gridlines, in calmer colors; crowded two-word names wrap instead of tilting.

## 2.3.0 · API 2 · 2026-11-01
- Bar and box labels now stay flat and easy to read, and only tilt when two labels would really touch; long names wrap onto two lines, every bar gets its name when they all fit, and tilted names never sit under the axis name.

## 2.2.0 · API 2 · 2026-11-01
- Charts take an optional highlight: one series (or one bar) keeps its color and is drawn on top, the rest turn gray.

## 2.1.0 · API 2 · 2026-11-01
- Charts take an optional title, subtitle and source in their options, drawn above and below the chart and in the SVG.

## 2.0.0 · API 2 · 2026-11-01
- Removed: the pie chart type (a pie request now draws bars); donut stays.

## 1.0.0 · API 1 · 2026-11-01
- First version: 23 plain chart types from a table's columns (bars to word clouds), drawn as netflow-scene drawing lists; the charts of Netflow Map's Charts tab.
