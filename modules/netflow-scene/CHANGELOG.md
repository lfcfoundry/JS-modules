# netflow-scene changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-25
- Optional look-settings file: one small object says how a map is colored and set in type.

## 1.1.1 · API 1 · 2026-10-24
- Rebuilding a big map after a move keeps arrowhead work out of the per-link path, to remove a small slowdown Netflow Map saw in one browser; the picture is the same.

## 1.1.0 · API 1 · 2026-10-24
- Big maps now also keep link rules, dashes, arrowheads and bent links in fast lists, so rebuilding such a map after a move is faster; the picture is the same.

## 1.0.0 · API 1 · 2026-10-24
- New module: turns a laid-out Netflow Map into plain drawing lists for Canvas, WebGL or SVG, with fast rebuilds of big maps after a move.
