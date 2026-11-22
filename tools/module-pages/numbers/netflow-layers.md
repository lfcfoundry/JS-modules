**Measured on real data: cloud Chromium 156.0.8078.79, Firefox 158.0 and WebKitGTK 2.52.6, one browser at a time, 2026.11.22.** Medians of 3 runs (ms); lower is better. The graph is the real product path graph of the retail file: a link joins two items bought one after the other in the same invoice, the 300 or 1,000 items with the most links, and the two strongest links per item (600 and 2,000 links), options `dir: "TB"` and `tagLen: 8`. Without thinning, 300 items with 27,731 real links are refused as too big for a layered drawing. This replaces the earlier generated 60 and 300 item graphs.

Compared: netflow-layers against dagre 0.8.5 on a real product path graph (ms, Chromium / Firefox / WebKitGTK).

<!-- title: netflow-layers lays out 300 real items 35 to 52 times faster than dagre -->
| graph | netflow-layers | dagre | dagre / ours |
|---|---:|---:|---:|
| 300 items, Chromium | 11.3 | 395 | 35x |
| 300 items, Firefox | 11 | 444 | 40x |
| 300 items, WebKitGTK | 15 | 773 | 52x |
| 1,000 items, Chromium | 26.4 | 3,636 | 138x |
| 1,000 items, Firefox | 23 | 4,294 | 187x |
| 1,000 items, WebKitGTK | 21 | 5,103 | 243x |

**Crossings against dagre and ELK (generated random maps; not yet confirmed on real data).** On the real retail path graph above, a plain straight-line crossing count between item centers gave 1,259 for netflow-layers against 1,269 for dagre at 300 items (level) and 17,099 against 12,593 at 1,000 items (dagre 26% fewer); that count draws the long links this module turns into stubs (`tagLen: 8`) as full lines, so it is not a like-for-like measure and the crossing claim below stays unconfirmed until a real map is compared the way each layout draws it. Random maps with no loops, row crossings with the module's default options (since 1.8.0: `deep` and `rows` left out), lower is tidier. This is the module on its own, not Netflow Map's Auto layout, which is measured separately.

Compared: netflow-layers against dagre 0.8.5 and ELK 0.12.1 (row crossings, lower is tidier).

<!-- title: netflow-layers' default options draw 4 to 12% fewer row crossings than dagre and ELK on generated random maps with no loops -->
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
