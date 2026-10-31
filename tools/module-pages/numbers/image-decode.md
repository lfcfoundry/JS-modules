**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: image-decode against createImageBitmap and Image (8 PNG sheets, ms).

| way | ms |
|---|---:|
| image-decode loadAll | 16 |
| createImageBitmap, all at once | 20 |
| createImageBitmap, one after another | 24 |
| Image + decode(), one after another | 26 |
