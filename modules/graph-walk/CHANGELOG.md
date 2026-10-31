# graph-walk changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 0.9.0 · API 0 · 2026-10-31
- New: closenessAsync splits closeness across kept helper threads (about 3.5x faster on 4 cores in all three test browsers).

## 0.8.0 · API 0 · 2026-10-31
- New: max-flow and min-cut, closeness, triangle counts, communities (Louvain), critical path and landmark paths, in plain JavaScript and WebAssembly; 1.5x to 230x faster than graphology, ngraph and a Dinic library in all three test browsers.

## 0.7.2 · API 0 · 2026-10-31
- betweennessAsync starts faster: up to 1.9x on the first call and on a new graph.

## 0.7.1 · API 0 · 2026-10-30
- Graph centrality with helpers kept is now faster than without: a pool: false call no longer shuts the kept helpers down.

## 0.7.0 · API 0 · 2026-10-30
- Changed: betweennessAsync now keeps its helper threads by default (closing itself after 5 s idle); pool: false restores one-call helpers.

## 0.6.0 · API 0 · 2026-10-30
- New: betweennessAsync can keep its helper threads (pool: true) so repeated jobs are up to 1.75x faster; small jobs now run on the calling thread.

## 0.5.0 · API 0 · 2026-10-30
- New: betweennessAsync splits betweenness across helper threads (3.4x to 4.6x faster on 4 cores).

## 0.4.0 · API 0 · 2026-10-30
- New: k-core numbers, minimum spanning forest, PageRank and betweenness (plain JavaScript and WebAssembly); the first two-ended path call allocates less.

## 0.3.0 · API 0 · 2026-10-30
- New: WebAssembly speeds up components, strongly connected groups, topological order and weighted paths to every item (1.2x to 2.2x in Firefox and Chromium, none in WebKitGTK); plain JavaScript stays as the fallback.

## 0.2.0 · API 0 · 2026-10-30
- New: connected components, strongly connected components, topological order, weighted shortest paths and a fast two-ended path between two items; building the link index is faster.

## 0.1.0 · API 0 · 2026-10-27
- First version: breadth-first distances and depth-first loop marking over a links-of-every-item layout, same answers as Netflow Map's inline walks and no slower in three browsers.
