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

**What is new in 0.2.0: part reads got fast.**

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

Whole read of 200-key rows in WebKitGTK: 1,324 ms down to 580 ms with row-by-row filling..

**Also new:** read rows 5,000 to 5,100 without reading the rest; counts of distinct and empty values per column without decoding; a metadata section.



**Same tests in Firefox 160 (Windows), real laptop, 16 cores, 2026.10.30, 9:41 PM.** Medians; lower is better.

| set | pack 0.1.9 | pack 0.2.0 | unpack 0.1.9 | unpack 0.2.0 | bytes 0.1.9 | bytes 0.2.0 |
|---|---:|---:|---:|---:|---:|---:|
| logs (22.0 MB) | 445 | 391 | 56 | see note | 3,275,919 | 3,275,094 |
| events (10.5 MB) | 68 | 66 | 25 | 18 | 958,009 | 958,009 |
| dense (19.7 MB) | 351 | 333 | 39 | 39 | 2,412,516 | 2,421,412 |
| links (5.2 MB) | 39 | 39 | 9.0 | 9.0 | 79,083 | 79,104 |
| lists (1.7 MB) | 16 | 15 | 5.0 | 6.0 | 365,098 | 365,098 |

Note: one logs unpack run read slow (86 ms); two reruns gave level results, so it was noise and is not counted. Reading 100 rows from row 100,000 of the logs file takes 12 ms with `unpackRows`, against 77 ms to read everything and slice. 13 MB blocks against 21 MB: pack time 0.71 to 0.82 on five of six rows and 1.05 on one (logs, 4 helpers); size the same or slightly smaller.


**New in 0.2.1: text-heavy files come out smaller.** The code thread's cloud-browser runs (Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6 on a shared machine, not noise-guarded, not the laptop). A laptop run will replace these.

| data | smaller by |
|---|---:|
| web logs | 3.4% |
| FHIR records | 1.0% |
| dense records | 1.0% |
| events | 0.4% |

Nothing came out larger, and pack time is within noise. Older readers open the files as before.


**New in 0.3.0: decimals take 40 to 85% less space.** Cloud runs in Node and three browsers (not the laptop). Files that use the new columns need a 0.3.0 reader.

| File size of decimal data, flat rows (100,000 rows, bytes) | Before | Now | Change |
|---|---:|---:|---:|
| Sensor readings, 3 decimals | 257,878 | 106,089 | -59% |
| GPS latitude, 5 decimals | 185,942 | 68,141 | -63% |
| Price, 4 decimals | 310,402 | 161,698 | -48% |
| Random values, 3 decimals | 358,103 | 212,902 | -41% |

| File size of decimal data in nested rows (bytes) | Before | Now | Change |
|---|---:|---:|---:|
| Sensor rows with ids and lists (100,000 rows) | 504,211 | 106,246 | -79% |
| GeoJSON points (50,000) | 421,852 | 146,499 | -65% |
| Orders with 2-decimal prices (50,000) | 449,125 | 226,975 | -50% |
| Epoch milliseconds + random big ints (50,000) | 466,513 | 399,701 | -14% |

Size as a share of 0.1.9 (Node, cloud, lower is better): map lines (GeoJSON-like) 0.30, prices and rates 0.78, web logs 1.00, dense records 1.03. Pack and unpack times are within noise. Row ranges, column stats, metadata and hash are also new in this release. Measured and not built: trained dictionaries (files grew) and a shared string table (under 0.1% possible).

**New in 0.3.1: decimal columns decode in one pass.** Cloud-browser run (shared machine, not the laptop): unpacking the map-lines file takes 70 ms in Chromium, 69 ms in Firefox and 31 ms in WebKitGTK, faster than 0.2.1 in all three.

**New in 0.3.2: packing in small blocks is several times faster.** Cloud-browser runs (shared machine, not the laptop). The string and shape tables are now cleared only as far as each block used them. Files are byte-identical, and default 13 MB blocks are unchanged.

| Pack time, ms, before / after (lower is better) | geo, 32 KB blocks | geo, 256 KB blocks | orders, 32 KB blocks |
|---|---:|---:|---:|
| Chromium | 1,452 / 415 | 391 / 204 | 2,572 / 1,098 |
| Firefox | 1,506 / 413 | 408 / 249 | 2,658 / 897 |
| WebKitGTK | 1,700 / 432 | 397 / 235 | 2,762 / 881 |

