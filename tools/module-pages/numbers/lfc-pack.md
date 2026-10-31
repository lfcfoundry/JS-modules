**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: LFC-pack against JSON.parse and gzip (300,000 web-log rows, 32.0 MB NDJSON, ms).

| form | bytes | against NDJSON |
|---|---:|---:|
| NDJSON text | 32,027,185 | 1.000 |
| gzip | 5,343,775 | 0.167 |
| LFC-pack | 1,907,954 | 0.060 |

| way | read ms |
|---|---:|
| JSON.parse (one array) | 48 |
| LFC-pack unpack (row objects) | 72 |
| gunzip + JSON.parse | 220 |

| way | write ms |
|---|---:|
| LFC-pack pack | 333 |
| gzip | 1,074 |

LFC-pack is 3.2x faster to write and 2.8x smaller than gzip, and reads 3x faster than gunzip plus JSON.parse. Reading row objects is about 1.5x slower than JSON.parse alone.


**Version against version, real laptop, ungoogled Chromium 156 (Windows), 16 cores, 2026.10.30, 9:47 PM.** Medians; lower is better. One browser on one machine.

| set | pack 0.1.9 | pack 0.2.0 | unpack 0.1.9 | unpack 0.2.0 | bytes 0.1.9 | bytes 0.2.0 |
|---|---:|---:|---:|---:|---:|---:|
| logs (22.0 MB) | 324 | 321 | 42 | 45 | 3,275,919 | 3,275,094 |
| events (10.5 MB) | 61 | 61 | 20 | 18 | 958,009 | 958,009 |
| dense (19.7 MB) | 301 | 293 | 51 | 50 | 2,412,516 | 2,421,412 |
| links (5.2 MB) | 38 | 38 | 8.7 | 8.4 | 79,083 | 79,104 |
| lists (1.7 MB) | 15 | 15 | 3.8 | 3.7 | 365,098 | 365,098 |

Packing and unpacking speed is level with 0.1.9; the same rows come back from both. Reading 100 rows from row 100,000 of the logs file takes 12 ms with `unpackRows`, against 49 ms to read everything and slice.

**The new 13 MB default block size** (against the old 21 MB), pack time in ms:

| set and helpers | pack 21 MB | pack 13 MB | size 13 / 21 |
|---|---:|---:|---:|
| logs (66 MB), 4 helpers | 393 | 445 | 0.9997 |
| logs (66 MB), 15 helpers | 418 | 318 | 0.9997 |
| dense (54 MB), 4 helpers | 417 | 283 | 0.9962 |
| dense (54 MB), 15 helpers | 416 | 295 | 0.9962 |
| events (53 MB), 4 helpers | 146 | 101 | 0.9996 |
| events (53 MB), 15 helpers | 145 | 101 | 0.9996 |

Packing is faster on five of six rows (0.68 to 0.76 of the time) and 13% slower on one; files are the same size or slightly smaller.
**Measured by the code thread in Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6 (a shared cloud machine, not the laptop). Median of 7 to 21 runs; smaller is better everywhere.**

**What is new: decimals take 40 to 85% less space, and part reads got fast.**

| File size of decimal data, flat rows (100,000 rows, bytes) | Before | Now | Change |
|---|---:|---:|---:|
| Sensor readings, 3 decimals | 257,878 | 106,089 | -59% |
| GPS latitude, 5 decimals | 185,942 | 68,141 | -63% |
| Price, 4 decimals | 310,402 | 161,698 | -48% |
| Random values, 3 decimals | 358,103 | 212,902 | -41% |

| File size of decimal data in nested rows (bytes) | Before | Now | Change |
|---|---:|---:|---:|
| Sensor rows with ids and lists (100,000 rows) | 504,211 | 106,246 | -79% |
| GeoJSON points (50,000) | 421,852 | 254,991 | -40% |
| Orders with 2-decimal prices (50,000) | 449,125 | 226,975 | -50% |
| Epoch milliseconds + random big ints (50,000) | 466,513 | 399,701 | -14% |

| Reading one column of a 200-key file, 20,000 rows (ms) | Start of this work | Now |
|---|---:|---:|
| Chromium | 15.6 | 3.3 |
| Firefox | 21 | 3 |
| WebKitGTK | 12 | 4 |

| Reading 100 rows from a 200,000-row file (ms) | unpackRows | Reading everything |
|---|---:|---:|
| Chromium | 10 | 104 |
| Firefox | 15 | 135 |
| WebKitGTK | 22 to 35 | 357 to 386 |

Whole read of 200-key rows in WebKitGTK: 1,324 ms down to 580 ms with row-by-row filling, and 628 ms down to 183 ms with the opt-in generated builder (it needs `unsafe-eval` in the page policy, so it is off by default).

**Also new:** read rows 5,000 to 5,100 without reading the rest; counts of distinct and empty values per column without decoding; checksums in WebAssembly with an optional faster XXH64 check, so reading a few columns checks only those columns; a metadata section and a one-file viewer.

**Measured and not built:** trained dictionaries (files grew) and a shared string table (under 0.1% possible).


**Same tests in Firefox 160 (Windows), real laptop, 16 cores, 2026.10.30, 9:41 PM.** Medians; lower is better.

| set | pack 0.1.9 | pack 0.2.0 | unpack 0.1.9 | unpack 0.2.0 | bytes 0.1.9 | bytes 0.2.0 |
|---|---:|---:|---:|---:|---:|---:|
| logs (22.0 MB) | 445 | 391 | 56 | see note | 3,275,919 | 3,275,094 |
| events (10.5 MB) | 68 | 66 | 25 | 18 | 958,009 | 958,009 |
| dense (19.7 MB) | 351 | 333 | 39 | 39 | 2,412,516 | 2,421,412 |
| links (5.2 MB) | 39 | 39 | 9.0 | 9.0 | 79,083 | 79,104 |
| lists (1.7 MB) | 16 | 15 | 5.0 | 6.0 | 365,098 | 365,098 |

Note: one logs unpack run read slow (86 ms); two reruns gave level results, so it was noise and is not counted. Reading 100 rows from row 100,000 of the logs file takes 12 ms with `unpackRows`, against 77 ms to read everything and slice. 13 MB blocks against 21 MB: pack time 0.71 to 0.82 on five of six rows and 1.05 on one (logs, 4 helpers); size the same or slightly smaller.
