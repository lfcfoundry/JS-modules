**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: zip-open against fflate and JSZip (400 CSV files, 2.45 MB zip, ms).

| library | ms |
|---|---:|
| zip-open expand (safe, text out) | 34 |
| fflate | 49 |
| JSZip | 66 |

zip-open also checks every checksum and size limit and refuses zip bombs; the others do the plain work.
