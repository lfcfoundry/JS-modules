**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: netflow-layers against dagre (ms).

<!-- title: netflow-layers lays out 300 items 710 times faster than dagre -->
| graph | netflow-layers | dagre | dagre / ours |
|---|---:|---:|---:|
| 60 items | 0.5 | 47 | 100x |
| 300 items | 3.0 | 2,130 | 710x |
| 1000 items | | not run | |

dagre was not run at 1000 items because it grows far faster than linearly.


**Crossings against dagre and ELK.** Random maps with no loops, row crossings with the module's default options (since 1.8.0: `deep` and `rows` left out), lower is tidier. This is the module on its own, not Netflow Map's Auto layout, which is measured separately.

Compared: netflow-layers against dagre 0.8.5 and ELK 0.12.1 (row crossings, lower is tidier).

<!-- title: netflow-layers' default options draw 4 to 12% fewer row crossings than dagre and ELK on random maps with no loops -->
| way | 400 items | 1,000 items |
|---|---:|---:|
| netflow-layers | 5103 | 21166 |
| ELK | 5313 | 22602 |
| dagre | 5374 | 23965 |

Counted in Node, so the numbers do not depend on the browser. The default layout takes about 35 to 120 ms on these maps in the cloud browsers, far under dagre, which took about 0.8 s at 400 items and 7.2 s at 1,000 in the cloud.

**Crossings against Graphviz with the opt-in sift option.** A layered test map, row crossings, lower is tidier. `sift` is off by default; without it the same map gives 4,679 and 28,035 crossings.

Compared: netflow-layers with sift: true against Graphviz (crossings, lower is tidier).

<!-- title: With the opt-in sift option, netflow-layers draws 6 to 9% fewer crossings than Graphviz on a layered test map -->
| way | 1,000 items | 3,000 items |
|---|---:|---:|
| netflow-layers, sift: true | 4222 | 24390 |
| Graphviz | 4494 | 26894 |

Layout takes 1.19 to 1.37 times as long as without sift, in the three cloud browsers (Chromium 156, Firefox 158, WebKitGTK 2.52.6).
