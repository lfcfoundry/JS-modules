**Against d3-chord, cloud-browser runs.** Chord layout of a dense random matrix (400 x 400, 79,795 links), a fresh page for every library, alternating pages (7 in Chromium and Firefox, 2 in WebKitGTK), shared 4-core cloud machine. Each library gets its native input (matrix for d3-chord, links for netflow-circular, fast order). Lower is faster.

Compared: netflow-circular against d3-chord 3.0.2 (chord layout, 400 x 400 matrix, ms).

<!-- title: With typed:true netflow-circular lays out a dense 400 x 400 chord in 15 to 24 ms against 25 to 54 for d3-chord; its default output is ahead in WebKitGTK only -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| d3-chord | 29.3 | 24.8 | 54 |
| netflow-circular, default output | 38.3 | 33.6 | 40 |
| netflow-circular, typed: true | 18.7 | 15.4 | 24 |

typed: true is an opt-in setting that returns the bands as typed arrays instead of one object per band; the picture drawn is the same. With it, netflow-circular is ahead of d3-chord in all three browsers. With the default objects it is behind in Chromium and Firefox (about 1.3 times as long) and ahead in WebKitGTK. The work is not identical: d3-chord makes one ribbon per pair (79,795 chords) and netflow-circular one band per direction with drawing geometry (158,061 bands), about twice the output. netflow-circular also offers bundles, grouped arcs, drawing lists and an order search that d3-chord does not. WebKitGTK typed numbers come from 2 pages only, so treat them as direction. A 150 x 150 matrix was not re-measured.

Size: d3-chord is 1.6 KB gzipped (2.7 KB with d3-path); netflow-circular is 5.6 KB, or 18.5 KB with netflow-hierarchy that it builds on (measured at 1.4.0, not re-measured).
