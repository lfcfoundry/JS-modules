**Measured on a real laptop: Firefox 160, 16 cores, 2026.10.30.** Medians; lower is better for every time and size. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: walker-sim against a hand-written random walk (100,000 walkers over 299 items).

| way | ms | walks per second |
|---|---:|---:|
| walker-sim | 134 | 746,269 |
| hand-written loop | 324 | 308,642 |

2.4x faster than the plain loop, and it also keeps counts, 95% ranges and costs.
