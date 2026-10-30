**Measured on a real laptop: Firefox 160, 16 cores, 2026.10.30.** Medians; lower is better for every time and size. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: netflow-layers against dagre (ms).

| graph | netflow-layers | dagre | dagre / ours |
|---|---:|---:|---:|
| 60 items, 120 links (loops allowed) | 2.0 | 75 | 37.50x |
| 300 items, 700 links (loops allowed) | 5.0 | 3,464 | 692.80x |
| 1000 items, 2500 links (loops allowed) | 7.0 | not run | |

dagre was not run at 1000 items because it grows far faster than linearly (3.5 s at 300 items).
