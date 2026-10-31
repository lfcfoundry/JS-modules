**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM and 8:50 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: text-columns against Papa Parse and d3-dsv (200,000 rows x 6 columns, 7.9 MB, ms).

| library and output | ms |
|---|---:|
| text-columns (columns out) | 46 |
| text-columns (row objects) | 64 |
| Papa Parse (rows, typed) | 158 |
| d3-dsv csvParseRows (arrays, text only) | 82 |

Papa Parse with typed rows takes 3.4x as long as text-columns columns. d3-dsv csvParse builds its reader with `new Function`, which a strict content security policy forbids, so only its arrays reader is timed.

**WebAssembly line scan.** On the same 200,000 rows the WebAssembly scan takes 52 ms against 122 ms for plain JavaScript.
