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
