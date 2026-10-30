# graph-walk changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 0.3.0 · API 0 · 2026-10-30
- New: WebAssembly speeds up components, strongly connected groups, topological order and weighted paths to every item (1.2x to 2.2x in Firefox and Chromium, none in WebKitGTK); plain JavaScript stays as the fallback.

## 0.2.0 · API 0 · 2026-10-30
- New: connected components, strongly connected components, topological order, weighted shortest paths and a fast two-ended path between two items; building the link index is faster.

## 0.1.0 · API 0 · 2026-10-26
- First version: breadth-first distances and depth-first loop marking over link lists, same answers as Netflow Map's inline walks.

## 0.1.0 · API 0 · 2026-10-27
- First version: breadth-first distances and depth-first loop marking over a links-of-every-item layout, same answers as Netflow Map's inline walks and no slower in three browsers.
