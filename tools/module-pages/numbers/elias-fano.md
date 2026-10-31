**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: elias-fano against plain arrays and deflated gaps (100,000 sorted lists, 1,451,624 ids).

| form | bytes |
|---|---:|
| plain Uint32 arrays | 6,206,500 |
| deflate of the gaps (no random access) | 3,041,374 |
| elias-fano blob (random access kept) | 2,927,008 |

| operation | ms |
|---|---:|
| build | 22 |
| decodeAll | 8 |
| getMany, 20,000 lists in one call | 6 |

Plain arrays still read single lists faster, at about 2x the memory.


**Version against version, real laptop, ungoogled Chromium 156 (Windows), 16 cores, 2026.10.30, 9:47 PM.** Medians; lower is better. One browser on one machine.

| work | 1.4.0 ms | 1.5.0 ms |
|---|---:|---:|
| build (100,000 lists) | 19 | 16 |
| 20,000 lists one by one | 18 | 16 |
| 20,000 lists: one by one (1.4.0) against `getMany` (1.5.0) | 18 | 6.9 |

`getMany` gives the same lists as `get` and takes about 0.4 of the time.


**Same tests in Firefox 160 (Windows), real laptop, 16 cores, 2026.10.30, 9:41 PM.** Medians; lower is better.

| work | 1.4.0 ms | 1.5.0 ms |
|---|---:|---:|
| build (100,000 lists) | 19 | 16 |
| 20,000 lists one by one | 14 | 14 |
| 20,000 lists: one by one (1.4.0) against `getMany` (1.5.0) | 14 | 4.0 |

`getMany` takes about 0.3 of the time.


**New in 1.6.0 and 1.7.0: less memory in use.** Cloud-browser runs (shared machine, not noise-guarded, not the laptop). `compact()` halves the memory a list set uses. `trim()`, and `autoTrim` (on by default), give WebAssembly memory back to the browser: after building 5 million ids it drops from 24.4 MB to 1.8 MB, and with 12 compacted lists of which 10 are freed it drops from 14.1 MB to 1.8 MB. A trim takes 2 to 4 ms, and reads are unchanged.


**New in 1.8.0: faster repeat decodes of big lists.** Two parts. After a `toArray` or `slice` of 1 MB or more, the page prepares one array of that length while it is idle, and the next decode of that size fills it. New `toArray(out)` and `slice(a, b, out)` fill your own `Uint32Array` instead. 8 million values decoded again, cloud browsers, time new / old (lower is better):

| Browser | Spare array (automatic) | Your own array (`out`) |
|---|---:|---:|
| Chromium 155 | 0.75 | 0.80 |
| Firefox 158 | 0.80 | 0.72 |
| WebKitGTK 2.52.6 | 0.98 (no gain) | 0.65 |
