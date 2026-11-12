# Compression and data-performance research: findings and thresholds for other threads

From the thread "Research compression and data-performance techniques", 2026.11.11 9:35 PM Eastern, updated 2026.11.12 1:06 AM Eastern. The full log, with methods and raw results, is on the JS-modules branch `claude/project-thread-8535qt` in `docs/research/compression-2026-11-11/RESEARCH.md` (E1 to E23). The same files are in this folder.

How these numbers were measured: on lfc-pack 0.8.1 to 0.9.3 (E19 onward on 0.9.3), in ungoogled Chromium 156, Firefox 158 and WebKitGTK 2.52.6, on one shared 4-core cloud machine. Each test pairs fresh pages and reports the ratio of medians, so 0.80 means the new way takes 80% of the time. Node was used only for byte counts and pass/fail checks. No laptop, tablet or phone runs yet.

## Status of each idea

| Idea | Status | Owner of the next step |
|---|---|---|
| B1 UUID char codes, B2 sample-based encoding pick | Shipped in 0.8.2 (PR 654) | done |
| B3 long numbers on the fast writer | Shipped in 0.8.3 (PR 655) | done |
| B3b v3 mixed kinds on the fast writer | Shipped in 0.9.1 | done |
| B14 range reads build only matching rows | Shipped in 0.9.3 | done |
| B16 4 MB flat blocks | Approved 9:25 PM, sent | code thread |
| B13 null plane (column type N, format minor 1) | Approved 9:25 PM, sent | code thread (plus the Python and Go readers) |
| B17 previous save as a zstd prefix (delta saves) | Adopt candidate for a proposal (browser-timed) | this thread |
| B7 built-in dictionary for small files | Rejected | none |
| B18b saves straight from row objects (no JSON text), gated | Adopt candidate, 3-browser gate passed; owner card open (11:43 PM) | owner |
| B19 equality reads (`equals`), dictionary codes, opt-in cache (with B19b) | Adopt candidate, 3-browser gate passed; owner card open (12:04 AM) | owner |
| B20 column reads: all-null JSON cells, hand-read JSON cells (Chromium, Firefox), one-pass zigzag | Adopt candidate, 3-browser gate passed; owner card open (12:50 AM) | owner |
| Blob-range import jobs (from the Codex review) | Adopt candidate for imports (main-thread copy and memory, not speed) | code thread, via the orchestrater |

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
- **On real data the gain is much smaller** (9:55 PM). On the NYC taxi table (300,000 rows, 5 nullable columns of small categories) the null plane saves 0.1 to 2.5%, with full reads at 0.83 to 0.97. Expect the 14 to 24% only when nulls sit in dates, decimals or names.
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

