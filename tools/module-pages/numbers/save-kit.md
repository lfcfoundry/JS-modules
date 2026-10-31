**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: save-kit against idb-keyval and localForage (750 bytes of JSON, microseconds).

| library | save | load |
|---|---:|---:|
| save-kit (localStorage + backup slot + checks) | 10 | 6.7 |
| idb-keyval (IndexedDB) | 180 | 90 |
| localForage (IndexedDB) | 190 | 90 |
| localForage (localStorage driver) | 17 | 3.3 |

After a damaged value, save-kit falls back to its backup slot and returns a valid state; the others return NaN with no check. localForage's localStorage driver is faster on load, but it has no backup slot and no check.

**New in 1.3.1: loads with a raw field are 2 to 3 times faster.** Saves with a raw field (nested game state, maps, inventories) used to be copied four times on load. Now the parsed objects are used as they are, unless the text names a `__proto__`, `constructor` or `prototype` key. The state is just as clean. Saves without raw fields are unchanged. Measured by the code thread, median of repeated runs in Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6 (a shared cloud machine, not the laptop):

| Load of a save with a raw field (microseconds) | Chromium | Firefox | WebKitGTK |
|---|---:|---:|---:|
| medium raw field, before | 196 | 225 | 264 |
| medium raw field, after | 82 | 67 | 107 |

A save that is migrated from an older version still takes the slower copy.

**Start-up cost.** In the code thread's cold-start runs on the same machine, save-kit adds under 1 ms at start-up compared with the bare localStorage driver, and is 4x to 13x faster than any IndexedDB library.


**Version against version, real laptop, ungoogled Chromium 156 (Windows), 16 cores, 2026.10.30, 9:47 PM.** Medians; lower is better. One browser on one machine.

**Big saves: `createLarge` against idb-keyval and localForage (IndexedDB, ms).** `createLarge` also writes a backup slot in the same transaction and checks fields against the schema; the other two store the object as it is.

| save | save-kit createLarge | idb-keyval | localForage |
|---|---:|---:|---:|
| 1 MB: save | 4.3 | 7.1 | 7.5 |
| 1 MB: load | 6.9 | 10 | 10 |
| 16 MB: save | 48 | 109 | 121 |
| 16 MB: load | 52 | 94 | 80 |

Saved and loaded back the same in every case.


**Same tests in Firefox 160 (Windows), real laptop, 16 cores, 2026.10.30, 9:41 PM.** Medians; lower is better.

**Big saves with `createLarge` (IndexedDB, ms):**

| save | save-kit createLarge | idb-keyval | localForage |
|---|---:|---:|---:|
| 1 MB: save | 4.0 | 15 | 14 |
| 1 MB: load | 3.1 | 11 | 10 |
| 16 MB: save | 70 | 161 | 156 |
| 16 MB: load | 71 | 147 | 148 |

Roughly 2x to 3.7x faster than idb-keyval and localForage here; saved and loaded back the same in every case. Small saves (750 bytes, microseconds per save and load): save-kit 13 and 6.7, idb-keyval 203 and 93, localForage (IndexedDB) 210 and 93, localForage (localStorage driver) 17 and 3.3. After one damaged value save-kit falls back to its backup slot and returns a valid state.


**New in 1.4.0: saves that survive a crash (opt-in).** Real crash test in the cloud browsers (not the laptop): with normal saves, 29 of 80 (Chromium) and 30 of 80 (Firefox) were lost; with the new `durable` option, none were lost. No measurable cost to saving or startup. `SaveKit.durableCopy()` is also new.
