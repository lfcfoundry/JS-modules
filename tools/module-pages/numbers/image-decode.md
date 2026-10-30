**Measured on a real laptop: Firefox 160, 16 cores, 2026.10.30.** Medians; lower is better for every time and size. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: image-decode against createImageBitmap and Image (8 PNG sheets, 0.3 MB, ms).

| way | ms | time / image-decode |
|---|---:|---:|
| image-decode loadAll (2 at a time) | 23 | 1.00x |
| createImageBitmap one after another | 40 | 1.74x |
| createImageBitmap all at once | 36 | 1.57x |
| Image + decode() one after another | 40 | 1.74x |
