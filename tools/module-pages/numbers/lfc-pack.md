**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: LFC-pack against JSON.parse and gzip (300,000 web-log rows, 32.0 MB NDJSON, ms).

| form | bytes | against NDJSON |
|---|---:|---:|
| NDJSON text | 32,027,185 | 1.000 |
| gzip | 5,343,775 | 0.167 |
| LFC-pack | 1,907,954 | 0.060 |

| way | read ms |
|---|---:|
| JSON.parse (one array) | 48 |
| LFC-pack unpack (row objects) | 72 |
| gunzip + JSON.parse | 220 |

| way | write ms |
|---|---:|
| LFC-pack pack | 333 |
| gzip | 1,074 |

LFC-pack is 3.2x faster to write and 2.8x smaller than gzip, and reads 3x faster than gunzip plus JSON.parse. Reading row objects is about 1.5x slower than JSON.parse alone.
