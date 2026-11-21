**Against d3-chord, cloud-browser runs.** Chord layout of a dense random matrix (400 x 400, 79,795 links), a fresh page for every library, alternating pages (7 in Chromium and Firefox, 2 in WebKitGTK; d3-chord from the same test), shared 4-core cloud machine. Each library gets its native input (matrix for d3-chord, links for netflow-circular, fast order). Lower is faster.

Compared: netflow-circular against d3-chord 3.0.2 (chord layout, 400 x 400 matrix, ms).

<!-- title: netflow-circular lays out a dense 400 x 400 chord in 14 to 23 ms against 25 to 54 for d3-chord, ahead in all three browsers -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| d3-chord | 29.3 | 24.8 | 54 |
| netflow-circular | 18 | 14.3 | 23 |

These are the default settings. The band objects (chart.flows) are made the first time they are read, and drawing with scene() does not need them; the optional typed: true setting, which returns the bands as typed arrays, takes about the same time (18.7, 15.4 and 24 ms). The work is not identical: d3-chord makes one ribbon per pair (79,795 chords) and netflow-circular one band per direction with drawing geometry (158,061 bands), about twice the output. netflow-circular also offers bundles, grouped arcs, drawing lists and an order search that d3-chord does not. The WebKitGTK number for netflow-circular is from 2 pages only, so treat it as direction. A 150 x 150 matrix was not re-measured.

Size (esbuild minified, gzip -9, measured at 1.5.2): d3-chord 3.0.1 is 1.6 KB gzipped (2.7 KB with d3-path 3.1.0); netflow-circular is 6.4 KB (it also has Bundles and the crossing search), or 20.7 KB with netflow-hierarchy that it builds on (14.3 KB).
