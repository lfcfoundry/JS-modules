**Measured on real data: cloud Chromium 156.0.8078.79, Firefox 158.0 and WebKitGTK 2.52.6, one browser at a time, 2026.11.22.** Medians of 3 runs; lower is better. Records: the first 60,000 rows of the retail e-commerce file (11.4 MB as JSON) and of the SEC 2026 Q1 numbers file (14.4 MB as JSON). Decimal columns: 413,875 real SEC statement values (3.3 MB as 64-bit numbers) and 147,846 real SBA award amounts (1.2 MB). fflate gzip level 6 is given the JSON text (records) or the number bytes (columns); its unpack time is the unzip only, with no JSON parsing. This replaces the earlier generated sensor array and 80,000 generated objects.

Compared: memory-compression against fflate on real data (packed bytes; pack ms in Chromium / Firefox / WebKitGTK).

<!-- title: memory-compression packs 60,000 real rows to 0.66 to 0.84 of fflate's size, 5.1 to 9.7 times faster, but real decimal columns come out 1.15 to 2.2 times bigger than gzip -->
| case | packed bytes | pack ms (Chromium / Firefox / WebKitGTK) | unpack ms (Chromium / Firefox / WebKitGTK) |
|---|---:|---|---|
| retail rows: memory-compression | 959,528 | 39 / 36 / 64 | 26 / 19 / 20 |
| retail rows: fflate | 1,140,114 | 230 / 243 / 329 | 90 / 48 / 113 |
| retail rows: msgpackr records | 4,830,828 | 32 / 23 / 29 | 44 / 33 / 64 |
| SEC rows: memory-compression | 748,129 | 34 / 28 / 39 | 9.5 / 13 / 14 |
| SEC rows: fflate | 1,132,736 | 331 / 335 / 260 | 70 / 47 / 120 |
| SEC rows: msgpackr records | 8,108,780 | 64 / 48 / 45 | 55 / 66 / 92 |
| SEC values (decimals): memory-compression | 1,919,892 | 9.6 / 10 / 18 | 4.4 / 5 / 5 |
| SEC values (decimals): fflate | 1,664,838 | 191 / 161 / 159 | 44 / 33 / 46 |
| SBA amounts (decimals): memory-compression | 134,774 | 2.4 / 2 / 2 | 2.6 / 1 / 1 |
| SBA amounts (decimals): fflate | 60,886 | 61 / 55 / 47 | 5.4 / 3 / 9 |

Rows: smaller than fflate (0.84x and 0.66x) and 5 to 10 times faster to pack; msgpackr is faster to pack but 5 to 11 times bigger. Real decimal columns are a **loss on size**: memory-compression is 1.15 times (SEC values) and 2.2 times (SBA amounts) the size of fflate, because real amounts repeat and gzip finds the repeats; `mode: 'balanced'` did not help (1,919,907 and 134,789 bytes). It stays 5 to 24 times faster to pack and 2 to 9 times faster to unpack. Harness and raw results: `tools/real-corpus` and `js-modules-research/audit-synthetic-claims-2026.11.22`.

**New in 2.7.0: faster packing on request.** The opt-in setting `quickTries: true` makes the packer try every number coding on the first block only. Packing is 0 to 20% faster on lists with several number columns, and files are 0 to 1.1% bigger. It is off by default, and the default output is byte-identical to 2.6.6. These figures come from the code thread's test runs; the browser is not recorded on this page.


**Version against version, real laptop, ungoogled Chromium 156 (Windows), 16 cores, 2026.10.30, 9:47 PM.** Medians; lower is better. One browser on one machine.

| list (pack, ms) | quickTries off (default) | on | size on / off |
|---|---:|---:|---:|
| links, 60,000 rows | 5.4 | 5.4 | 1.0000 |
| scene items, 30,000 rows | 3.3 | 3.3 | 1.0000 |
| users, 20,000 rows | 2.7 | 2.8 | 1.0000 |

On these three lists `quickTries` changes nothing. Its 0 to 20% gain is for lists with several number columns.


