**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: netflow-sankey against d3-sankey (ms).

| graph | netflow-sankey (default) | restarts 0 | d3-sankey | d3 / ours |
|---|---:|---:|---:|---:|
| 72 nodes | 2.0 | 0.6 | 1.0 | 0.5x (d3 is faster) |
| 200 nodes | 3.0 | | 12 | 4.0x |
| 500 nodes | 12 | | 62 | 5.2x |

On small graphs d3-sankey is faster with the default settings. The default searches for fewer crossings, about 6% fewer than with restarts 0. From 200 nodes up, netflow-sankey is 4x to 5x faster.


**Version against version, real laptop, ungoogled Chromium 156 (Windows), 16 cores, 2026.10.30, 9:47 PM.** Medians; lower is better. One browser on one machine.

| work | 2.3.1 ms | 2.3.2 ms |
|---|---:|---:|
| 72 items, 200 links | 3.2 | 2.1 |
| 200 items, 1500 links | 3.1 | 3.1 |
| 500 items, 6000 links | 7.6 | 7.8 |

Same order and crossings from both versions. Only the smallest graph is faster.


**Same tests in Firefox 160 (Windows), real laptop, 16 cores, 2026.10.30, 9:41 PM.** Medians; lower is better.

| work | 2.3.1 ms | 2.3.2 ms |
|---|---:|---:|
| 72 items, 200 links | 3.0 | 2.0 |
| 200 items, 1500 links | 4.0 | 4.0 |
| 500 items, 6000 links | 10 | 10 |

Against d3-sankey in Firefox 160 (ms): 72 nodes 2.0 (restarts 0: 0.5) against 1.0, so d3 is faster with the default settings there; 200 nodes 3.0 against 11 (3.7x); 500 nodes 11 against 61 (5.5x).
