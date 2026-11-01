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


**New in 2.3.3: bars settle into place in WebAssembly.** Same pictures to the last digit. Whole layout of 1,500 items and 2,331 links, time new / old, lower is better:

| Where | New / old |
|---|---:|
| Cloud Chromium 155 | 0.86 |
| Cloud Firefox 158 | 0.96 |
| Cloud WebKitGTK 2.52.6 | 0.97 |
| Laptop Chromium 156, 16 cores | 0.74 to 0.93 |
| Laptop Firefox 160, 16 cores | 0.80 to 0.83 |

That is 3 to 26% less time. Charts under 64 bars keep the JavaScript.


**New in 2.4.0: faster big charts, same pictures.** Bars and stand-in stops now live in flat typed arrays. Output is identical to 2.3.3 on 669 maps. Laptop, 16 cores, time new / 2.3.3, lower is better:

| Items | Chromium 156 | Firefox 160 |
|---|---:|---:|
| 1,500 | 0.80 | 0.80 |
| 1,000 | 0.92 | 0.85 |
| 400 | 1.01 | 0.87 |

**New option `stopCap`, off by default.** It draws more long links straight on big maps. Node, layout time in ms and crossings (counted along link center lines), lower is better:

| Items | Default | `stopCap: 500` | d3-sankey |
|---|---|---|---|
| 1,500 | 24.4 ms, 71,093 | 3.9 ms, 60,423 | 18.9 ms, 99,058 |
| 5,000 | 93.6 ms, 1,133,257 | 15.7 ms, 462,760 | 89.6 ms, 935,756 |

In Node, d3-sankey is faster than the default at these sizes, and the default draws more crossings than d3-sankey at 5,000 items. With `stopCap: 500` this module is faster than d3-sankey and draws fewer crossings at both sizes. Browser runs of `stopCap`: not yet.
