**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: memory-compression against fflate and pako (ms; packed bytes).

| case | packed bytes | pack ms | unpack ms |
|---|---:|---:|---:|
| Float32 sensor data, 8 MB: memory-compression | 4,772,682 | 5 | 6 |
| fflate 6 | 7,269,120 | 278 | 88 |
| pako 6 | 7,329,598 | 540 | 66 |
| list of 80,000 objects: memory-compression | 148,749 | 11 | 6 |
| fflate 6 | 800,641 | 176 | 21 |
| pako 6 | 769,526 | 199 | 19 |

**New in 2.7.0: faster packing on request.** The opt-in setting `quickTries: true` makes the packer try every number coding on the first block only. Packing is 0 to 20% faster on lists with several number columns, and files are 0 to 1.1% bigger. It is off by default, and the default output is byte-identical to 2.6.6. These figures come from the code thread's test runs; the browser is not recorded on this page.


**Version against version, real laptop, ungoogled Chromium 156 (Windows), 16 cores, 2026.10.30, 9:47 PM.** Medians; lower is better. One browser on one machine.

| list (pack, ms) | quickTries off (default) | on | size on / off |
|---|---:|---:|---:|
| links, 60,000 rows | 5.4 | 5.4 | 1.0000 |
| scene items, 30,000 rows | 3.3 | 3.3 | 1.0000 |
| users, 20,000 rows | 2.7 | 2.8 | 1.0000 |

On these three lists `quickTries` changes nothing. Its 0 to 20% gain is for lists with several number columns.


**Same tests in Firefox 160 (Windows), real laptop, 16 cores, 2026.10.30, 9:41 PM.** Medians; lower is better.

| list (pack, ms) | quickTries off (default) | on | size on / off |
|---|---:|---:|---:|
| links, 60,000 rows | 6.0 | 6.0 | 1.0000 |
| scene items, 30,000 rows | 5.0 | 5.0 | 1.0000 |
| users, 20,000 rows | 3.0 | 2.5 | 1.0000 |

`quickTries` changes nothing on two lists and is 16% faster on the third.


**New in 2.8.0: faster packing of lists by default.** Cloud-browser runs (shared machine, not noise-guarded, not the laptop). The new `autoTries` setting, on by default, packs lists of 20,000 to 300,000 rows 1.02 to 1.24x faster in Chromium, Firefox and WebKitGTK. Packed size is 0 to 1.3% bigger for whole-number lists of 10,000 to 100,000 rows, and unchanged above that. `autoTries: false` gives the same bytes as 2.7.0.


**New in 2.8.1: the first pack after a pause is as fast as the rest.** Cloud-browser runs (shared machine, not the laptop). After the 2-second idle trim, the two small WebAssembly helpers are rebuilt right away (about 6 MB held), so the next pack does not pay to start them; memory above 4 MB is still released. First pack after idle, 40,000 events, balanced mode: Chromium 40.0 to 35.9 ms, Firefox 33 to 34 ms (noise), WebKitGTK 44 to 40 ms.


**New in 2.8.2: faster `view()` under a strict page policy.** Cloud-browser runs (shared machine, not the laptop). On pages that forbid `eval` (the policy the apps use), `view()` now stays lazy, so opening a view and reading a row is faster, with the same rows. Pack and unpack are unchanged.

| View open + get, ms (lower is better) | Before | After |
|---|---:|---:|
| Firefox, Events | 10 | 2 |
| Firefox, Users | 17 | 6 |
| Chromium, Features | 19.2 | 12.7 |
| WebKitGTK, Features | 35 | 16 |

**New in 2.9.0: stream rows (opt-in).** `unpackAsync(bytes, { stream: true, onRows, page })` hands rows over a page at a time (4,096 by default) and lets each page go after `onRows` returns, so a long list never holds every row at once. 300,000 events, time divided by plain `unpackAsync` with its 90% range; lower is better.

| Laptop, 16 cores | Time new / old | Longest pause |
|---|---:|---:|
| Chromium 156 | 0.60 (0.57 to 0.66) | 2 to 4 times shorter |
| Firefox 160 | 0.82 (0.68 to 0.94) | 2 to 4 times shorter |

Lists of 131,072 rows or fewer take the plain path, because streaming them was 6 to 7% slower. WebKitGTK was not measured for this change.
