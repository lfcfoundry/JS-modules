**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: netflow-layers against dagre (ms).

| graph | netflow-layers | dagre | dagre / ours |
|---|---:|---:|---:|
| 60 items | 0.5 | 47 | 100x |
| 300 items | 3.0 | 2,130 | 710x |
| 1000 items | | not run | |

dagre was not run at 1000 items because it grows far faster than linearly.


**New in 1.6.0: a deeper crossing search, off by default.** `deep: true` with `rows: "best"`, on random maps with no loops (Netflow Map's test data). Row crossings, lower is better:

| Items | Default | deep + best | dagre 0.8.5 | ELK 0.12.1 |
|---|---:|---:|---:|---:|
| 400 | 7,950 | 5,103 | 5,374 | 5,313 |
| 1,000 | 33,763 | 21,166 | 23,965 | 22,602 |
| 1,500 | 33,117 | 27,353 | not run | not run |

That is 17 to 37% fewer crossings than the default, and 4 to 12% fewer than dagre and ELK. Time in ms, default to deep + best (lower is better):

| Browser | 400 items | 1,000 items | 1,500 items |
|---|---:|---:|---:|
| Cloud Chromium 155 | 8 to 51 | 14 to 119 | 23 to 160 |
| Cloud Firefox 158 | 9 to 52 | 21 to 121 | 70 to 183 |
| Cloud WebKitGTK 2.52.6 | 8 to 46 | 16 to 122 | 34 to 189 |
| Laptop Chromium 156, 16 cores | | 161 (deep + best) | |
| Laptop Firefox 160, 16 cores | | 186 (deep + best) | |

dagre took about 0.8 s at 400 items and 7.2 s at 1,000. With the options off, pictures and speed are unchanged.
