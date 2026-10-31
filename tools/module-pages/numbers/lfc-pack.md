**Measured on a real laptop: Firefox 160, 16 cores, 2026.10.30.** Medians; lower is better for every time and size. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: LFC-pack against JSON.parse and gzip (300,000 web-log rows, 32.0 MB NDJSON, ms).

| form | bytes | against NDJSON |
|---|---:|---:|
| NDJSON text | 32,027,185 | 1.000 |
| gzip (fflate 6) | 5,343,775 | 0.167 |
| LFC-pack | 1,907,954 | 0.060 |

| way | read ms |
|---|---:|
| LFC-pack unpack (row objects) | 111 |
| JSON.parse (one array) | 102 |
| gunzip (fflate) + JSON.parse | 382 |

| way | write ms |
|---|---:|
| LFC-pack pack | 571 |
| gzip (fflate level 6) | 1,925 |

LFC-pack is 3.4x faster to write and 2.8x smaller than gzip, and reads 3.4x faster than gunzip plus JSON.parse. Reading rows is within 9% of JSON.parse alone.
