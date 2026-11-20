**Against d3-hierarchy, cloud-browser runs.** Layout of 100,000 nodes from a flat parent list (id, parent, size) into 900 x 600 positioned boxes, a fresh page for every library, median of 3 passes, shared 4-core cloud machine. Both return all 100,000 nodes, and the input conversion is inside both timings. Pass-to-pass spread is 5 to 47%, so only gaps clearly bigger than that count. Lower is faster.

Compared: netflow-hierarchy against d3-hierarchy 3.1.3 (circle pack layout, ms).

<!-- title: netflow-hierarchy packs 100,000 circles in 151 to 177 ms in Firefox and WebKitGTK against 215 to 327 for d3-hierarchy -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| d3-hierarchy | 197 | 327 | 215 |
| netflow-hierarchy | 176 | 177 | 151 |

That is 46% less time in Firefox and 30% less in WebKitGTK, and about even in Chromium (inside the spread).

Compared: netflow-hierarchy against d3-hierarchy (treemap layout, ms).

<!-- title: netflow-hierarchy lays out a 100,000-node treemap about 20% faster than d3-hierarchy in Chromium and Firefox, and ties in WebKitGTK -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| d3-hierarchy | 112 | 144 | 109 |
| netflow-hierarchy | 90 | 115 | 108 |

Compared: netflow-hierarchy against d3-hierarchy (icicle layout, ms). This is where netflow-hierarchy loses.

<!-- title: On icicle layout netflow-hierarchy is 10 to 25% slower than d3-hierarchy, mostly inside the noise -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| d3-hierarchy | 84 | 100 | 93 |
| netflow-hierarchy | 105 | 113 | 113 |

Size is also a loss: d3-hierarchy is 5.8 KB gzipped (layout only), netflow-hierarchy 12.9 KB for layout only and 46.2 KB with netflow-scene when drawing. netflow-hierarchy also does five views, groups, links and drawing lists; d3-hierarchy is layout only.
