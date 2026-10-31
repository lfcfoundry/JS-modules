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


**New in 0.5.2: faster parallel reads of accented text.** Cloud-browser runs (4 cores, shared machine, not noise-guarded, not the laptop). When a `parseParallel` piece holds non-ASCII text, a helper now sends it back as one decoded string with UTF-16 positions. Plain-ASCII pieces keep the 0.5.1 way, because the new way measured slower for them (0.82x in Chromium).

| 32 MB accented text, ms (lower is better) | 0.5.1 | 0.5.2 |
|---|---:|---:|
| Chromium | 1,027 | 216 (4.8x faster) |
| Firefox | 253 | 248 (even) |
| WebKitGTK | 359 | 168 (2.1x faster) |

In Firefox the total time is even, but more of the work now runs on the page's own thread: 156 ms, up from 46 ms.


**New in 0.6.0: read a picked file directly.** Cloud-browser runs (4 helpers, shared machine, not noise-guarded, not the laptop). `parseParallel(input.files[0])` now takes a File or Blob, and each helper reads its own piece straight from it, so the page never holds the whole file. Same answers as `parse()` in 384 cases per browser.

| Picked file, x faster than 0.5.2 (higher is better) | Chromium | Firefox | WebKitGTK |
|---|---:|---:|---:|
| Numbers, 45 MB | 1.11 | 1.25 | 1.68 |
| Mixed text, 32 MB | 1.17 | 1.27 | 1.75 |
| Accented text, 32 MB | 1.21 | 1.01 | 1.63 |

The page's own work falls to 17 to 142 ms, from 108 to 240 ms.
