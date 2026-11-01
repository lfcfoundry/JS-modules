**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: netflow-layers against dagre (ms).

| graph | netflow-layers | dagre | dagre / ours |
|---|---:|---:|---:|
| 60 items | 0.5 | 47 | 100x |
| 300 items | 3.0 | 2,130 | 710x |
| 1000 items | | not run | |

dagre was not run at 1000 items because it grows far faster than linearly.


**New in 1.6.0: a deeper crossing search, off by default.** `deep: true` with `rows: "best"`, on random maps with no loops (Netflow Map's test data). Row crossings, lower is better:

| Items | Default in 1.6.0 | deep + best | dagre 0.8.5 | ELK 0.12.1 |
|---|---:|---:|---:|---:|
| 400 | 7,950 | 5,103 | 5,374 | 5,313 |
| 1,000 | 33,763 | 21,166 | 23,965 | 22,602 |
| 1,500 | 33,117 | 27,353 | not run | not run |

That is 17 to 37% fewer crossings than the default, and 4 to 12% fewer than dagre and ELK. Time in ms, 1.6.0 default to deep + best (lower is better):

| Browser | 400 items | 1,000 items | 1,500 items |
|---|---:|---:|---:|
| Cloud Chromium 155 | 8 to 51 | 14 to 119 | 23 to 160 |
| Cloud Firefox 158 | 9 to 52 | 21 to 121 | 70 to 183 |
| Cloud WebKitGTK 2.52.6 | 8 to 46 | 16 to 122 | 34 to 189 |
| Laptop Chromium 156, 16 cores | | 161 (deep + best) | |
| Laptop Firefox 160, 16 cores | | 186 (deep + best) | |

dagre took about 0.8 s at 400 items and 7.2 s at 1,000. With the options off, pictures and speed are unchanged.


**New in 1.7.0: fewer crossings by default.** A lighter deep search (at most 12 rounds) and both row choices now run unless you set `deep: false` and `rows: "route"`, which keep the old picture. Same random maps as above, row crossings, lower is better:

| Items | Old default | New default | `deep: true` | dagre 0.8.5 | ELK 0.12.1 |
|---|---:|---:|---:|---:|---:|
| 400 | 7,950 | 5,158 | 5,103 | 5,374 | 5,313 |
| 1,000 | 33,763 | 21,440 | 21,166 | 23,965 | 22,602 |

The new default draws 3 to 11% fewer crossings than dagre and ELK. It costs time on big maps. Cloud browsers, best of 5, ms, old default to new (lower is better):

| Browser | 400 items | 1,000 items |
|---|---:|---:|
| Chromium 155 | 4.3 to 31 | 17 to 80 |
| Firefox 158 | 7 to 40 | 39 to 83 |
| WebKitGTK 2.52.6 | 5 to 31 | 11 to 77 |

Laptop (16 cores), best of 5, ms, old default to new: Firefox 160 8.0 to 41.0 at 400 items and 19.0 to 104.0 at 1,000; Chromium 156 7.4 to 36.9 and 15.2 to 96.4. That is 5 to 6 times as long as the old picture, still far under dagre, which took about 0.8 s at 400 items and 7.2 s at 1,000 in the cloud.
