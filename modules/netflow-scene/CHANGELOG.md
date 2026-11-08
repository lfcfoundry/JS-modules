# netflow-scene changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.10.3 · API 1 · 2026-11-07
- frame: true no longer draws a rule above the source line; the chart's own baseline is the one line.

## 1.10.1 · API 1 · 2026-11-07
- toSvg rounds numbers about 1.4 to 2.7 times faster; same SVG

## 1.10.0 · API 1 · 2026-11-06
- {topbox} note word, amount on {top}

## 1.9.0 · API 1 · 2026-11-06
- Sankey: amounts and shares beside the names (valueLabel, unit, percentOf), and notes with live numbers and a thin line to what they are about.

## 1.8.0 · API 1 · 2026-11-05
- Opt-in Economist frame: frame: true (or theme 'editorial') adds a small red tag top-left and a thin rule under the picture, with the source under it.

## 1.7.0 · API 1 · 2026-11-05
- Sankey middle-column names get a background-color halo so they read over their bands.

## 1.6.0 · API 1 · 2026-11-05
- Opt-in families: related groups (same name before ':' or '/') share one hue in steps.

## 1.5.1 · API 1 · 2026-11-05
- Labels use one shared font list (Inter, Segoe UI, Roboto, then the system font) in every chart module; pictures stay the same where those fonts match.

## 1.5.0 · API 1 · 2026-11-05
- Default group colors come in a new order so neighboring groups stay easy to tell apart for people with red-green color blindness.

## 1.4.1 · API 1 · 2026-11-01
- The light theme's red, brown and purple are a shade darker so names written on them are easier to read.

## 1.4.0 · API 1 · 2026-11-01
- Optional title block: a bold title, a lighter subtitle and a small source line around any picture, outside it so nothing moves (addTitles). Off unless asked.

## 1.3.4 · API 1 · 2026-11-01
- Building a picture with many items takes less time; pictures are the same.

## 1.3.3 · API 1 · 2026-11-01
- SVG export of dots is shorter and quicker to write (about 20% less text on dot-heavy pictures); the picture is the same.

## 1.3.2 · API 1 · 2026-10-31
- Same behavior, lighter in memory: the characters above U+00FF in the code (arrows, an ellipsis, curly quotes) are now written as escapes, so a page that bundles the file can keep its text at 1 byte per character.

## 1.3.1 · API 1 · 2026-10-26
- Big maps with plain links build their link looks once per group pair and width, a little faster in the first picture; the picture is the same.

## 1.3.0 · API 1 · 2026-10-25
- New optional file netflow-scene-index.js: on maps of 100,000+ items, box selects and picks read a sorted Z-order index (Elias-Fano): small boxes about 150x faster, picks 3 to 4x. Nothing changes under 100,000 items.

## 1.2.0 · API 1 · 2026-10-25
- Optional look-settings file: one small object says how a map is colored and set in type.

## 1.1.1 · API 1 · 2026-10-24
- Rebuilding a big map after a move keeps arrowhead work out of the per-link path, to remove a small slowdown Netflow Map saw in one browser; the picture is the same.

## 1.1.0 · API 1 · 2026-10-24
- Big maps now also keep link rules, dashes, arrowheads and bent links in fast lists, so rebuilding such a map after a move is faster; the picture is the same.

## 1.0.0 · API 1 · 2026-10-24
- New module: turns a laid-out Netflow Map into plain drawing lists for Canvas, WebGL or SVG, with fast rebuilds of big maps after a move.
