**Measured on a real laptop: Firefox 160, 16 cores, 2026.10.30.** Medians; lower is better for every time and size. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: save-kit against idb-keyval and localForage (750 bytes of JSON, 300 saves in a row, microseconds).

| library | save | load |
|---|---:|---:|
| save-kit (localStorage + backup slot + checks) | 20 | 13 |
| idb-keyval (IndexedDB) | 427 | 207 |
| localForage (IndexedDB) | 453 | 193 |
| localForage (localStorage driver) | 27 | 10 |
After one damaged value in the main slot save-kit fell back to its backup slot and returned a fully valid state; idb-keyval and localForage hand back whatever was stored (for example NaN) with no check.
