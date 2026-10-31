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
