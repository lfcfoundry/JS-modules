**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: netflow-sankey against d3-sankey (ms).

| graph | netflow-sankey (default) | restarts 0 | d3-sankey | d3 / ours |
|---|---:|---:|---:|---:|
| 72 nodes | 2.0 | 0.6 | 1.0 | 0.5x (d3 is faster) |
| 200 nodes | 3.0 | | 12 | 4.0x |
| 500 nodes | 12 | | 62 | 5.2x |

On small graphs d3-sankey is faster with the default settings. The default searches for fewer crossings, about 6% fewer than with restarts 0. From 200 nodes up, netflow-sankey is 4x to 5x faster.
