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

<!-- title: elias-fano holds 1,000,000 spread-out sorted values in 0.66 to 0.69 of the bytes of roaring-wasm with flat or block lists -->
| way | bytes |
|---|---:|
| elias-fano, flat lists | 1336608 |
| elias-fano, block lists | 1398768 |
| FastIntegerCompression | 1746299 |
| roaring-wasm | 2030536 |
| elias-fano, block lists with arrays: true | 2072584 |

Compared: elias-fano against roaring-wasm on "first value at or above x" (20,000 lookups, spread-out values, ms, lower is faster).

<!-- title: Finding the first value at or above x is 38 to 47 times faster with elias-fano flat lists than with roaring-wasm on spread-out values -->
| way | Chromium 155 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| elias-fano, flat lists | 1.2 | 1.3 | 1.0 |
| roaring-wasm | 52 | 50 | 47 |

Compared: elias-fano against roaring-wasm on intersecting with a 200,000-value list (spread-out values, ms, lower is faster).

<!-- title: Intersecting spread-out lists, elias-fano with arrays: true is 1.4 to 3.1 times faster than roaring-wasm, and default block lists are 1.2 to 1.4 times slower -->
| way | Chromium 155 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| elias-fano, block lists with arrays: true | 1.4 | 1.3 | 2.3 |
| roaring-wasm | 3.4 | 4.0 | 3.3 |
| elias-fano, block lists | 4.2 | 4.7 | 4.7 |
| elias-fano, flat lists | 8.2 | 8.7 | 7.3 |

Compared: elias-fano against roaring-wasm on intersecting with a 200,000-value list (dense values, ms, lower is faster).

<!-- title: Intersecting dense lists, elias-fano block lists are 1.3 to 2 times faster than roaring-wasm, and 3 to 4 times faster with arrays: true -->
| way | Chromium 155 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| elias-fano, block lists with arrays: true | 0.47 | 0.67 | 0.33 |
| elias-fano, block lists | 0.97 | 1.0 | 1.0 |
| roaring-wasm | 1.5 | 2.0 | 1.3 |
| elias-fano, flat lists | 6.2 | 5.7 | 5.7 |

Compared: elias-fano against roaring-wasm and FastIntegerCompression on decoding everything (spread-out values, ms, lower is faster).

<!-- title: Decoding everything, block lists with arrays: true keep level with roaring-wasm on spread-out values, while flat lists take about 2 times as long -->
| way | Chromium 155 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| roaring-wasm | 2.2 | 2.7 | 1.3 |
| elias-fano, block lists with arrays: true | 2.4 | 2.3 | 1.3 |
| elias-fano, flat lists | 5.5 | 4.3 | 4.7 |
| FastIntegerCompression | 7.9 | 12 | 11 |

Cloud-browser runs (shared machine, not the laptop), one page per browser, median of 11 rounds; intersect times are since 2.1.1. Where roaring-wasm still wins: intersecting spread-out lists against default block lists (3.3 to 4.0 ms against 4.2 to 4.7, which keep the smaller size), and decoding everything from flat or default block lists on spread-out values (about 2 times faster). With arrays: true the lists are bigger than roaring-wasm's on spread-out values (2,072,584 against 2,030,536 bytes). FastIntegerCompression has no lookups or intersecting.
