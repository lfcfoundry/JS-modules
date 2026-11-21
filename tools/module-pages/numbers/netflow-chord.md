**Against d3-chord, cloud-browser runs.** Chord layout of a dense random matrix (400 x 400, 79,795 links), a fresh page for every library, alternating pages (7 in Chromium and Firefox, 2 in WebKitGTK; d3-chord from the same page set), the median of 15 calls per page. Layout only on both sides.

Compared: netflow-chord against d3-chord 3.0.2 (chord layout, 400 x 400 matrix, ms).

<!-- title: netflow-chord lays out a dense 400 x 400 chord in 17 to 23 ms against 27 to 62 for d3-chord, ahead in all three browsers -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| d3-chord | 31.6 | 26.7 | 62 |
| netflow-chord | 16.7 | 16.4 | 23 |

Size (esbuild minified, gzip -9, measured at 1.0.0): netflow-chord is 1.6 KB; d3-chord 3.0.1 is 1.6 KB gzipped (2.7 KB with d3-path 3.1.0). netflow-chord does no order search (netflow-circular does, at 6.4 KB, 20.7 KB with netflow-hierarchy).
