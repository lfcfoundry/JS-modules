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
