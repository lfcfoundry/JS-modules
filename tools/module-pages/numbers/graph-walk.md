**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: graph-walk against graphology and a hand-written walk (100,000 items, ms).

| way | build | bfs |
|---|---:|---:|
| graph-walk | 3.0 | 6.0 |
| hand-written arrays | 11 | 16 |
| graphology | 1,160 | 424 |
