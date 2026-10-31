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