**New in 0.4.0: smaller nested files, fast small reads, and memory given back.** Cloud-browser runs (shared machine, not noise-guarded, not the laptop).

- **Per-path strings, on by default:** nested files are 5 to 14% smaller (`paths: false` turns it off; older readers refuse these blocks).
- **`share: true`** keeps one string and shape table for the whole file: 100,000 GeoJSON points are 17% smaller at 32 KB blocks and 12% smaller at 256 KB, and whole reads are 10 to 33% faster at those sizes.
- **`access: 'random'`** (256 KB blocks plus share): reading 100 rows is 20 to 60x faster than with default blocks, with files about the size of today's defaults.
- **Memory:** `trim()` gives back 80 to 90 MB after a 66.6 MB job, and idle `packParallel` helpers give back 200 MB to 1.1 GB.
- **Packing:** number-heavy files pack 3 to 25% faster with the same bytes (one Firefox round was slower, 359 to 384 ms), on top of 0.3.2's small-block gains.
- **Stricter reader:** damaged files are refused the same way by the JavaScript, Python and Go readers (four new checks in the layout spec, plus invalid UTF-8 in JavaScript). Files from the writers are unchanged.

**Wide whole reads (fix shipped in 0.3.0).** Reading every column of a 200-key, 20,000-row file, 0.2.0 vs the branch that became 0.3.0 and 0.4.0. Cloud-browser runs (shared machine, not the laptop).

| Browser | 0.2.0 | After the fix | Change |
|---|---:|---:|---:|
| WebKitGTK | 1,122 ms | 590 ms | 47% less time |
| Firefox 158 | 552 ms | 289 ms | 48% less time |
| Chromium 155 | 657 ms | 598 ms | 9% less time |

At 50 keys the difference is within noise.

**Against Parquet on 260 MB of real FHIR records (0.4.0, measured 2026.10.31).** Cloud browsers on a shared 4-core machine, medians; lower is better. Parquet was written natively by pyarrow 26 after a DuckDB 2.0 read of the same JSON (zstd level 3, 4 threads): 7,443 ms and 18,739,427 bytes.

| | Chromium 153 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| pack, one thread (ms) | 2,133 | 2,686 | 2,203 |
| packParallel, 4 helpers (ms; wide spread) | 1,562 | 1,080 | 1,169 |
| unpack (ms) | 1,049 | 1,280 | 1,013 |
| JSON.parse line by line (ms) | 1,314 | 1,621 | 1,450 |

The file is 8,323,554 bytes, 44% of Parquet's size, but 18% larger than the 7,026,554 bytes an early version (about 0.1.7) made on 2026.10.27, likely because later versions pick faster compression settings. Pack time against Parquet: 2.8 to 3.5 times as fast on one thread, 4.8 to 6.9 times with 4 helpers.

**New in 0.4.1: faster row-shape lookup, same files byte for byte.** Pack time with 0.4.1 divided by 0.4.0, lower is better; 100,000 rows of orders and of GeoJSON points, at default and 256 KB blocks.

| Where | Pack time new / old |
|---|---:|
| Laptop, Chromium 156, 16 cores | 0.79 to 0.94 |
| Laptop, Firefox 160, 16 cores (two runs) | 0.81 to 0.93 |
| Cloud, Chromium 155 | 0.73 to 0.83 |
| Cloud, Firefox 158 | 0.71 to 0.87 |
| Cloud, WebKitGTK 2.52.6 | 0.91 to 1.01 (within noise) |
| Real FHIR 260 MB, cloud Chromium 153 / Firefox 158 / WebKitGTK | 0.96 / 0.93 / 0.99 |

The Parquet comparison above was measured on 0.4.0, before this change.

**New in 0.4.2: the first pack after `trim()` keeps its speed.** `trim()` now keeps the packer's warmed-up code instead of rebuilding it. First pack of 66.6 MB after 3.7 s idle, time after a trim divided by time with no trim (lower is better; 1.00 means a trim costs nothing):

| Laptop, 16 cores | 0.4.1 | 0.4.2 |
|---|---:|---:|
| Chromium 156 | 1.04 | 0.98 |
| Firefox 160 | 1.02 | 1.02 |

