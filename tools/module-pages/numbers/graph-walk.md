**Measured on a real laptop: Firefox 160, 16 cores, 2026.10.30.** Medians; lower is better for every time and size. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: graph-walk against graphology and a hand-written walk (random directed graphs, ms).

| graph | build: graph-walk | build: arrays | build: graphology | bfs: graph-walk | bfs: hand-written | bfs: graphology | same depths |
|---|---:|---:|---:|---:|---:|---:|---:|
| 10,000 items, 40,000 links | 1.0 | 1.0 | 85 | 1.0 | 2.0 | 25 | yes |
| 100,000 items, 400,000 links | 4.0 | 59 | 1,423 | 9.0 | 16 | 543 | yes |
Version measured here: graph-walk 0.1.0.
