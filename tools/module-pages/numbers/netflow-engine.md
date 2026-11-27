**New in 2.7.0: Force wins the picture score on real maps.** Stress (lower is better) on the real SBA and SEC maps, where 2.6.5 lost to Cytoscape and d3-force. Ungoogled Chromium 156, Firefox 158, WebKitGTK 2.52.6:

| Map | Items | 2.6.5 | 2.7.0 | Best rival |
|---|---:|---:|---:|---:|
| SBA | 300 | 0.162 | 0.146 to 0.148 | Cytoscape 0.144 to 0.148 |
| SBA | 922 | 0.184 | 0.165 to 0.167 | Cytoscape 0.170 |
| SEC | 300 | 0.230 to 0.252 | 0.187 | d3-force 0.217 |
| SEC | 1,000 | 0.184 to 0.191 | 0.174 | d3-force 0.186 |

Dense maps lay out 1.7x to 2.9x faster; other maps are level. The 300-item SBA map is a tie with Cytoscape, whose score varies by run. Details and limits are in the README.

**New in 2.2.3: number labels made in a fraction of the time.** `fmt` and `fmtFull` now reuse one number formatter each instead of setting one up on every call; the text is the same. 20,000 calls, cloud browsers (not the laptop), ms, lower is better:

| Browser | 2.2.2 | 2.2.3 | New / old |
|---|---:|---:|---:|
| Chromium 153 | 928 | 44 | 0.039 |
| Firefox 158 | 368 | 14 | 0.047 |
| WebKitGTK 2.52.6 | 1,193 | 23 | 0.023 |

Other parts of the engine have not been measured on this page yet.
