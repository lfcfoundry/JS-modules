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


**Version against version, real laptop, ungoogled Chromium 156 (Windows), 16 cores, 2026.10.30, 9:47 PM.** Medians; lower is better. One browser on one machine.

| way (200,000 rows x 6 columns, 7.8 MB) | ms |
|---|---:|
| parse 0.1.1 | 27 |
| parse 0.5.0 | 30 |
| parseParallel 0.5.0, 4 helpers | 33 |

Same values from both. At this size the plain parse is within about 10% of 0.1.1 and `parseParallel` does not help; the parallel path is meant for much bigger files.


**Same tests in Firefox 160 (Windows), real laptop, 16 cores, 2026.10.30, 9:41 PM.** Medians; lower is better.

| way (200,000 rows x 6 columns, 7.8 MB) | ms |
|---|---:|
| parse 0.1.1 | 43 |
| parse 0.5.0 | 44 |
| parseParallel 0.5.0, 4 helpers | 44 |

Same values. Plain parse is level with 0.1.1 and `parseParallel` does not help at this size. Against other libraries in Firefox 160 (200,000 rows x 6 columns, 7.9 MB): text-columns columns 52 ms, row objects 59 ms, Papa Parse typed rows 166 ms (3.2x), Papa Parse arrays 86 ms, d3-dsv arrays 80 ms.


**New in 0.5.1:** once helpers are running, parallel reading starts at 4 MB instead of 32 MB, taking about 0.6 to 0.9 of the time on mid-size files. Smaller files stay on one thread.
