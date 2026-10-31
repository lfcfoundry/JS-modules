**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: walker-sim against a hand-written random walk (100,000 walkers, ms).

| way | ms |
|---|---:|
| walker-sim | 73 |
| hand-written loop | 209 |

About 2.9x faster than the plain loop, and it also keeps counts, 95% ranges and costs.
