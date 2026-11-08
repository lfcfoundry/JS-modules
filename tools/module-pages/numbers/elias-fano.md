**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: elias-fano against plain arrays and deflated gaps (100,000 sorted lists, 1,451,624 ids).

<!-- title: elias-fano holds the same 100,000 sorted lists in less than half the bytes of plain arrays and keeps random access -->
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

**Against roaring-wasm and FastIntegerCompression, cloud-browser runs.**

Compared: elias-fano against roaring-wasm 1.1.0 and FastIntegerCompression 0.1.0 (1,000,000 sorted values with gaps of 1 to 500, size in bytes, smaller is better).

<!-- title: elias-fano holds 1,000,000 spread-out sorted values in 0.66 of the bytes of roaring-wasm and 0.77 of FastIntegerCompression -->
| way | bytes |
|---|---:|
| elias-fano | 1336608 |
| FastIntegerCompression | 1746299 |
| roaring-wasm | 2030536 |

Compared: elias-fano against roaring-wasm on "first value at or above x" (20,000 lookups, spread-out values, ms, lower is faster).

<!-- title: Finding the first value at or above x is 50 to 64 times faster with elias-fano than with roaring-wasm on spread-out values -->
| way | Chromium 155 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| elias-fano | 0.83 | 1.0 | 1.0 |
| roaring-wasm | 52.8 | 51 | 50 |

Compared: elias-fano against roaring-wasm and FastIntegerCompression on decoding everything (spread-out values, ms, lower is faster).

<!-- title: Decoding everything, elias-fano is 2.1 to 2.8 times slower than roaring-wasm and 2 to 3 times faster than FastIntegerCompression -->
| way | Chromium 155 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| roaring-wasm | 2.2 | 2.7 | 1.3 |
| elias-fano | 4.6 | 6.0 | 3.7 |
| FastIntegerCompression | 9.1 | 12 | 11.3 |

Cloud-browser runs (shared machine, not the laptop), one page per browser, median of 11 rounds. Where roaring-wasm wins: size on dense values (about half; the partitioned form gets within about 7%), "is x present" on dense values (2 to 3 times faster), decoding everything (1.3 to 2.8 times faster) and intersecting (2 to 4 times faster). FastIntegerCompression has no lookups or intersecting.