**Against other products (real taxi rows, 9:55 PM)**
- LFC-pack is 0.75 to 0.87 of the size of Parquet zstd-3 and 0.68 to 0.79 of pyarrow's default Parquet (zstd-1). We don't have a browser speed comparison with Parquet yet.
- Brotli 11 of the JSON beats LFC-pack on size below about 100 to 200 rows. LFC-pack wins above that, by 16 to 39% from about 1,000 rows.
- Brotli 5 is smaller below about 100 rows, loads 1.3 to 10 times faster and saves faster, but everything stays under 1 ms. Brotli 11 saves take 18 to 59 ms on 100 to 200 rows, which is too slow for autosave.
- **In the browser against rival readers (10:30 PM, same taxi rows, 3 browsers):** LFC-pack builds row objects in 0.51 to 0.63 of parquet-wasm's time. `unpackColumns` takes 1.1 to 2.0 times parquet-wasm's columns. **Update 12:50 AM (B20, E23):** most of that gap was one `JSON.parse` per cell in nullable columns (including blocks where the column is all null) and a three-pass money-column decode. With both fixed, taxi columns take 122 / 112 / 108 ms on 0.9.3 and 107 / 85 / 69 ms with the null plane, against parquet-wasm's 102 / 103 / 105 (Chromium / Firefox / WebKit). Stacked (1:05 AM): taxi equality reads with B19 + B19b + B20 take 0.44 to 0.47 of today, and 0.32 to 0.36 with the null plane too. A whole import-and-save session with Blob-range + B18b + B20 takes 0.61 to 0.82. These add up as expected, no more. Saving from row objects (`packRows`) takes 1.8 to 2.9 times parquet-wasm's save (lead B18). Arrow IPC reads columns in about 1 ms, but its file is 10 times larger.
- **Stacking (E16):** the approved items beat the sum of their parts on data with nullable columns. A 1% range read on orders takes 0.08 to 0.12 of today's time, against 0.16 to 0.28 if the gains were independent. Gate the release on the stacked numbers.
- **Real nested data (10:35 PM, 10,000 GitHub Archive events, 35.6 MB):** LFC-pack reads to objects in 0.57 to 0.83 of the time `JSON.parse` takes on the plain text, and 0.60 to 0.83 of zstd-3 plus parse. Whole-text zstd-19 and Brotli 9 are 17% smaller, because a whole-file window finds repeats. Keep nested blocks at 13 MB: at 4 MB this file was 10% bigger.
- **DuckDB-wasm (taxi rows):** a 1% range read to rows takes LFC-pack 0.27 to 0.41 of DuckDB's time. A column sum is 1 to 2.2 times faster in DuckDB. DuckDB takes 0.7 to 3.6 s to start.
- For app threads: an app save under about 100 rows is smaller as compressed JSON than as LFC-pack.

**Saves from row objects (B18b, E19, E21; over 0.9.3)**
- `packRows` without the JSON text step takes 0.51 to 0.90 of today's time on big tables in 3 browsers. Values are the same and files are 0.999 to 1.000 of the size.
- Gate: take the row path only above about 16 MB of text, or when fewer than 40% of cells are strings. String-heavy tables under 16 MB are 1.1 to 1.5 times slower through the row path, because the wasm text scanner wins there.
- Save peak memory falls 50 to 170 MB, because there is no JSON string.
- 4 MB blocks don't change pack time.
- Key order is first-seen per block (value-exact mode). Moving a block cut can reorder keys in later blocks, so compare values with sorted keys.

**Equality reads (B19, E20, E22; over 0.9.3's read-then-filter)**
- One query takes 0.36 to 0.87. Over 24 queries: 0.53 to 0.79, or 0.10 to 0.37 with a cache between queries.
- A value absent from a block costs 0.02 to 0.05, when the column is a dictionary.
- The cache holds about what all rows held in memory would (99 MB against 85 MB for 300,000 log rows), so it should be opt-in and need a size limit.
- Stacked with the null plane, first queries beat the sum of the parts: orders 0.37 to 0.44 against an expected 0.44 to 0.59.
- Decoding only the matching positions (B19b) removes the cache's first-query cost (up to 1.10 down to 0.48). Through the null plane, it beats the sum of its parts: sensors with nulls over 24 queries take 0.14 of today, against an expected 0.24 (Firefox 0.17 against 0.25, WebKit 0.18 against 0.33), because the nullable column is no longer JSON text.

**Imports in helper workers (E21)**
- Handing each helper a Blob and a byte range, instead of slicing the whole file, takes main-thread copying from 9-24 ms to 0. Time is flat (0.93 to 1.06).
- Import peak memory falls 5 to 64 MB in Chromium and WebKit; Firefox is mixed (-30 to +18 MB).
- With B18b saves the two add up, but don't beat the sum: they act on different steps.

**Skips that don't pay**
- Skipping zstd on incompressible frames saves under 5% of pack time.

## Method rules worth copying
- Fresh page per variant, alternating order, ratio of medians, all 3 engines. A busy machine fakes slowdowns, so re-run any cell above 1.05 on its own page before believing it.
- Check byte identity against the current release on files the change should not touch.
- Read the time from `TZ=America/Detroit date` before stamping it.
