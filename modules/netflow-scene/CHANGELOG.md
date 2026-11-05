# netflow-scene changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

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
