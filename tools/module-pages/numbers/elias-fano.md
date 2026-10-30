**Measured on a real laptop: Firefox 160, 16 cores, 2026.10.30.** Medians; lower is better for every time and size. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: elias-fano against plain arrays (100,000 sorted lists, 1,451,624 ids).

| form | bytes | against plain |
|---|---:|---:|
| plain Uint32 arrays | 6,206,500 | 1.00x |
| deflate of the gaps (fflate 6, no random access) | 3,041,374 | 0.49x |
| elias-fano blob (random access kept) | 2,927,008 | 0.47x |
| operation | ms |
|---|---:|
| elias-fano: build | 28 |
| elias-fano: decodeAll | 12 |
| elias-fano: get 20,000 random lists | 23 |
| elias-fano: getMany 20,000 random lists (one call) | 7.0 |
| plain Uint32Arrays: read 20,000 random lists | 1.0 |
getMany is 3.3x faster than a get loop. Plain arrays read faster (1.0 ms) at 2.1x the memory.
