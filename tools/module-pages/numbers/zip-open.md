**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: zip-open against fflate and JSZip (400 CSV files, 2.45 MB zip, ms).

| library | ms |
|---|---:|
| zip-open expand (safe, text out) | 34 |
| fflate | 49 |
| JSZip | 66 |

zip-open also checks every checksum and size limit and refuses zip bombs; the others do the plain work.


**Version against version, real laptop, ungoogled Chromium 156 (Windows), 16 cores, 2026.10.30, 9:47 PM.** Medians; lower is better. One browser on one machine.

| work | 1.3.1 ms | 1.5.0 ms |
|---|---:|---:|
| 3,000 small text files (WebAssembly inflate in 1.5.0) | 71 | 15 |

| big zip from a File (5 CSV files, 9.0 MB) | ms |
|---|---:|
| 1.3.1 expand (whole zip in memory) | 64 |
| 1.5.0 expandBlob (File in pieces) | 82 |
| 1.5.0 expandBlob, 4 helpers | 53 |

Many small files are about 4.7x faster. For one big zip, reading a File in pieces is slower than in memory (it saves memory instead) and helpers bring it level.


**Same tests in Firefox 160 (Windows), real laptop, 16 cores, 2026.10.30, 9:41 PM.** Medians; lower is better.

| work | 1.3.1 ms | 1.5.0 ms |
|---|---:|---:|
| 3,000 small text files | 100 | 17 |

| big zip from a File (5 CSV files, 9.0 MB) | ms |
|---|---:|
| 1.3.1 expand (whole zip in memory) | 60 |
| 1.5.0 expandBlob (File in pieces) | 68 |
| 1.5.0 expandBlob, 4 helpers | 33 |

Many small files are about 5.9x faster. Reading a File in pieces is slightly slower than in memory, and with 4 helpers it takes 0.55 of the time.


**New in 1.5.1: a File of up to 16 MB opens in one read.** The code thread's cloud-browser runs (Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6 on a shared machine, not noise-guarded, not the laptop). A laptop run will replace these.

`expandBlob` on a 9 MB zip takes 0.80 to 0.93 of the earlier time, which brings it level with the in-memory open.


**New in 1.5.2: page load back to its old cost, helpers let go when idle.** The code thread's cloud-browser runs (Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6 on a shared machine, not noise-guarded, not the laptop).

The small-entry inflate is now its own 9.5 KB module, compiled only when a small entry is first opened, so the checksum module is back to 1,476 bytes. 2,000 tiny files, lower is better:

| Browser | 1.5.1 ms | 1.5.2 ms |
|---|---:|---:|
| Firefox 158 | 195 | 101 |
| Chromium 155 | 153 | 109 |
| WebKitGTK 2.52.6 | 167 | 122 |

Helpers from `expandBlob({ workers })` close 5 s after the last call (`idleMs` changes it); starting them again cost nothing measurable in all three browsers.


**New in 1.6.0: one reused buffer for text entries.** Text entries are unpacked into one shared buffer that is reused for the next entry and let go 5 s after the last one. Paired runs, time with 1.6.0 divided by 1.5.2, 12 rounds; lower is better.

| Where | Time new / old |
|---|---:|
| Laptop, Chromium 156, 16 cores, zip in memory | 0.86 to 0.98 |
| Laptop, Chromium 156, 16 cores, zip from a File | 0.91 to 1.02 |
| Laptop, Firefox 160, 16 cores (two runs) | 0.93 to 1.00 |
| Cloud, Chromium 153 | 0.82 to 0.92 |

One Firefox case was slower in one run: 400 small files from bytes took 0.94 of the time in one run and 1.15 in the other. Those timings are a few milliseconds each, so the range is wide (0.84 to 1.22). WebKitGTK was not measured for this change.


**New in 1.7.0: faster Excel sheet reading, same output.** The sheet scanner does less work per tag and decodes text only when it is needed; a test compares the new and old scanners on 40,000 random pieces. Time with 1.7.0 divided by 1.6.0, lower is better.

| Where | 6,000 rows | 60,000 rows |
|---|---:|---:|
| Laptop, Chromium 156, 16 cores | 0.77 | 0.76 (noisy) |
| Laptop, Firefox 160, 16 cores | 0.80 | 0.89 |
| Cloud, Chromium 155 | not run | 0.71 |
| Cloud, Firefox 158 | not run | 0.78 |
| Cloud, WebKitGTK 2.52.6 | not run | 0.77 |


**New in 1.8.0 and 1.9.0: Excel files read much faster, same output.** 1.8.0 adds a fast reader for the usual row shape, skips formulas instead of falling back, and reads plain shared text and whole-day dates directly. 1.9.0 reads cell attributes in place and quotes each shared text for CSV once. Workbook to CSV, cloud browsers, time new / old (lower is better):

