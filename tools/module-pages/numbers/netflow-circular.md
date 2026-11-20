**Against d3-chord, cloud-browser runs.** Chord layout of a dense random matrix (values 0 to 99), a fresh page for every library, median of 3 passes, shared 4-core cloud machine. Each library gets its native input (matrix for d3-chord, links for netflow-circular). Lower is faster. This is where netflow-circular loses.

Compared: netflow-circular against d3-chord 3.0.2 (chord layout, 400 x 400 matrix, ms).

<!-- title: netflow-circular loses to d3-chord on a 400 x 400 chord layout: 147 to 242 ms against 24 to 78 -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| d3-chord | 24 | 24 | 78 |
| netflow-circular (fast order) | 242 | 216 | 147 |

On a 150 x 150 matrix d3-chord takes 3, 3 and 9 ms against 22, 23 and 18 for netflow-circular. d3-chord is about 7 to 10 times faster in Chromium and Firefox and about 2 times in WebKitGTK at 400 x 400. The work is not identical: d3-chord makes one ribbon per pair (79,795 chords) and netflow-circular one band per direction with drawing geometry (158,061 bands), about twice the output. Even per output item, d3-chord is faster. The default mode, which searches the order for fewer crossings, costs no more than the fast mode (141 to 221 ms, inside the noise). netflow-circular is the choice for bundles, grouped arcs, drawing lists and order search, not for speed.

Size: d3-chord is 1.6 KB gzipped (2.7 KB with d3-path); netflow-circular is 5.6 KB, or 18.5 KB with netflow-hierarchy that it builds on.
