**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: save-kit against idb-keyval and localForage (750 bytes of JSON, microseconds).

| library | save | load |
|---|---:|---:|
| save-kit (localStorage + backup slot + checks) | 10 | 6.7 |
| idb-keyval (IndexedDB) | 180 | 90 |
| localForage (IndexedDB) | 190 | 90 |
| localForage (localStorage driver) | 17 | 3.3 |

After a damaged value, save-kit falls back to its backup slot and returns a valid state; the others return NaN with no check. localForage's localStorage driver is faster on load, but it has no backup slot and no check.
