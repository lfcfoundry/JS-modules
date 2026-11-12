# Compression and data-performance research: findings and thresholds for other threads

From the thread "Research compression and data-performance techniques", 2026.11.11 9:35 PM Eastern. The full log, with methods and raw results, is on the JS-modules branch `claude/project-thread-8535qt` in `docs/research/compression-2026-11-11/RESEARCH.md` (E1 to E13). The same files are in this folder.

How these numbers were measured: on lfc-pack 0.8.1 to 0.8.3, in ungoogled Chromium 156, Firefox 158 and WebKitGTK 2.52.6, on one shared 4-core cloud machine. Each test pairs fresh pages and reports the ratio of medians, so 0.80 means the new way takes 80% of the time. Node was used only for byte counts and pass/fail checks. No laptop, tablet or phone runs yet.

## Status of each idea

| Idea | Status | Owner of the next step |
|---|---|---|
| B1 UUID char codes, B2 sample-based encoding pick | Shipped in 0.8.2 (PR 654) | done |
| B3 long numbers on the fast writer | Shipped in 0.8.3 (PR 655) | done |
| B3b v3 mixed kinds on the fast writer | Approved 6:41 PM, sent | code thread |
| B14 range reads build only matching rows, plus B16 4 MB flat blocks | Approved 9:25 PM, sent | code thread |
| B13 null plane (column type N, format minor 1) | Approved 9:25 PM, sent | code thread (plus the Python and Go readers) |
| B17 previous save as a zstd prefix (delta saves) | Adopt candidate for a proposal (browser-timed) | this thread |
| B7 built-in dictionary for small files | Rejected | none |

## Thresholds other threads can use

**Where time goes (LFC-pack)**
- A full `unpack` is mostly row-object building (23 to 78%). zstd decoding is 1 to 17%. Faster decoders (SIMD, Stream VByte, entropy swaps) can save at most a few percent of a full read, so don't start there.
- Row objects from generated code are 4 to 7 times faster than keyed stores, but CSP forbids generated code by default (`rows: 'generated'` is opt-in).
- On number and log data, pack spends 11 to 19% of its time compressing encodings that lose.

**Block size (B16)**
- Flat data: 4 MB blocks with B14. A 1% time-range read takes 0.12 to 0.29 of today's time on logs and sensors, and 0.56 to 0.78 on a mixed set. A one-column read takes 0.19 to 0.59, a full read 0.81 to 1.02. Files grow up to 3.3%.
- Nested data: keep 13 MB. At 4 MB, full reads are 1.04 to 1.15 times slower and files grow 7.5%.
- 1 MB blocks: range reads drop further (0.04 to 0.12), but pack is up to 1.24 times slower and nested full reads up to 1.21 times slower. Not recommended.

**Range reads (B14)**
- Building only the matching rows pays off when fewer than half the rows in a block match. Above 50%, take the old path and reuse the decoded column. That cutover keeps the worst case even (0.94 to 1.09).
- Watch out: a narrow range followed by a wide one in the same page ran 1.04 to 1.29 times slower (cold code). Gate it.

**Nulls (B13)**
- One `null` anywhere in a typed column costs 11 to 16% of the file on number and text columns, at any null share from 0.1% to 50%. On true/false columns it costs 1 to 4%. The whole column falls back to JSON text.
- With the null plane stacked on B3b, files with nullable columns are 14 to 24% smaller, pack takes 0.65 to 0.86 of today's time and a full read 0.50 to 0.92. Files without nulls are byte-identical.
- For apps: until the null plane ships, leaving a key out costs far less than writing `null`. An out-of-range sentinel such as -999 is within 5.5% of the null plane on numbers.

**Mixed kinds (B3b)**
- Up to about half the cells can be of another kind before the fast writer loses. Above 50% literal cells it cuts over to the old path, which keeps the worst case at 0.94 to 1.05.
- Rule learned: always time the case where every cell takes the new path. Two earlier drafts were 1.1 to 1.6 times slower there.

**Small files and app saves**
- Every file carries 350 to 840 bytes of fixed parts.
- LFC-pack is 1.2 to 3.4 times larger than gzip -9 of the JSON at 10 to 20 rows. It breaks even somewhere between 10 and 100 rows, and at 1,000 rows it is 0.45 to 0.74 of gzip. State this wherever small files are compared.
- Measured with real zstd dictionaries, a built-in dictionary saves 11 to 24% of a 10-row file and 0 to 3% at 1,000 rows. A per-app dictionary saves 15 to 28% at 10 rows. Trained dictionaries lose to raw-content dictionaries at these sizes.

**Delta saves (B17, sizes real, timing native only so far)**
- The setup: compress each frame against the same frame of the last full save. A 2,000-node Netflow map then costs 3% of a full save after 1 edit, 4% after 20, 8% after 100 and 16% after 500.
- Suggested rule: write a full save when the delta passes 25% of the last full save.
- In the 3 browsers (9:40 PM), the zstd step of a delta save takes 0.23 to 0.37 of a full save's, and decoding takes 0.07 to 0.20. zstd is only about a tenth of a whole save (5 to 6 ms for this map), so the win is size, not speed. Reading a delta adds under 0.05 ms, because the base save has to be decoded first. Status: adopt candidate for a proposal.
- Who could use it: Netflow saves, Story Editor and Mind Mapper autosave, Workbench snapshots. It needs an API and a format flag, so it would come as its own proposal.

**Skips that don't pay**
- Skipping zstd on incompressible frames saves under 5% of pack time.

## Method rules worth copying
- Fresh page per variant, alternating order, ratio of medians, all 3 engines. A busy machine fakes slowdowns, so re-run any cell above 1.05 on its own page before believing it.
- Check byte identity against the current release on files the change should not touch.
- Read the time from `TZ=America/Detroit date` before stamping it.