**Same tests in Firefox 160 (Windows), real laptop, 16 cores, 2026.10.30, 9:41 PM.** Medians; lower is better.

| list (pack, ms) | quickTries off (default) | on | size on / off |
|---|---:|---:|---:|
| links, 60,000 rows | 6.0 | 6.0 | 1.0000 |
| scene items, 30,000 rows | 5.0 | 5.0 | 1.0000 |
| users, 20,000 rows | 3.0 | 2.5 | 1.0000 |

`quickTries` changes nothing on two lists and is 16% faster on the third.


**New in 2.8.0: faster packing of lists by default.** Cloud-browser runs (shared machine, not noise-guarded, not the laptop). The new `autoTries` setting, on by default, packs lists of 20,000 to 300,000 rows 1.02 to 1.24x faster in Chromium, Firefox and WebKitGTK. Packed size is 0 to 1.3% bigger for whole-number lists of 10,000 to 100,000 rows, and unchanged above that. `autoTries: false` gives the same bytes as 2.7.0.


**New in 2.8.1: the first pack after a pause is as fast as the rest.** Cloud-browser runs (shared machine, not the laptop). After the 2-second idle trim, the two small WebAssembly helpers are rebuilt right away (about 6 MB held), so the next pack does not pay to start them; memory above 4 MB is still released. First pack after idle, 40,000 events, balanced mode: Chromium 40.0 to 35.9 ms, Firefox 33 to 34 ms (noise), WebKitGTK 44 to 40 ms.


**New in 2.11.0: faster first row on a big `view()`.** Laptop runs (Chromium 156, Firefox 160). Date columns, template text and coordinate pairs now open in windows, so reading the first row of a large user list takes 0.42 of the old time in Chromium (0.38 to 0.47) and 0.33 in Firefox. Full scans are even (0.96 to 1.03 of the old time). Same values as before.


**New in 2.8.2: faster `view()` under a strict page policy.** Cloud-browser runs (shared machine, not the laptop). On pages that forbid `eval` (the policy the apps use), `view()` now stays lazy, so opening a view and reading a row is faster, with the same rows. Pack and unpack are unchanged.

| View open + get, ms (lower is better) | Before | After |
|---|---:|---:|
| Firefox, Events | 10 | 2 |
| Firefox, Users | 17 | 6 |
| Chromium, Features | 19.2 | 12.7 |
| WebKitGTK, Features | 35 | 16 |

**New in 2.9.0: stream rows (opt-in).** `unpackAsync(bytes, { stream: true, onRows, page })` hands rows over a page at a time (4,096 by default) and lets each page go after `onRows` returns, so a long list never holds every row at once. 300,000 events, time divided by plain `unpackAsync` with its 90% range; lower is better.

| Laptop, 16 cores | Time new / old | Longest pause |
|---|---:|---:|
| Chromium 156 | 0.60 (0.57 to 0.66) | 2 to 4 times shorter |
| Firefox 160 | 0.82 (0.68 to 0.94) | 2 to 4 times shorter |

Lists of 131,072 rows or fewer take the plain path, because streaming them was 6 to 7% slower. WebKitGTK was not measured for this change.

**New in 2.10.0: `unpack(bytes, { into })` reuses your array.** Pass the typed array you got last time, and the next unpack fills it instead of making fresh memory. This works for Float64, Float32, Uint32, Uint16 and Uint8 arrays of the same type and length; other arrays get a fresh one. The format is unchanged. 4 million numbers, time into / fresh, lower is better:

| Where | Float64, balanced | Float64, fast | Float32, fast |
|---|---:|---:|---:|
| Laptop Chromium 156, 16 cores | 0.81 | 0.75 | 0.82 |
| Laptop Firefox 160, 16 cores | 0.70 | 0.91 | 0.86 |

That is 9 to 30% less time on the laptop. Cloud browsers read 0.13 to 0.75, because writing to fresh memory for the first time costs about 0.7 ms per MB there.
