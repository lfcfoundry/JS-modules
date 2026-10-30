**Measured on a real laptop: Firefox 160, 16 cores, 2026.10.30.** Medians; lower is better for every time and size. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: memory-compression against fflate and pako (ms; packed bytes).

| case | input MB | packed bytes | pack ms | unpack ms | same values back |
|---|---:|---:|---:|---:|---:|
| Float32 sensor data: memory-compression | 8.0 | 4,772,682 | 9.0 | 11 | yes |
| Float32 sensor data: fflate 6 | | 7,269,120 | 482 | 150 | |
| Float32 sensor data: pako 6 | | 7,329,598 | 912 | 114 | |
| list of 80,000 objects: memory-compression | 5.4 | 148,749 | 21 | 12 | yes |
| list of 80,000 objects: fflate 6 | | 800,641 | 325 | 36 | |
| list of 80,000 objects: pako 6 | | 769,526 | 341 | 36 | |
