**Measured on a real laptop: Firefox 160, 16 cores, 2026.10.30.** Medians; lower is better for every time and size. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: text-columns against Papa Parse and d3-dsv (200,000 rows x 6 columns, 7.9 MB, ms).

| library and output | ms | time / text-columns columns |
|---|---:|---:|
| text-columns (columns out) | 84 | 1.00x |
| text-columns (row objects) | 111 | 1.32x |
| Papa Parse (rows, typed) | 314 | 3.74x |
| Papa Parse (arrays, no typing) | 145 | 1.73x |
| d3-dsv csvParseRows (arrays, text only) | 141 | 1.68x |
(d3-dsv csvParse builds its reader with new Function, forbidden by our CSP, so only its arrays reader is timed.)
