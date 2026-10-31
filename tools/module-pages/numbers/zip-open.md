**Measured on a real laptop: Firefox 160, 16 cores, 2026.10.30.** Medians; lower is better for every time and size. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: zip-open against fflate and JSZip (400 CSV files, 5.6 MB unpacked, 2.45 MB zip, ms).

| library | ms | time / zip-open |
|---|---:|---:|
| zip-open expand (safe, text out) | 50 | 1.00x |
| fflate unzipSync + decode text | 78 | 1.56x |
| JSZip loadAsync + async text | 122 | 2.44x |
zip-open also checks every checksum and size limit and refuses zip bombs; the others do the plain work.