Files are the same byte for byte.

**New in 0.4.3: the packer gives its memory back after 30 s without packing.** About 38 MB comes back after a 66.6 MB pack, and up to about 250 MB with big blocks; the reader's memory is kept. Same files byte for byte. First pack after an idle trim, divided by no trim (lower is better; 1.00 means the trim costs nothing):

| Where | After / no trim |
|---|---:|
| Laptop, Chromium 156, 16 cores | 0.98 |
| Laptop, Firefox 160, 16 cores | 1.02 |
| Cloud, WebKitGTK 2.52.6 | 1.06 (inconclusive, range 1.00 to 1.13) |

**New in 0.4.4: each shape's string paths are worked out once.** Files with many row shapes, like FHIR, pack faster; files are byte-identical. Cloud browsers on a shared 4-core machine, time new / old, lower is better.

| Case | Chromium 153 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| FHIR 260 MB, one thread | 0.86 | 0.85 | 0.90 |
| FHIR 260 MB, 4 helpers | 0.92 | 0.91 | 0.92 |
| orders x5, one thread | 0.94 | 1.01 | 1.01 |
| GeoJSON, 256 KB blocks | 0.93 | 0.99 | 0.98 |

Files with few shapes, like orders and GeoJSON, are about the same. The WebKitGTK GeoJSON case was checked again because one of its runs read slower (1.13). Its later runs read 0.985 and 0.978, and a run comparing the same build with itself swung to 0.87, so that one slow reading was noise.

**New in 0.4.5: packParallel helpers keep their memory between calls.** Helpers now keep their packing memory until they close, 3 s after the last call, instead of giving it back after every call. A call made within those 3 s no longer has to grow it again. 48 MB of Synthea FHIR, 2 helpers, cloud browsers (not the laptop), time new / old, lower is better:

| Browser | New / old |
|---|---:|
| Chromium 153 | 0.85 |
| Firefox 158 | 0.75 |
| WebKitGTK 2.52.6 | 0.93 |

That is 7 to 25% faster when packParallel is called again within 3 s. Idle helpers hold that memory up to 3 s longer. Same files byte for byte.

**New in 0.4.6: each block picks its string layout.** A big nested block keeps strings per path unless the text it would store twice is over 11% of the block's text. This was opt-in as `paths: 'auto'` and is now the default. Files with many paths, like FHIR, get smaller and read faster; orders, GeoJSON and other data are byte for byte the same.

| Real FHIR records | 0.4.5 | 0.4.6 |
|---|---:|---:|
| 260 MB file, bytes | 8,323,554 | 7,304,811 (12% smaller) |
| 48 MB file, bytes | 1,606,003 | 1,505,314 (6% smaller) |

Reading the 260 MB file, time new / old (cloud, lower is better): Chromium 153 0.87, Firefox 158 0.86, WebKitGTK 2.52.6 0.78, so 13 to 22% faster. Packing is within noise of 0.4.5 on the laptop (16 cores): Firefox 160 0.98 to 1.04, Chromium 156 1.01 to 1.03.

**New in 0.4.8: opening a file reuses one buffer.** Each unpacked piece used to be copied into fresh memory (145 copies, 10.9 MB, for each open of a 48 MB FHIR file). Reads now put them in one kept buffer (3.7 MB for that file), held 4 s after the last read and freed by trim(). Same files byte for byte. Open time, new / old, lower is better:

| Data | Laptop Chromium 156 (two runs) | Laptop Firefox 160 | Cloud WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| Real FHIR records, 48 MB | 0.94 and 1.00 | 0.90 | 0.87 |
| Logs | 0.94 and 0.98 | 1.00 (inconclusive) | 0.87 |
| Events | 0.99 and 0.97 (noisy) | 1.00 | 1.00 |

That is up to 14% less time; events are about the same. Laptop has 16 cores.

**New in 0.4.9: a simpler decimal reader, and less scratch memory when packing.** Rows and files are the same byte for byte. Each pack uses 2.5 MB less scratch memory to group numbers. Laptop (16 cores), time new / old, lower is better:

