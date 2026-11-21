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

Compared: netflow-hierarchy against d3-hierarchy 3.1.3 (icicle layout, 100,000 items from rows: building the tree, then layout, ms; since 1.7.1). Lower is better. Before 1.7.1 this was a loss (1.0 to 1.3 times d3's time).

<!-- title: On icicle layout netflow-hierarchy 1.7.1 takes 0.35 to 0.66 of d3-hierarchy's time at 100,000 items, ahead in all three browsers -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| d3-hierarchy | 66.2 | 99 | 84 |
| netflow-hierarchy | 43.6 | 35 | 36 |

At 1,000 items Chromium is close to even (0.26 against d3's 0.29 ms, inside the clock step); at 10,000 items netflow-hierarchy takes 0.64 to 0.80 of d3's time in all three. Without sorting on both sides, Chromium at 1,000 items is still behind d3 (0.24 against 0.20 ms).

Size is a loss: d3-hierarchy is 5.8 KB gzipped (layout only), netflow-hierarchy 12.9 KB for layout only and 46.2 KB with netflow-scene when drawing. netflow-hierarchy also does five views, groups, links and drawing lists; d3-hierarchy is layout only.
