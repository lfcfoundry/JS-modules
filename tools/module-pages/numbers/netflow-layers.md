**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: netflow-layers against dagre (ms).

<!-- title: netflow-layers lays out 300 items 710 times faster than dagre -->
| graph | netflow-layers | dagre | dagre / ours |
|---|---:|---:|---:|
| 60 items | 0.5 | 47 | 100x |
| 300 items | 3.0 | 2,130 | 710x |
| 1000 items | | not run | |

dagre was not run at 1000 items because it grows far faster than linearly.


**Crossings against dagre and ELK.** Random maps with no loops (Netflow Map's test data), row crossings in the default settings, lower is tidier.

Compared: netflow-layers against dagre 0.8.5 and ELK 0.12.1 (row crossings, lower is tidier).

<!-- title: netflow-layers' default draws 4 to 12% fewer row crossings than dagre and ELK on random maps -->
| way | 400 items | 1,000 items |
|---|---:|---:|
| netflow-layers | 5103 | 21166 |
| ELK | 5313 | 22602 |
| dagre | 5374 | 23965 |

Counted in Node, so the numbers do not depend on the browser. The default layout takes about 35 to 120 ms on these maps in the cloud browsers, far under dagre, which took about 0.8 s at 400 items and 7.2 s at 1,000 in the cloud.
