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


**Since 1.8.0: the default is as tidy as `deep: true`.** A lighter deep search (at most 12 rounds, and it stops after 4 rounds with no gain; 1.7.0 stopped after 2) and both row choices run unless you set `deep: false` and `rows: "route"`, which keep the old picture. Same random maps as above, row crossings, lower is better:

| Items | Old default | 1.7.0 default | 1.8.0 default | `deep: true` | dagre 0.8.5 | ELK 0.12.1 |
|---|---:|---:|---:|---:|---:|---:|
| 400 | 7,950 | 5,158 | 5,103 | 5,103 | 5,374 | 5,313 |
| 1,000 | 33,763 | 21,440 | 21,166 | 21,166 | 23,965 | 22,602 |

The default draws 4 to 12% fewer crossings than dagre and ELK. On 55 maps from Netflow Map (40 imported tables, 15 random), the 1.7.0 default drew over 1% more crossings than `deep: true` on 7 of them; the 1.8.0 default on none. It costs time on big maps. Cloud browsers, best of 5, ms (lower is better):

| Browser | 400 items: 1.7.0, 1.8.0, `deep: true` | 1,000 items: 1.7.0, 1.8.0, `deep: true` |
|---|---:|---:|
| Chromium 155 | 33, 34, 44 | 73, 112, 122 |
| Firefox 158 | 32, 38, 51 | 90, 118, 119 |
| WebKitGTK 2.52.6 | 31, 36, 44 | 83, 117, 114 |

Laptop (16 cores), best of 5, ms, old default to the 1.7.0 default: Firefox 160 8.0 to 41.0 at 400 items and 19.0 to 104.0 at 1,000; Chromium 156 7.4 to 36.9 and 15.2 to 96.4. The 1.8.0 default is not yet measured on the laptop. All of these are far under dagre, which took about 0.8 s at 400 items and 7.2 s at 1,000 in the cloud.
