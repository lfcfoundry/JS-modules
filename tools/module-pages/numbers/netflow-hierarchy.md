**Against d3-hierarchy, cloud-browser runs.** Layout of 100,000 nodes from a flat parent list (id, parent, size) into 900 x 600 positioned boxes, a fresh page for every library, median of 3 passes, shared 4-core cloud machine. Both return all 100,000 nodes, and the input conversion is inside both timings. Pass-to-pass spread is 5 to 47%, so only gaps clearly bigger than that count. The icicle chart is a later run on the same machine. Lower is faster.

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

Compared: netflow-hierarchy against d3-hierarchy 3.1.3 (icicle layout from rows, both sorting children, 100,000 items, time as a percent of d3-hierarchy's, lower is faster).

<!-- title: netflow-hierarchy lays out a 100,000-item icicle in 35 to 66% of d3-hierarchy's time, and is ahead at 1,000 and 10,000 items too -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| d3-hierarchy | 100 | 100 | 100 |
| netflow-hierarchy | 66 | 35 | 43 |

At 10,000 items netflow-hierarchy takes 80%, 50% and 64% of d3-hierarchy's time (Chromium, Firefox, WebKitGTK), and at 1,000 items 87%, 67% and 73%, so the lead grows with size. Cloud test browsers only; a laptop run is still to come. The pack and treemap rows above were measured at an earlier netflow-hierarchy version and have not been re-run against d3-hierarchy; the current version is not slower on them.

Size is also a loss (measured at an earlier version, not re-measured): d3-hierarchy is 5.8 KB gzipped (layout only), netflow-hierarchy 12.9 KB for layout only and 46.2 KB with netflow-scene when drawing. netflow-hierarchy also does five views, groups, links and drawing lists; d3-hierarchy is layout only.