| Data | Open, Firefox 160 | Open, Chromium 156 | Pack, Firefox 160 | Pack, Chromium 156 |
|---|---:|---:|---:|---:|
| Geo (map coordinates) | 0.92 | 1.00 | 0.98 | 1.00 |
| Sensor readings | 0.95 | 1.01 | 1.05 (inconclusive) | 1.01 |
| Orders | 1.05 (inconclusive) | 1.09 (inconclusive, noisy) | 1.03 (inconclusive) | 0.99 |

Firefox opens decimal lists 5 to 8% faster; the other cells are within noise.

**New in 0.4.10: the fast writer takes numbers with up to 9 decimals.** Files are the same byte for byte. Pack time, new / 0.4.9, lower is better:

| Where | Sensor data, 256 KB blocks | Events |
|---|---:|---:|
| Laptop Firefox 160, 16 cores | 0.79 (earlier run, default blocks: 0.71) | 1.00 (noisy) |
| Laptop Chromium 156, 16 cores | 1.02 (earlier run, default blocks: 0.73) | 0.97 |
| Cloud WebKitGTK 2.52.6 | 0.64 | 0.86 |

Sensor-style data packs in 21 to 36% less time in Firefox and WebKitGTK. Chromium gained in one run and was even in the recheck.

**New in 0.4.11 and 0.4.12: a faster scanner in the fast writer.** 0.4.11 sizes rows 8 bytes at a time. 0.4.12 tries keys in the last row's order first and reads digits 8 at a time. Files are the same byte for byte. Laptop (16 cores), pack time, lower is better:

| Release, against | Data | Chromium 156 | Firefox 160 |
|---|---|---:|---:|
| 0.4.11 with 0.4.10, against 0.4.9 | Sensor, 256 KB blocks | 0.92 | 0.72 |
| 0.4.11 with 0.4.10, against 0.4.9 | Events | 0.93 | 0.90 |
| 0.4.12, against 0.4.10 | Sensor, default blocks | 0.84 | 0.86 |
| 0.4.12, against 0.4.10 | Sensor, 256 KB blocks | 0.84 | 0.85 |
| 0.4.12, against 0.4.10 | Events | 0.88 | 0.92 |

Cloud WebKitGTK 2.52.6: 0.4.11 within noise; 0.4.12's key-order step 0.88 to 1.00.

**New in 0.4.13: a smaller file.** `lfc-pack.js` is now 353 KB instead of 789 KB, because its built-in WebAssembly programs are stored compressed and the browser unpacks them while it compiles them. Results are the same. Load to first result, time new / old, lower is better:

| Where | New / old |
|---|---:|
| Laptop Chromium 156, 16 cores (two runs) | 0.90 and 0.89 |
| Laptop Firefox 160, 16 cores | 0.97 |
| Cloud Chromium 155 | 0.92 to 0.95 |
| Cloud Firefox 158 | 0.91 |
| Cloud WebKitGTK 2.52.6 | 0.97 |

**New in 0.4.14: faster packing of logs and hex ids.** Hex ids such as 1789c0bf1b now fill one log template slot. Long lowercase hex id columns are packed inside the WebAssembly scanner. Files are byte-identical. Laptop (16 cores), pack time, new / old (each change against the build before it), lower is better:

| Data | Firefox 160 | Chromium 156 |
|---|---:|---:|
| Logs, default blocks | 0.86 | 0.88 |
| Logs, 256 KB blocks | 0.88 | 0.90 |
| Events with long hex ids, default blocks | 0.66 | 0.82 |
| Events with long hex ids, 256 KB blocks | 0.84 | 0.87 |

Cloud WebKitGTK 2.52.6: logs 0.95, hex columns about the same.

**New in 0.4.15: more of packing runs in WebAssembly.** Text columns with few distinct values, counts and number columns are now built in WebAssembly, and log template slots are found in one pass. Files are byte-identical. Laptop (Windows, 16 cores, screen scale 1.25), single runs with apps open, 2026.10.31 11:10 PM ET. Pack time, new / 0.4.14, lower is better:

| Data | Firefox 160 | Chromium 156 |
|---|---:|---:|
| Events, default blocks | 0.80 | 0.75 |
| Events, 256 KB blocks | 0.86 | 0.82 |
| Logs, default blocks | 0.84 | 0.90 |
| Sensor, default blocks | 0.93 | 0.85 |
