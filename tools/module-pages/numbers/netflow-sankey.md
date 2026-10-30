**Measured on a real laptop: Firefox 160, 16 cores, 2026.10.30.** Medians; lower is better for every time and size. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: netflow-sankey against d3-sankey (900 x 600, no loops, ms).

| graph | default | restarts 0 | d3-sankey | d3 / default | d3 / restarts 0 |
|---|---:|---:|---:|---:|---:|
| 72 nodes, 200 links | 5.0 | 2.0 | 2.0 | 0.40x | 1.00x |
| 200 nodes, 1500 links | 7.0 | 7.0 | 21 | 3.00x | 3.00x |
| 500 nodes, 6000 links | 18 | 21 | 100 | 5.56x | 4.76x |
Small graphs: with the crossing search on (default) we are 2.5x slower than d3; with restarts 0 we are level. From 200 nodes up we are 3x to 5.6x faster.
