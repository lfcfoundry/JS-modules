# netflow-plot changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 2.14.8 · API 2 · 2026-11-07
- Line-end names stand in one column after the last line end.

## 2.14.7 · API 2 · 2026-11-07
- Dot plots sort by value and carry their values, clean look.

## 2.14.6 · API 2 · 2026-11-07
- Grouped charts never mix two name pairs, even names that hold the separator

## 2.14.5 · API 2 · 2026-11-07
- Line and area charts build faster; same picture

## 2.14.4 · API 2 · 2026-11-07
- Averages that sit close together show as dots, with ticks that differ.

## 2.14.3 · API 2 · 2026-11-07
- A tree picked by auto() is sized by its real measure, not by the parent numbers.

## 2.14.2 · API 2 · 2026-11-07
- One unit on a whole number axis.

## 2.14.1 · API 2 · 2026-11-07
- Line-end names 14 px apart and clear of the corner year.

## 2.14.0 · API 2 · 2026-11-07
- auto() lays bars sideways when long names would tilt.

## 2.13.0 · API 2 · 2026-11-07
- Full numbers below 100,000, tick decimals from the step, tidy key titles.

## 2.12.2 · API 2 · 2026-11-07
- Years before 1800 print as 1600, not 1,600, when the column is named year.

## 2.12.1 · API 2 · 2026-11-07
- The takeaway sentence writes percents like the chart.

## 2.12.0 · API 2 · 2026-11-07
- Bars and boxes now use the same mauve colors as every other chart (navy and red stay for bars below zero); the Others bar is light gray; busy line charts name each line.

## 2.11.0 · API 2 · 2026-11-07
- Auto bar charts with more than 25 names show the 10 biggest plus one bar for the rest, sideways; fractions between 0 and 1 are written as percents.

## 2.10.1 · API 2 · 2026-11-07
- A bar chart given the number as x and the names as y now draws sideways bars instead of an empty chart.

## 2.10.0 · API 2 · 2026-11-07
- Busy flow tables where places both send and receive draw as a chord; small ones stay Sankeys.
- Line labels no longer collide and share one precision; date axes get round ticks and no redundant name.
- A scatter squashed by a few far values says so; the key's +N more no longer covers a name.

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
