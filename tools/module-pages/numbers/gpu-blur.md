**Measured on a real laptop: Firefox 160, 16 cores, 2026.10.30.** Medians; lower is better for every time and size. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: gpu-blur against canvas filter blur and StackBlur (blur and read one pixel back, ms).

| picture | gpu-blur | canvas filter blur() | StackBlur |
|---|---:|---:|---:|
| 256 x 256, radius 6 | 5.0 (webgl2) | 2.0 | 6.0 |
| 1024 x 1024, radius 12 | 16 (webgl2) | 9.0 | 61 |
| 2048 x 2048, radius 24 | 75 (webgl2) | 45 | 248 |
gpu-blur is 3.8x to 4.1x faster than StackBlur but 1.7x to 2.5x slower than the browser's own filter (a different blur shape; owner chose to keep the same look everywhere, no auto route).
