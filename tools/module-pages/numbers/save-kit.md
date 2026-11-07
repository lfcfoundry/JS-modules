**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: save-kit against idb-keyval and localForage (750 bytes of JSON, microseconds).

<!-- title: save-kit saves a 750-byte state 18 times faster and loads it 13 times faster than idb-keyval, with a backup slot and checks -->
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


**New in 1.5.0: skip writing an unchanged big save (opt-in).** With `createLarge({ skipUnchangedMs })`, a save whose fields match the last stored one is not written again until that many ms pass; `save(state, true)` always writes. The save text is still built to compare, so the cost drops but is not zero. Unchanged 16 MB save, cloud browsers (not the laptop), ms, lower is better:

| Browser | Normal | With skipUnchangedMs | New / old |
|---|---:|---:|---:|
| Chromium 155 | 222.8 | 95.6 | 0.43 |
| Firefox 158 | 168 | 61 | 0.36 |
| WebKitGTK 2.52.6 | 102 | 35 | 0.34 |

That is 57 to 66% less time. Off by default; idle games that read the `seen` stamp should pick a small value.


**New in 1.5.1: a clean counts list is kept as it is on load.** A counts map that already passes every check (whole numbers within the cap, safe keys, 32 or more entries) is kept instead of copied entry by entry. Anything else takes the old path, so results are the same. 20 KB save with 800 counts entries, load time new / old, lower is better (cloud):

| Browser | New / old |
|---|---:|
| Chromium 155 | 0.79 |
| Firefox 158 | 0.82 |
| WebKitGTK 2.52.6 | 0.84 |

That is 16 to 21% less time. Small saves (448 bytes) and save time are unchanged. Laptop runs: not yet.


**Against the common alternatives (save-kit 1.5.2, measured 2026.11.01).** Cloud browsers, one at a time, early-stop A/B rule. Time ratio, save-kit / alternative; below 1 means save-kit is faster. Each cell gives Chromium 155 / Firefox 158 / WebKitGTK 2.52.6.

| Alternative | 448 B save | 448 B load | 20 KB save | 20 KB load |
|---|---|---|---|---|
| JSON + zod (no backup) | 0.57 / 0.37 / 0.38 | 0.49 / 0.27 / 0.31 | 0.52 / 0.18 / 0.22 | 0.71 / 0.28 / 0.70 |
| idb-keyval (IndexedDB) | 0.00 to 0.01 | 0.00 to 0.01 | 0.15 / 0.12 / 0.04 | 0.32 / 0.14 / 0.27 |
| localForage (IndexedDB) | 0.00 to 0.01 | 0.00 to 0.01 | 0.13 / 0.12 / 0.07 | 0.54 / 0.16 / 0.23 |
| Bare JSON.stringify, no checks (earlier run) | 0.9 to 1.1 | 1.3 to 1.9 | 0.9 to 2.0 | 1.5 to 2.9 |

The bare-JSON row is from before 1.5.1 and 1.5.2. 20 KB loads are about 0.8 of those figures now.

**Damaged saves (the same in all three browsers):**

| What goes wrong | save-kit | JSON + zod | Plain JSON | idb-keyval / localForage |
|---|---|---|---|---|
| A bug writes NaN | Refused, good save kept | Refused, good save kept | Written (becomes null) | Written (NaN stored) |
| Stored text cut off | Loads the backup | Throws, nothing loaded | Throws, nothing loaded | Not applicable |
| One count has the wrong type | Recovers | Throws, nothing loaded | Accepts the bad value | Accepts the bad value |
| A `__proto__` key | Key dropped, data kept | Throws, nothing loaded | Loaded as a data key | Accepted |

**Size, minified and gzipped (smaller is better):** idb-keyval 370 B; save-kit core 1,843 B; with save codes 3,217 B; everything 6,131 B (lean builds); localForage 9,057 B; zod 14,082 B; ajv 38,364 B. ajv's normal mode builds its checker with `new Function`, which a strict page security policy forbids, so it was not timed.

**New in 1.5.2: a faster number check in WebKit browsers.** WebKitGTK 2.52.6, time new / old, lower is better: 20 KB save 0.41 (noisy), 20 KB load 0.81, unchanged 20 KB save 0.43. Tiny 448 B saves are a few microseconds slower (load 1.29, noisy). Chromium and Firefox keep the old check and are unchanged.

