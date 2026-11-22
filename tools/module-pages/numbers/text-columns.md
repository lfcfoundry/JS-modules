**Measured on real files: cloud Chromium 156.0.8078.79, Firefox 158.0 and WebKitGTK 2.52.6, one browser at a time, 2026.11.22.** Medians of 5 runs inside a fresh page; lower is better. The files are the first 8 MB of three real tables: the retail e-commerce file (95,607 rows, 8 columns, Latin-1), the SEC 2026 Q1 numbers file (54,712 rows, 9 columns, tab separated) and the SBA assistance file (3,206 rows, 116 columns, mostly text). Papa Parse is given the decoded text with a header and typed values. This replaces the earlier generated 200,000-row table; d3-dsv was not re-run on real files.

Compared: text-columns against Papa Parse on real files (ms).

<!-- title: text-columns reads real CSV files 0.9 to 4.9 times as fast as Papa Parse with typed rows, and loses in Firefox on a 116-column text file -->
| real file and browser | text-columns ms | Papa Parse ms |
|---|---:|---:|
| Retail, Chromium | 165 | 261 |
| Retail, Firefox | 107 | 206 |
| Retail, WebKitGTK | 141 | 145 |
| SEC, Chromium | 29 | 143 |
| SEC, Firefox | 68 | 125 |
| SEC, WebKitGTK | 32 | 118 |
| SBA, Chromium | 74 | 113 |
| SBA, Firefox | 80 | 75 |
| SBA, WebKitGTK | 75 | 93 |

Ratios (Papa Parse time / text-columns time): retail 1.58 / 1.93 / 1.03, SEC 4.86 / 1.84 / 3.69, SBA 1.54 / 0.94 / 1.24 in Chromium / Firefox / WebKitGTK. Numeric tables gain most; a wide text-heavy table is close to level, and Firefox is slower than Papa Parse on it (0.94). Harness and raw results: `tools/real-corpus` and the project folder `js-modules-research/audit-synthetic-claims-2026.11.22`.

**WebAssembly line scan (generated rows, not re-measured on real files).** On 200,000 generated rows the WebAssembly scan takes 52 ms against 122 ms for plain JavaScript.


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

Same values. Plain parse is level with 0.1.1 and `parseParallel` does not help at this size.


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


**New in 0.6.1: helpers join the number columns.** Cloud-browser runs (shared machine, not noise-guarded, not the laptop). Against 0.6.0 with a picked file: Chromium 1.17 to 1.41x faster (the page pause on a 45 MB number file drops from 42 to 7 ms), Firefox 0.97 to 1.17x (pause 37 to 8 ms), WebKitGTK 0.94 to 0.99x (slightly slower).


**New in 0.6.2: much less memory after big files.** Cloud-browser runs (shared machine, not the laptop). 4 MB windows are on by default. After a 45 MB file, memory falls from 161 to 10.5 MB on the page and from 120 to 45 MB in the helpers, with times within noise. The longest page stall drops from 42 to 209 ms down to 14 to 23 ms. `idleTrim()` is opt-in.


**New in 0.6.3: repeated text kept once.** Cloud-browser runs (shared machine, not the laptop). After a parse, repeated text values are merged in idle time. Memory kept for a 16 MB file in Chromium drops from 29.4 to 10.9 MB with repeating columns, and from 25.6 to 15.0 MB with one mostly unique column (42 to 63% less). Parse speed is unchanged in all three browsers. The merge finishes 35 to 163 ms after the parse in Firefox and WebKitGTK, and within about a second of idle time in Chromium.

**New in 0.6.4: number arrays ready for the next big parse.** After a big parse, the page prepares the next parse's number arrays in idle time and holds them for 4 s; `opts.spare: false` turns it off. Same results. Repeat parse, time new / old, lower is better.

| Case | Laptop Chromium 156 | Laptop Firefox 160 | Cloud Chromium | Cloud Firefox | Cloud WebKitGTK |
|---|---:|---:|---:|---:|---:|
| 45 MB parse | 0.99 | 0.95 | 0.89 | 0.84 | 0.91 |
| 45 MB with helpers | 0.92 | 0.84 | 0.94 | 0.91 | 0.82 |

Small files get no spare arrays: a 5 MB parse took 12 ms before and after on the laptop in both browsers.
