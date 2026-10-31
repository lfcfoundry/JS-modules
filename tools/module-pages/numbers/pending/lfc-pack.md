Staged, not yet confirmed on main: whole-read and reader-strictness results.

## Staged 2026.10.31 (not on main yet)
Whole read of 200 keys, 20,000 rows, vs main 0.2.0 (cloud, not laptop): WebKitGTK 1,122 to 590 ms (-47%), Firefox 158 552 to 289 ms (-48%), Chromium 155 657 to 598 ms (-9%); 50 keys within noise. Raw: /mnt/project-files/js-modules-research/lfc-pack/format-ideas-measure/J-main-vs-branch-colread-*.json.
End-user line: the reader is stricter about damaged files, and the JavaScript, Python and Go readers agree on what to refuse; files from the writers are unchanged.
Deep tier: four reader checks added to the layout spec as MUST refuse: side-list index at or past dictionary length, non-ASCII dictionary text, running sums (mono and delta) past 2^53, presence bits not matching a column's value count; JS also refuses invalid UTF-8.