**New in 1.6.0: `save-kit-lite.js`.** Checked numbers, whole numbers, flags and short text, with a main and a backup slot. It gives the same answers as `create()` on 3,000 random damaged slots. Size, minified and gzipped: lite 966 B, full save-kit with every part cut 1,847 B, idb-keyval 370 B. Speed against `create()` on a six-field save, lite / full, lower is better (cloud, early-stop A/B rule):

| Browser | Save | Load |
|---|---:|---:|
| Chromium 155 | 0.98 (inconclusive) | 0.91 |
| Firefox 158 | 1.01 | 0.95 |
| WebKitGTK 2.52.6 | 0.89 (noisy) | 0.97 |

It is smaller, not faster. Not in lite: counts and raw fields, codes, autosave, versions, the other-tab notice, IndexedDB.

**The same comparison on a real laptop.** Laptop (Windows, 16 cores, screen scale 1.25), single runs with apps open, 2026.10.31 11:10 PM ET. Ratio, save-kit / alternative; below 1 means save-kit is faster. Early-stop A/B.

| Case | Firefox 160 | Chromium 156 |
|---|---:|---:|
| 448 B save vs JSON + zod | 0.45 | 0.65 |
| 448 B load vs JSON + zod | 0.30 | 0.47 |
| 448 B save vs idb-keyval / localForage | 0.004 / 0.004 | 0.011 / 0.010 |
| 448 B load vs idb-keyval / localForage | 0.010 / 0.009 | 0.008 / 0.009 |
| 20 KB save vs JSON + zod | 0.18 | 0.48 |
| 20 KB load vs JSON + zod | 0.35 | 0.72 |
| 20 KB save vs idb-keyval / localForage | 0.11 / 0.09 | 0.13 / 0.13 |
| 20 KB load vs idb-keyval / localForage | 0.26 / 0.26 | 0.34 / 0.34 (noisy) |
| Six-field save, lite / create() | 0.97 (even) | 0.95 (even) |
| Six-field load, lite / create() | 0.76 | 0.89 |

On the laptop, the lite file also loads 11 to 24% faster; its saves are even. Not run on the laptop: 1.5.1 old against new, and the WebKit-only 1.5.2 check.

**Large saves against idb-keyval and localForage, cloud-browser runs.**

Compared: save-kit's createLarge against idb-keyval and localForage (game-like save with 2,000 named counts, whole call to data stored or in hand, ms, lower is faster).

<!-- title: save-kit saves a 16 MB game state 1.9 to 5.2 times as fast as idb-keyval and localForage, and loads it 1.3 to 2.9 times as fast -->
| way | Chromium 155 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| save-kit, 16 MB save | 76.2 | 124 | 65 |
| idb-keyval, 16 MB save | 148.3 | 354 | 328 |
| localForage, 16 MB save | 164 | 357 | 339 |
| save-kit, 16 MB load | 83.2 | 115 | 91 |
| idb-keyval, 16 MB load | 169.1 | 328 | 123 |
| localForage, 16 MB load | 166.8 | 351 | 120 |


<!-- title: At 4 MB save-kit is faster than idb-keyval and localForage in all three browsers, 1.5 to 4.5 times on load and save -->
| way | Chromium 155 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| save-kit, 4 MB save | 23.5 | 33 | 17 |
| idb-keyval, 4 MB save | 36.4 | 89 | 77 |
| localForage, 4 MB save | 38.4 | 87 | 69 |
| save-kit, 4 MB load | 21.7 | 36 | 23 |
| idb-keyval, 4 MB load | 33.5 | 88 | 35 |
| localForage, 4 MB load | 32.9 | 79 | 34 |


Cloud-browser runs (shared machine, not the laptop), median of 14 rounds over two passes, one library at a time. idb-keyval and localForage store the object as it is, with no checks and no backup; save-kit also checks every field and keeps a backup. Below 4 MB it is equal or faster (WebKitGTK 0.8 MB load is a tie at 7, 7 and 8 ms on a 1 ms clock). Where it loses: with `create()` and small saves, a 20 KB load takes up to 1.5 times as long as localForage's localStorage driver in WebKitGTK, because that driver checks nothing.
