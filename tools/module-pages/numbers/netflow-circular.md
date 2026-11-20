**Against d3-chord, cloud-browser runs.** Chord layout of a dense random matrix (400 x 400, 79,795 links), a fresh page for every library, median of pages, shared 4-core cloud machine. Each library gets its native input (matrix for d3-chord, links for netflow-circular, fast order). Lower is faster. netflow-circular still loses in two of the three browsers.

Compared: netflow-circular against d3-chord 3.0.2 (chord layout, 400 x 400 matrix, ms).

<!-- title: netflow-circular lays out a dense 400 x 400 chord in 52 ms in WebKitGTK against 78 for d3-chord, and loses in Chromium and Firefox (48 and 56 ms against 24) -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| d3-chord | 24 | 24 | 78 |
| netflow-circular | 48 | 56 | 52 |

netflow-circular wins in WebKitGTK and is about 2 times behind d3-chord in Chromium and Firefox. The work is not identical: d3-chord makes one ribbon per pair (79,795 chords) and netflow-circular one band per direction with drawing geometry (158,061 bands), about twice the output, so per output item the two are close in Chromium and Firefox. netflow-circular also offers bundles, grouped arcs, drawing lists and an order search that d3-chord does not. A 150 x 150 matrix was not re-measured.

Size: d3-chord is 1.6 KB gzipped (2.7 KB with d3-path); netflow-circular is 5.6 KB, or 18.5 KB with netflow-hierarchy that it builds on.
