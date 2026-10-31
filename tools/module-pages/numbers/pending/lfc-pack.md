Staged, not yet confirmed on main: whole-read and reader-strictness results.

## Staged 2026.10.31 (not on main yet)
Whole read of 200 keys, 20,000 rows, vs main 0.2.0 (cloud, not laptop): WebKitGTK 1,122 to 590 ms (-47%), Firefox 158 552 to 289 ms (-48%), Chromium 155 657 to 598 ms (-9%); 50 keys within noise. Raw: /mnt/project-files/js-modules-research/lfc-pack/format-ideas-measure/J-main-vs-branch-colread-*.json.
End-user line: the reader is stricter about damaged files, and the JavaScript, Python and Go readers agree on what to refuse; files from the writers are unchanged.
Deep tier: four reader checks added to the layout spec as MUST refuse: side-list index at or past dictionary length, non-ASCII dictionary text, running sums (mono and delta) past 2^53, presence bits not matching a column's value count; JS also refuses invalid UTF-8.


## Staged 2026.10.31 12:29 AM ET: share and paths options (not released)
Opt-in, defaults unchanged. Source: /mnt/project-files/js-modules-research/lfc-pack/stack-retest-2026.10.31/RESULTS-share-paths-2026.10.31.md (check browser and machine labels there before publishing).
- `share: true` (shared string and shape tables): 100,000 GeoJSON points 17% smaller at 32 KB blocks, 12% smaller at 256 KB; whole reads 10 to 33% faster at those block sizes.
- `paths: true` (per-path strings): 11% smaller at default blocks, 14% smaller at 256 KB.
- Both together: 256 KB blocks come out about the size of today's default files, while 100-row range reads stay 20 to 60x faster.
- `access: 'random'`: read preset, 256 KB blocks plus share.



## Staged 2026.10.31 9:17 AM ET: number columns grouped by path in wasm (LFCP branch 21cdc81, not merged)
Byte-identical files. Orders, default blocks, pack ms before / after, median of 7, two rounds (cloud): Chromium 155 369, 348 / 310, 271; Firefox 158 391, 359 / 340, 384 (second round slower, say so); WebKitGTK 2.52.6 405, 416 / 357, 330. Overall 3 to 25% faster. End-user line: "Faster packing for files with numbers, same files byte for byte." Full table: modules/lfc-pack/CHANGELOG-DEV.md "Next" on the branch.
