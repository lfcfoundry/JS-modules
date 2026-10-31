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
