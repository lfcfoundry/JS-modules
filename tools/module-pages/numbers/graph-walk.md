**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: graph-walk against graphology and a hand-written walk (100,000 items, ms).

| way | build | bfs |
|---|---:|---:|
| graph-walk | 3.0 | 6.0 |
| hand-written arrays | 11 | 16 |
| graphology | 1,160 | 424 |


**Version against version, real laptop, ungoogled Chromium 156 (Windows), 16 cores, 2026.10.30, 9:47 PM.** Medians; lower is better. One browser on one machine.

| work (100,000 items, 400,000 links) | 0.1.0 ms | 0.7.0 ms |
|---|---:|---:|
| build | 3.8 | 3.8 |
| bfs | 16 | 14 |
| loops | 22 | 26 |

New since 0.1.0, same graph: components 2.9 ms, scc 20 ms, shortest (fewest links) 18 ms, kcore 21 ms, pagerank 6.4 ms. Betweenness on 64 sampled sources takes 350 ms with the helpers kept (the default) and 284 ms with `pool: false`, so on this laptop the plain way is faster.


**Same tests in Firefox 160 (Windows), real laptop, 16 cores, 2026.10.30, 9:41 PM.** Medians; lower is better.

| work (100,000 items, 400,000 links) | 0.1.0 ms | 0.7.0 ms |
|---|---:|---:|
| build | 5.0 | 3.0 |
| bfs | 6.0 | 7.0 |
| loops | 14 | 14 |

New since 0.1.0: components 2.0 ms, scc 14 ms, shortest (fewest links) 9.0 ms, kcore 14 ms, pagerank 5.0 ms. Betweenness on 64 sampled sources: 348 ms with the helpers kept (the default) and 284 ms with `pool: false`, so the plain way is faster here too.


**New in 0.7.1 and 0.7.2: faster betweenness with helpers.** Cloud-browser runs (shared machine, not noise-guarded, not the laptop). 0.7.1 stops a `pool: false` call from shutting kept helpers down. 0.7.2 makes `betweennessAsync` start faster on first calls and new graphs, against 0.7.1: up to 1.14x in Chromium, 1.45 to 1.9x in Firefox, 1.2 to 1.4x in WebKitGTK. Repeat calls are within noise.


**New in 0.8.0: max-flow and min-cut, closeness, triangles, communities, critical path and landmark paths.** Each job runs in plain JavaScript and WebAssembly with identical answers. Compared with other libraries or hand-written code, ms per job, median of 5 rounds, one cloud browser at a time (Chromium 155 / Firefox 158 / WebKitGTK 2.52.6); lower is better.

| Job | Compared with | Other | graph-walk JS | graph-walk wasm |
|---|---|---|---|---|
| Max-flow, layered 10k nodes | @algorithm.ts/dinic | 165 / 263 / 160 | 78 / 83 / 61 | 58 / 59 / 59 |
| Max-flow, dense 4k nodes, 100k links | @algorithm.ts/dinic | 68 / 131 / 52 | 27 / 25 / 18 | 21 / 20.5 / 16.5 |
| Closeness, 3k nodes, 12k links | graphology-metrics | 487 / 1,040 / 520 | 445 / 459 / 267 | 314 / 283 / 279 |
| Triangles, 50k nodes, 250k links | hand-written Set code | 115 / 307 / 188 | 30 / 28 / 23 | 15 / 16 / 16.5 |
| Communities (Louvain), 20k nodes | graphology-communities-louvain | 85 / 218 / 92 | 72 / 118 / 41 | 38 / 54 / 39 |
| Critical path, 100k nodes, 400k links | hand-written Kahn walk | 58 / 60 / 96 | 36 / 30 / 15 | 33 / 27 / 15 |

**100 path questions on a 200 x 200 grid:** graphology's two-way Dijkstra took 6,951 / 14,822 / 12,504 ms and ngraph.path 2,009 / 4,311 / 2,308 ms. graph-walk's `path` took 307 / 396 / 250 ms, and `landmarkPath` 50 / 64 / 41 ms after a one-time 200 to 280 ms build of 8 landmarks. Both of those are plain JavaScript.

Louvain is a heuristic, so its quality is compared instead of exact groups: modularity 0.8709 against graphology's 0.8649 to 0.8684. In WebKitGTK, closeness in wasm was 279 ms against 267 ms in JavaScript (4.5%, within noise).

**New in 0.9.0: closeness on helper threads (opt-in).** `closenessAsync` splits closeness across the kept helper threads, sharing the same helpers and graph copy as `betweennessAsync`; answers are identical. On graphs of 1,500 nodes / 6,000 links, 3,000 / 12,000 and 8,000 / 32,000, in JavaScript and wasm, the helpers take 0.26 to 0.43 of the time of `closeness` on the calling thread. That is 2.3 to 3.8 times as fast on a 4-core cloud machine in Chromium 155, Firefox 158 and WebKitGTK 2.52.6.

**New in 0.10.0: `trim()` gives memory back (opt-in).** WebAssembly memory only grows, so after a big job it stays large until the page closes. `trim()` gives it back; nothing runs unless you call it. Memory measured in Node; times in the cloud browsers (Chromium 155, Firefox 158, WebKitGTK 2.52.6):

| | Without trim | After trim |
|---|---:|---:|
| Memory after a 200,000-item, 1,000,000-link job (Node) | 50 MB | 21 MB |
| First call afterward, big graph | 8 to 9 ms | 17 to 18 ms |
| First call afterward, 20,000 items | 1 ms | 2 ms |

`trim()` itself takes 0 to 1 ms. The first call after a trim is slower because it copies the graph back in.

**New in 0.11.0: reuse the previous result's arrays (opt-in, WebAssembly only).** `components`, `kcore`, `shortest` and `pagerank` can take the previous result back and fill its arrays instead of making new ones. On repeated big calls, time new / old was 0.63 to 1.04 across Chromium 155, Firefox 158 and WebKitGTK 2.52.6 (cloud), and no case was flagged slower; the best case is about 1.6 times as fast, in Firefox. Also fixed: two helper jobs at once could hang; a job started while the kept helpers are busy now gets helpers of its own.