| Sheet | 1.8.0 / 1.7.0 (Chromium 155 / Firefox 158 / WebKitGTK 2.52.6) | 1.9.0 / 1.8.0 |
|---|---|---|
| 60,000 rows | 0.33 / 0.39 / 0.38 | 0.73 / 0.79 / 0.69 |
| 6,000 rows | 0.35 / 0.41 / 0.39 | 0.76 / 0.82 / 0.76 |
| 20,000 rows with formulas | 0.33 / 0.55 / 0.42 | 0.71 / 0.81 / 0.87 |
| 30,000 rows, all text | 0.43 / 0.42 / 0.30 | 0.94 / 0.88 / 0.72 |

In the cloud, 1.8.0 and 1.9.0 together read these sheets in 0.22 to 0.45 of 1.7.0's time; on the laptop below, 0.31 to 0.55. Tried and dropped: building CSV lines directly (WebKitGTK up to 1.41 times slower) and remembering repeated dates (Firefox 1.24 to 1.60 times slower).

**zip-open 1.9.0 against 1.7.0, Excel files, real laptop, 16 cores, 2026.10.31, 6:28 PM.** Whole open including unzip; early-stop A/B, 4 rounds each; time 1.9.0 / 1.7.0, lower is better.

| Excel file | Firefox 160 | Chromium 156 |
|---|---:|---:|
| 60,000 rows | 0.41 | 0.35 |
| 6,000 rows | 0.40 | 0.37 |
| 20,000 rows with formulas | 0.39 | 0.31 |
| 30,000 rows of text | 0.45 (noisy) | 0.55 |

**New in 1.10.0: a WebAssembly Excel reader.** It reads the sheet's raw bytes straight to CSV; anything unusual still goes to the JavaScript reader. Whole open, time 1.10.0 / 1.9.0, lower is better (laptop runs 2026.10.31, 6:50 PM, early-stop A/B, 4 rounds each).

| Where | 60,000 rows | 6,000 rows | 20,000 rows with formulas | 30,000 rows of text |
|---|---:|---:|---:|---:|
| Laptop, Chromium 156, 16 cores | 0.34 | 0.42 | 0.40 | 0.41 |
| Laptop, Firefox 160, 16 cores | 0.30 | 0.30 (noisy) | 0.27 | 0.37 |
| Cloud, Chromium 155 | 0.37 | 0.34 | 0.38 | 0.36 |
| Cloud, Firefox 158 | 0.30 | 0.28 | 0.30 | 0.34 |
| Cloud, WebKitGTK 2.52.6 | 0.41 | 0.42 | 0.36 | 0.52 |

With 1.8.0 and 1.9.0, Excel files now open on the laptop in 0.11 to 0.22 of the 1.7.0 time (about 4.5 to 9.5 times as fast). Size: 21.8 KB gzipped before 1.8.0, 32.4 KB now. A big sheet still runs as one main-thread task (115 ms for 60,000 rows in Chromium 155, down from 387 ms); moving it into a helper is the next step.

**New in 1.11.0: no page freeze with helpers.** With helpers on (`workers`), an Excel file is read whole inside one helper. Longest page freeze during an open, laptop, 16 cores, 2026.10.31 (lower is better):

| Excel file | Firefox 160: 1.10.0 / 1.11.0 | Chromium 156: 1.10.0 / 1.11.0 |
|---|---:|---:|
| 200,000 rows | 119 / 6 ms | 185 / 6 ms |
| 60,000 rows | 57 / 5 ms | 52 / 6 ms |
| 30,000 rows of text | 27 / 5 ms | 29 / 6 ms |

Total time stays about the same (0.96 to 1.18 of 1.10.0).

**New in 1.12.0: a SIMD Excel reader.** Browsers with WebAssembly SIMD scan shared text 16 bytes at a time; others keep the plain reader. Whole open, time 1.12.0 / 1.11.0, cloud, lower is better: text-heavy sheets 0.87 to 0.96 in Chromium 155, Firefox 158 and WebKitGTK 2.52.6; other sheets about the same. Size: 39.7 KB gzipped (was 33.5).

**New in 1.13.0: one copy fewer.** When the file is already in memory, the biggest sheet unpacks straight into the WebAssembly reader. Whole open, time 1.13.0 / 1.12.0, cloud, lower is better: Chromium 155 0.83 to 0.92, Firefox 158 0.87 to 0.95, WebKitGTK 2.52.6 0.79 to 1.02.

**New in 1.14.0: the same inside a helper.** When workers are on, the helper that reads the workbook also unpacks the biggest sheet straight into the WebAssembly reader. Whole open with 2 helpers, time 1.14.0 / 1.13.0, cloud, lower is better: Chromium 155 0.80 to 0.95, Firefox 158 0.72 to 0.89, WebKitGTK 2.52.6 0.86 to 0.98.

**New in 1.14.2: big files on the page too.** A file over 16 MB opened without helpers is read in pieces; its biggest sheet now also unpacks straight into the WebAssembly reader. Whole open, time 1.14.2 / 1.14.1, cloud, lower is better: Chromium 155 0.89 to 0.91, Firefox 158 0.76 to 0.92, WebKitGTK 2.52.6 0.86 to 0.97.
