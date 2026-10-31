Publish when the decimal-number and coordinate-stride code is on main (it is on a code branch now). Add to the module page numbers.

**What is new: decimals take 40 to 85% less space, and part reads got fast.**

| File size of decimal data, flat rows (100,000 rows, bytes) | Before | Now | Change |
|---|---:|---:|---:|
| Sensor readings, 3 decimals | 257,878 | 106,089 | -59% |
| GPS latitude, 5 decimals | 185,942 | 68,141 | -63% |
| Price, 4 decimals | 310,402 | 161,698 | -48% |
| Random values, 3 decimals | 358,103 | 212,902 | -41% |

| File size of decimal data in nested rows (bytes) | Before | Now | Change |
|---|---:|---:|---:|
| Sensor rows with ids and lists (100,000 rows) | 504,211 | 106,246 | -79% |
| GeoJSON points (50,000) | 421,852 | 146,499 | -65% |
| Orders with 2-decimal prices (50,000) | 449,125 | 226,975 | -50% |
| Epoch milliseconds + random big ints (50,000) | 466,513 | 399,701 | -14% |

**Also on that branch:** an opt-in generated row builder (needs `unsafe-eval` in the page policy; WebKitGTK 628 ms down to 183 ms), checksums with an optional faster XXH64 check, and a one-file viewer. Measured and not built: trained dictionaries (files grew) and a shared string table (under 0.1% possible).


## Staged 2026.10.31 (not on main yet)
Whole read of 200 keys, 20,000 rows, vs main 0.2.0 (cloud, not laptop): WebKitGTK 1,122 to 590 ms (-47%), Firefox 158 552 to 289 ms (-48%), Chromium 155 657 to 598 ms (-9%); 50 keys within noise. Raw: /mnt/project-files/js-modules-research/lfc-pack/format-ideas-measure/J-main-vs-branch-colread-*.json.
End-user line: the reader is stricter about damaged files, and the JavaScript, Python and Go readers agree on what to refuse; files from the writers are unchanged.
Deep tier: four reader checks added to the layout spec as MUST refuse: side-list index at or past dictionary length, non-ASCII dictionary text, running sums (mono and delta) past 2^53, presence bits not matching a column's value count; JS also refuses invalid UTF-8.
