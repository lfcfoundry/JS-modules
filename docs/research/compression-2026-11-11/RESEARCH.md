Copyright (c) 2026 LFC Foundry. MIT License.

# Compression and data-performance research: living log

## What it is and how it works

This is the standing research log for ideas that LFC Foundry can borrow from leading compression and columnar-data projects: LZ4, Zstandard, Brotli, zlib/zlib-ng, libdeflate, Snappy, XZ/LZMA, ISA-L, Parquet, ORC, Arrow, BtrBlocks, FastLanes and others. Each idea is measured here on our own code and data before anyone recommends it. The log holds a dated experiment log, a prioritized backlog with a decision for every idea, rejected ideas and the reasons for rejecting them, and scripts that rerun every number.

Research only. Nothing in this folder changes product code, file formats, or dependencies. Adoption happens through a normal release by the owning code thread, after the owner approves.

## Why it exists

- To find speed and memory wins that hold up on our workloads, not on upstream benchmark charts.
- To keep a record of what was tried, so rejected ideas are not rediscovered.
- To rank the next experiments by measured headroom, so the cheap, high-value ones run first.

Related earlier work, not repeated here: the LZ4 1.11 framework and validation notes on the JS-modules `codex/claude-handoff-2026-11-11` branch (`docs/codex-handoffs/claude-2026-11-11/`). That work covers worker transfer copies, queued-byte backpressure and memory budgets, and the Codex handoff thread owns it. The knowledge-base catalog and `js-modules-research/` hold earlier LFC-pack rounds (zstd tuning, adaptive chooser, FSST, ALP, Pcodec, OpenZL, Elias-Fano, chunks).

## Results so far (2026-11-11)

1. **Unpack time is mostly row building, not decompression.** zstd decoding takes 1 to 17% of `unpack()` time across 5 data sets and 3 browsers. Building the row objects takes 23 to 78%. So decoder-side upstream ideas (faster entropy decoding, SIMD varint and bit unpacking) can save at most a few percent of a full unpack. They are deferred until a column or query path (`unpackColumns`, `keys` reads) becomes the target.
2. **Pack spends 11 to 19% of its time compressing encodings that lose** on number and log data. zstd sees 3.9 times the bytes that end up in the file on sensor-style data, and 1.5 times on logs.
3. **ADOPT CANDIDATE B2: choose a column's encoding from a small sample (the BtrBlocks idea).** This prototype estimates every candidate from a 64 KB sample and compresses only the winner in full. Pack takes 0.86 to 0.96 of the time on 300,000-row sensor and log data in Chromium 156, Firefox 158 and WebKitGTK 2.52.6. The output is byte-for-byte the same on all 10 data sets, and the nested control set is unchanged (1.01 to 1.04).
4. **ADOPT CANDIDATE B1: UUID text to bytes with char codes.** The UUID column encoder called `replace` and `parseInt(substr)` 16 times per value. A table lookup gives the same bytes. Pack on UUID-heavy data takes 0.74 to 0.91 of the time on the first pack, or 0.69 to 0.98 on later packs, in all 3 browsers. It was never slower.
5. **ADOPT CANDIDATE B3 (added 8:10 AM Eastern): keep long numbers on the fast writer.** One number with more than 15 digits, more than 9 decimals, an exponent or `-0` made the fast flat writer give up on the whole block. The prototype keeps such numbers as text for that one column. Pack on such data takes 0.67 to 0.86 of the time in the three browsers, and one small first pack in WebKitGTK was even at 1.01. All three candidates stacked (B1 + B2 + B3) take 0.50 to 0.54 of the time on the UUID/hash/decimal set in Chromium 156. The output is byte-identical on 19 of 19 sets, and lfc-pack 0.8.1 reads the new files.
6. **Skipping zstd on incompressible frames (the Brotli and zstd raw-block idea) has little headroom.** Even on the UUID/hash/random set, frames that end up stored raw cost only 4 to 5% of pack time, because zstd is already quick on random bytes. Deferred.

7. **ADOPT CANDIDATE B14 (added 7:26 PM Eastern): build only the rows a range read keeps.** `unpack(file, { range })` built every row of each opened block and then dropped the rows outside the range. The prototype tests the range column first. A 1% time range takes 0.31 to 0.85 of the time in the three browsers, and 0.45 to 0.72 when only a few keys are asked for. A range that keeps every row is even (0.94 to 1.09). The rows are the same in 252 of 252 checks, and the format does not change (E7).
8. **Nulls in a typed column cost 11 to 16% of the file** on number and text columns, at any null share from 0.1% to 50%, because the column falls back to JSON text. A null plane would fix it, but it is a format change, and the real corpus barely has such columns. Proposal written, DEFER (E8).
9. **Small files carry 350 to 840 bytes of fixed parts.** Below about 100 rows, LFC-pack is larger than gzip of the same JSON (1.2 to 3.4 times at 10 to 20 rows). A built-in dictionary would save only 120 to 320 bytes per file, so it is not worth a format change. REJECT for now (E9).

10. **ADOPT CANDIDATE with B14 (added 9:10 PM Eastern): 4 MB blocks for flat data.** With B14, a 1% range read takes 0.12 to 0.29 of today's time on logs and sensors (0.56 to 0.78 on a mixed set), and the full read 0.81 to 1.02. Flat files grow up to 3.3%. Nested blocks lose 4 to 15% on full reads at 4 MB, so they stay at 13 MB (E10).
11. **The null plane stacks with B3b (added 9:20 PM Eastern).** A real prototype of the `N` type, stacked with mixed kinds: pack 0.65 to 0.86, full read 0.50 to 0.92, files 14 to 24% smaller on data with nullable columns in all 3 browsers. Files without such columns are byte-identical. Still a format change, so it goes to the owner (E11, `PROPOSAL-null-plane.md`). **On the real NYC taxi table it saves only 0.1 to 2.5%** (full reads 0.83 to 0.97), because its nullable columns are small categories (E14).
12. **Real zstd dictionaries save less than estimated, but the previous save is a big lever (added 9:20 PM Eastern).** A built-in dictionary saves 11 to 24% of a 10-row file, an app dictionary 15 to 28%. Using the previous version of the same document as the dictionary makes an edited 2,000-node map 6% of its size (22,845 to 1,258 bytes) and a 10-row append to 1,000 orders 10% (E12, new lead B17).
13. **Deltas stay small for hundreds of edits (added 9:30 PM Eastern).** Compressing each frame against the same frame of the previous save keeps a 2,000-node map at 3% of a full save after 1 edit and 16% after 500, and native zstd time drops to 0.25 to 0.75 of a full save. In the 3 browsers the zstd step of a delta save takes 0.23 to 0.37 of a full save's, and decoding 0.07 to 0.20 (E13).
14. **LFC-pack is 0.75 to 0.87 of Parquet's size (added 9:55 PM Eastern)** on the same real taxi rows (Parquet zstd-3 from pyarrow 26), and Brotli 11 of the JSON beats LFC-pack below about 100 to 200 rows (E14, E15).
15. **Stacked, the approved items beat the sum of their parts (added 10:05 PM Eastern)** on data with nullable columns: a 1% range read on the orders set takes 0.08 to 0.12 of today's time, against 0.16 to 0.28 if the gains were independent, because B14 picks typed values cheaply where it had to parse JSON text before. On the real taxi table the stack is even with 4 MB blocks alone for range reads (E16).
16. **In the browser, LFC-pack is the smallest and fastest to rows, but slowest to save (added 10:30 PM Eastern).** On the same taxi rows it is 0.85 of Parquet zstd-3's size and builds rows in 0.51 to 0.63 of parquet-wasm's time, but `packRows` takes 1.8 to 2.9 times parquet-wasm's save (E17, new lead B18).
17. **On real nested data LFC-pack reads faster than `JSON.parse` of the plain text (added 10:35 PM Eastern):** 0.57 to 0.83 of its time on 10,000 GitHub Archive events, and a 1% range read on the taxi rows takes 0.27 to 0.41 of DuckDB-wasm's time (E18).
18. **Saving from row objects without the JSON text step (B18b, added 11:43 PM Eastern):** over lfc-pack 0.9.3, `packRows` takes 0.51 to 0.90 of today's time on big tables in 3 browsers, with the same values and the same file size. A gate keeps today's exact bytes for small string-heavy tables, where the wasm text scanner is faster (E19).

Speed numbers come only from the three test browsers. Node was used only for pass/fail checks, byte counts and finding hot spots, never for timing.

## Environment and method

- **Machine:** a 4-core Linux x86_64 cloud container with 15 GB of RAM, shared and noisy. This is not a qualification device. Laptop, tablet and phone runs are still to do.
- **Browsers:** ungoogled Chromium 156.0.8078.79 (Playwright 1.63), Firefox 158.0 (WebDriver BiDi through puppeteer-core 25.16.0) and WebKitGTK 2.52.6 (WebKitWebDriver). All come from the knowledge-base `browsers` branch and ran one at a time.
- **Code:** JS-modules `main` at `69049ec` (lfc-pack 0.8.1) for E1 to E5; `537242c` (0.8.3) for E6 v3 and E7 to E12. The variants are string patches of the built `lfc-pack.js` (`experiments/mkvar.py`). Nothing in `modules/` was changed.
- **Data:** seeded, made-up data with no real records (`experiments/data.cjs`):
  - `logs`: web-log rows from `modules/lfc-pack/test/gen.cjs`.
  - `events`: nested rows from the same file.
  - `sensors`: time series with 2- and 6-decimal readings.
  - `ids`: UUID, 40-digit hex, full-precision decimals, 31-bit integers and base-36 tags. This is the incompressible set.
  - `repeat`: very repetitive settings rows.
  - Sizes: 1,000, 30,000 and 300,000 rows (about 0.1, 3 to 5, and 28 to 53 MB).
- **A/B method:** a fresh browser context for every page and every variant. The order of base and variant alternates each round, and each page packs 4 times. "First" is the first pack in the page. "Later" is the median of packs 2 to 4. Ratios are variant time over base time from the same round, so ratios are never divided across separate runs. The tables give the median ratio and its range over 6 to 8 rounds (Chromium sample set: 8, UUID: 6; Firefox and WebKitGTK sample sets: 6, UUID: 4). This is a research screen, not a ship gate. A release should use the early-stop A/B in `qa-guide/ab-sequential/`.
- **Not measured this round:** peak RSS and heap, allocation counts, memory bandwidth, CPU use, concurrency (packs ran single-threaded on the main thread), slow consumers, memory pressure, random access and query throughput. The backlog gives an experiment for each where it matters.

## Experiment log

### 2026-11-11 E1: where unpack and pack time goes

How it worked: a copy of the built file wraps zstd `compress` and `decompressView` with timers (`experiments/mkinst.py`). Each page runs pack, then `unpack`, then `unpackColumns` (typed columns, no row objects), then `JSON.parse` on the same text. Row building is `unpack` minus `unpackColumns`. Medians of the later runs, 300,000 rows:

| Data | Browser | Pack ms | zstd share of pack | Losing-candidate zstd share of pack | Unpack ms | zstd decode share of unpack | Row building share of unpack | JSON.parse ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| logs | Chromium 156 | 373 | 0.32 | 0.11 | 184 | 0.13 | 0.48 | 295 |
| logs | Firefox 158 | 374 | 0.33 | 0.11 | 168 | 0.17 | 0.23 | 384 |
| logs | WebKitGTK | 363 | 0.36 | 0.12 | 152 | 0.17 | 0.35 | 253 |
| sensors | Chromium 156 | 265 | 0.16 | 0.14 | 76 | 0.02 | 0.62 | 245 |
| sensors | Firefox 158 | 268 | 0.17 | 0.14 | 95 | 0.04 | 0.61 | 234 |
| sensors | WebKitGTK | 228 | 0.22 | 0.18 | 67 | 0.02 | 0.58 | 178 |
| ids | Chromium 156 | 1146 | 0.08 | 0.04 | 222 | 0.06 | 0.46 | 260 |
| ids | Firefox 158 | 1082 | 0.08 | 0.04 | 225 | 0.07 | 0.43 | 313 |
| ids | WebKitGTK | 984 | 0.10 | 0.05 | 141 | 0.10 | 0.34 | 224 |
| repeat | Chromium 156 | 134 | 0.02 | 0.01 | 58 | 0.01 | 0.77 | 213 |
| repeat | Firefox 158 | 150 | 0.02 | 0.01 | 74 | 0.01 | 0.78 | 204 |
| repeat | WebKitGTK | 149 | 0.02 | 0.01 | 66 | 0.02 | 0.78 | 175 |
| events (nested) | Chromium 156 | 365 | 0.10 | 0.00 | 246 | 0.05 | n/a | 498 |
| events (nested) | Firefox 158 | 390 | 0.10 | 0.00 | 226 | 0.05 | n/a | 520 |
| events (nested) | WebKitGTK | 420 | 0.10 | 0.00 | 134 | 0.11 | n/a | 462 |

A call "lost" when its output is not in the final file: either it lost to another candidate, or the frame was stored raw. Which calls won is worked out once in Node by finding each output's bytes in the file. The call order is the same in every runtime, so the browser timings for each call line up with those flags (`experiments/attrib.cjs`). `unpackColumns` reads only flat blocks, so nested data has no row-building figure. All rows: `results/breakdown-3-browsers.txt`. Chromium at 30,000 rows: `results/t-chromium.json`.

Bytes fed to zstd that did not end up in the file (`results/wasted-compression-bytes.txt`):

| Set, 300,000 rows | zstd calls | zstd input | Of which wasted |
|---|---:|---:|---:|
| sensors | 124 | 10.8 MB | 84% |
| ids | 37 | 22.0 MB | 67% |
| repeat | 133 | 3.0 MB | 72% |
| logs | 149 | 25.2 MB | 43% |
| events | 53 | 7.1 MB | 0% |

**What it means:** the data says to work on pack-side candidate choice and the slow writer paths, not on decoders. For a full `unpack`, any decoder-side technique is capped at the zstd decode share plus a slice of column decoding, mostly under 15%. Row building already beats `JSON.parse` on every set here (unpack takes 0.27 to 0.85 of the `JSON.parse` time) and has had many earlier rounds (catalog H/M items).

### 2026-11-11 E2 (B2): choose the encoding from a sample

**Upstream:** BtrBlocks (SIGMOD 2023, [repo](https://github.com/maxi-k/btrblocks), [ACM DOI 10.1145/3589263](https://dl.acm.org/doi/10.1145/3589263)) picks each block's encoding scheme by compressing a small sample with every candidate scheme, and then compresses the full block only with the winner. Per the paper, the sample is 10 runs of 64 consecutive values, about 1% of a block. The exact sample shape and the source file were not re-checked this session. The idea also shows up as "analyze, then compress" in columnar engines.

**What is algorithm-specific:** BtrBlocks cascades lightweight encodings (RLE, dictionary, frequency, FOR + bit-packing, Pseudodecimal, FSST) without a general-purpose entropy stage. **What transfers:** estimating each candidate's size on a spread-out sample makes choosing cost O(sample) per candidate instead of O(column). LFC-pack's candidates (`V`, `V` delta, `B`, `F`; `s`, `D` twice) each end in a zstd frame, so the sample estimate is "zstd on a 64 KB sample".

**Prototype** (`experiments/mkvar.py`, kind `sample`): `cand()` in both flat writers (`encodeColumn` and the fast writer) stops compressing each candidate in full. It works like this:
- Frames of 64 KB or less are compressed exactly, since they are cheap.
- Larger frames are estimated by compressing 4 evenly spaced 16 KB slices (8-byte aligned) and scaling the result, capped at the raw size.
- The candidate with the smallest estimate wins, and only that one is compressed in full, with the usual stored-raw fallback.
- Gates that read `best.size` (when to try `F`, and the 0.95 template margin) use the estimate.
- The template (`L`) candidate and nested blocks are unchanged.

**Result:** the output is byte-identical to lfc-pack 0.8.1 on all 10 data sets (`experiments/verify.cjs`). zstd input bytes fall from 10.8 to 5.5 MB on sensors, from 25.2 to 20.9 MB on logs, and from 22.0 to 20.0 MB on ids (300,000 rows). Pack time, variant over base:

| 300,000 rows | Chromium 156 first / later | Firefox 158 first / later | WebKitGTK first / later |
|---|---|---|---|
| sensors | 0.85 (0.77-0.96) / 0.86 (0.77-1.03) | 0.91 (0.76-1.15) / 0.92 (0.79-1.43) | 0.91 (0.88-1.08) / 0.90 (0.76-0.98) |
| logs | 0.98 (0.90-1.07) / 0.92 (0.87-1.03) | 0.92 (0.77-1.14) / 0.96 (0.78-1.03) | 0.91 (0.74-1.03) / 0.94 (0.87-1.05) |
| events (control, no candidates) | 1.01 / 1.04 | 1.02 / 1.01 | 1.04 / 1.02 |

The savings match what E1 predicted (0.81 to 0.86 of pack for sensors, 0.88 to 0.89 for logs). Firefox ranges are wide, so the medians are the figures to use.

**Risk:** the sample can pick the wrong encoding and make a file bigger. Nothing like that happened on these 10 sets, but they are made-up data. Two guards before shipping:
- If the best two estimates are within 2% of each other, compress both in full and keep the smaller. This restores exact choice for close calls, at a small cost.
- Size gate: every file in the real-data corpus (`test/real.cjs` inputs, FHIR, Netflow maps, Workbench imports) must be at or below its 0.8.1 size, or the owner approves the difference. Per the owner's rule, a file can never be larger than plain zstd.

No format change: readers see ordinary frames. **Decision: ADOPT CANDIDATE**, pending the two guards and a three-browser early-stop A/B in the code thread.

### 2026-11-11 E3 (B1): UUID text to bytes with char codes

Found by a Node CPU profile of the `ids` pack (hot-spot finding only, no Node times quoted). The `U` encoder in `encodeColumn` used `v[i].replace(/-/g, '')` and then `parseInt(hx.substr(j, 2), 16)` 16 times per value. The `H` (hex) encoder right above it already uses the `hexv(charCodeAt)` table. The variant uses the same table and skips the four dashes (one line, `experiments/mkvar.py`, kind `uuid`).

**Result:** byte-identical output on all 10 sets. Pack time, variant over base:

| Rows | Chromium 156 first / later | Firefox 158 first / later | WebKitGTK first / later |
|---|---|---|---|
| ids 300,000 | 0.81 (0.78-0.81) / 0.74 (0.69-0.79) | 0.91 (0.85-0.91) / 0.98 (0.92-1.09) | 0.78 (0.70-0.91) / 0.74 (0.69-0.91) |
| ids 30,000 | 0.86 (0.81-0.92) / 0.76 (0.62-0.84) | 0.89 (0.63-0.98) / 0.69 (0.53-0.84) | 0.84 (0.74-0.90) / 0.86 (0.83-0.88) |

The principle is the one byte codecs use everywhere: table lookups on code units, with no per-byte string building. It is not an upstream algorithm. **Decision: ADOPT CANDIDATE** (no format or behavior change, same bytes). The regex checks before it (`RX_UUID`, `RX_HEX`, about 8% of the `ids` profile) could be merged into the same pass later.

### 2026-11-11 E5 (B3): keep long numbers on the fast flat writer

**Cause:** `wasm/flatscan.c` reads numbers as a mantissa of at most 15 digits plus up to 9 fraction digits. On anything else it calls `BAIL(10/11/12)`: more digits, an exponent, `-0`, or more decimals. That stops the fast writer for the whole block, and `JSON.parse` re-reads every row. A single column of `Math.random()`-style values is enough.

**Prototype** (`experiments/b3-long-numbers.diff`, 38 changed lines):
- A strict JSON-number scanner, `numspan`, replaces those bail-outs.
- The key becomes type 6, and the cell keeps the number's byte span.
- In JS, a type-6 column reads span cells with `Number(text)`. Earlier plain cells of the same key are read as mantissa / 10^digits, which is exactly the value `JSON.parse` gives, because both parts are exact doubles and one division rounds correctly.
- The column then goes through `encodeColumn`, as in the general writer, with the same zone-map entry.
- Invalid number text still bails as before.
- **Layout guard (added 9:52 AM Eastern):** in auto mode, 0.8.1 compares the nested and flat layouts for a block that the fast writer declines, when the block is 256 KB or smaller or its first lines fail `looksFlat`. A block the fast writer now keeps only through the fallback would skip that comparison and could come out larger. So the fast writer tags such a result (`k67`), and `api.js` drops it in exactly those cases. Without the guard, 7 of 21 small mixed-kind sets in E6 came out different (up to 1.65x larger). With it, every set is byte-identical. The speed results below come from 3 MB and larger blocks, where the guard does not apply.
- Built with the repo's own `wasm/build-flatscan.sh` (clang 18.1.3). `tpl4.wasm` and `rowscan.wasm` came out byte-identical to the committed files.

**Checks:**
- `node test/run.js`: all lfc-pack checks pass.
- `experiments/b3verify.cjs`: 19 data sets (rerun with the guard; still identical; `b7verify.cjs` adds 22 more), the 10 research sets plus 9 number edge sets (exponents in both letter cases, `-0` every third row, values past 2^53, 5e-324, long decimals appearing half way down a column, 1e300 mixed with small integers). Files are byte-identical to lfc-pack 0.8.1, rows equal `JSON.parse`, `-0` is kept, and the 0.8.1 reader reads the new files.
- A CPU-profile check confirms the `ids` block now stays on the fast writer.

**Pack time, variant over base** (same bytes in every run):

| Rows | Chromium 156 first / later | Firefox 158 first / later | WebKitGTK first / later |
|---|---|---|---|
| ids 300,000 | 0.71 (0.65-0.80) / 0.76 (0.69-0.85) | 0.78 (0.63-0.86) / 0.75 (0.63-0.78) | 0.67 (0.66-0.71) / 0.82 (0.78-0.82) |
| ids 30,000 | 0.75 (0.63-0.89) / 0.75 (0.70-0.81) | 0.73 (0.70-0.99) / 0.86 (0.68-0.99) | 1.01 (0.95-1.05) / 0.87 (0.78-1.16) |
| logs 300,000 (control, same path) | 0.95 / 0.94 | 0.95 / 0.99 | 0.91 / 1.02 |

**All stacked, Chromium 156, 5 rounds** (`results/ab-summary-b3-stack.txt`): B1 + B2 + B3 against 0.8.1 gave ids 0.50 (0.48-0.60) first / 0.54 (0.52-0.62) later, sensors 0.88 / 0.92, and logs 1.01 / 1.04, which is neutral within noise. B1 + B2 without B3 gave ids 0.78 / 0.73. The gains add up: B3 removes the `JSON.parse` re-read, and B1 makes the UUID column cheap once it gets there. On logs, B2's gain was 0.92 in the 8-round run and about 1.0 in this 5-round run, so treat logs as "about neutral to 0.92".

**Not covered:** the scanner's other bail-outs (values of 2^50 or more after scaling, which `gather` returns as 1; escapes; integer-like keys) still send the whole block to the slow writer. Each could get the same per-column fallback. Counting how often real files hit each bail-out is the next cheap step. **Decision: ADOPT CANDIDATE.** It needs a wasm rebuild, and the gate is the normal test suite, the byte-identity set and a three-browser early-stop A/B.

### 2026-11-11 E6 (B3b): keys with more than one kind of value (for example numbers with some nulls)

**Real-corpus count** (`experiments/mkbail.py` + `bailcount.cjs`, counts only). The six corpus files used by earlier lfc-pack rounds are FHIR 21 MB, gen_logs, gen_config, gen_sparse, nd_dense and events-10x, cut at 13 MB and packed in 1 MB blocks. Reasons the fast writer gave up:

| File | Blocks | Fast writer gave up because |
|---|---|---|
| fhir | 13 nested | nested object value (code 13) x12, list item over 32 bits (code 9) x1 |
| events-10x | 13 nested | nested object value x13 |
| gen_config | 4 flat | nested object value x4 (written as flat with JSON-text columns) |
| gen_sparse | 1 flat | **a key with two kinds of value (code 8)** x1 |
| gen_logs, nd_dense | 8 flat | none |

Code 13 blocks belong to the nested layout anyway, and the scan stops at the first nested value, so little is wasted. Code 8 is the interesting one. A key whose values are of more than one JSON kind sends the whole block to the `JSON.parse` writer. That includes the very common nullable number or nullable string column.

**Headroom** (Chromium 156, made-up `sensors` data, 3 fresh pages each): with 1% of one column set to `null` (`sensnull`), or to the string `"n/a"` (`sensstr`), pack goes from 256-327 ms to 457-604 ms at 300,000 rows (later packs). First packs go from 336-389 ms to 626-757 ms. That is 1.6 to 2x slower from 1% nulls. Unpack is unchanged (91-126 ms against 105-125 ms). The file is 4.3% larger, because that column becomes JSON text (`j`) instead of `V`/`B`. That size cost is backlog item B13.

**Prototype** (`experiments/b3b-mixed-kinds.diff`, which includes B3 and the layout guard):
- The scanner's `BAIL(8)` sites in the number, string, true/false and null branches jump to one `mixed` handler.
- That handler turns the key into type 7 and keeps its first type in `kmaxfd`.
- From then on, each of that key's cells is the value's literal byte span, marked `cfd 255`. A first try used `cfd 3`, which collides with numbers that have 3 decimals; the edge set `nullnum` caught that.
- Lists and objects still bail.
- In JS, cells from before the switch decode by the first type's rule. All literal cells of a key are joined into one `[..]` text and read with one `JSON.parse`.
- The column then goes through `encodeColumn`, exactly as in the general writer.

**Checks:**
- `node test/run.js` passes.
- `experiments/b7verify.cjs` covers 41 sets: 21 mixed-kind edge sets, the research sets and the 6 real corpus files. The edge sets are nullable numbers with 3 decimals, nullable strings, string/number mixes, escapes and non-ASCII including emoji, bool/number mixes, long numbers with `-0`, `1e300` and `"n/a"`, and nulls only near the end of a column, each at 50, 3,000 and 70,000 rows. Rows equal `JSON.parse`, the 0.8.1 reader reads every file, and with the guard all 41 files are byte-identical to 0.8.1.

**First-version pack time against 0.8.1** (`results/ab-summary-b3b.txt`): on 1% nulls or strings in one column, pack took 0.47 to 0.82 of the time in the 3 browsers. **That run tested only the easy case and missed the worst case.** The orchestrater relayed a lesson from shipping B3 as lfc-pack 0.8.3 (PR 655): with every column on the fallback, the first B3 patch was 1.1 to 1.6x slower in Firefox and WebKitGTK. It was fixed by slicing already-decoded text.

**Worst-case round (2026-11-11, 10:04-10:39 AM Eastern, rebased on lfc-pack 0.8.3):**

New sets (`experiments/worst.cjs`, `experiments/mixk.cjs`):
- `allmix`: 13 columns. 6 nullable decimals and 3 nullable strings, all null in the first row, plus 3 number/string mixes. About 92% of cells take the fallback. ASCII and non-ASCII (`allmixu`) versions, 30,000 and 300,000 rows (5 to 50 MB).
- `mixK`: K of 12 columns nullable from the first row, about K/13 of the cells on the fallback.

Three versions:
1. **v1 (per-cell lists in JS, then slice and join):** Chromium worst case 1.22 to 1.48x slower.
2. **v2 (wasm joins each key's literals with a new `litjoin` export; one `JSON.parse` per key):** still 1.09 to 1.22x slower on `allmix`. Break-even in Chromium: `mix1` 0.65, `mix3` 0.72, `mix6` 0.89, `mix9` 0.96. Past about half the cells, one `JSON.parse` of the whole block (the other writer) is just as good.
3. **v3 (shipped candidate):** v2 plus an early stop. The scanner counts fallback cells and gives up (new code 18) at any 4,096-row mark, or at the end, once they are more than half of all cells. The block then goes to today's writer, and only up to 4,096 rows of scanning are wasted. This needed wasm scratch for the cell lists and join buffer even in blocks with no text column; the first v2 build crashed on number-only blocks until that was added. `experiments/b3b-mixed-kinds.diff` is against lfc-pack 0.8.3.

**v3 checks:** `node test/run.js` passes. `b7verify.cjs` now covers 50 sets, adding the worst-case and `mixK` sets: all byte-identical to 0.8.3, rows equal `JSON.parse`, and the 0.8.3 reader reads every file. The give-up counter confirms `allmix` and `mix9` go to the old writer (code 18 on all 4 blocks), while `mix6` and `sensnull` stay fast.

**v3 pack time against 0.8.3** (5 rounds, 3 packs per page; `results/ab-summary-b3b-v2.txt`):

| Set | Chromium 156 first / later | Firefox 158 first / later | WebKitGTK first / later |
|---|---|---|---|
| allmix 300,000 (worst, cut over) | 1.03 / 0.96 | 0.97 / 0.98 | 1.03 / 0.94 |
| allmixu 300,000 (worst, non-ASCII) | 0.97 / 0.95 | 0.99 / 1.02 | 0.98 / 0.94 |
| allmix 30,000 | 0.89 / 0.94 | 1.05 / 1.05 | 1.00 / 1.01 |
| mix9 (about 70%, cut over) | 1.00 / 0.99 | 0.98 / 1.00 | 0.91 / 1.02 |
| mix6 (about 46%) | 0.85 / 0.84 | 0.93 / 0.84 | 0.83 / 0.92 |
| mix3 (about 23%) | 0.78 / 0.71 | 0.81 / 0.76 | 0.68 / 0.70 |
| sensnull (1% nulls in one column) | 0.62 / 0.70 | 0.71 / 0.63 | 0.67 / 0.50 |
| logs (control) | 1.05 / 1.06 | 1.03 / 1.03 | 1.07 / 1.14 |
| nd_dense (real corpus, control) | 0.99 / 1.02 | 0.97 / 1.02 | 1.08 / 1.04 |

The controls in the 5-round run read 1.03 to 1.14 in places, with wide ranges (0.79 to 1.24). An 8-round WebKitGTK rerun of the controls gave logs 1.02 / 1.02, nd_dense 1.04 / 0.99 and sensors 1.01 / 0.97. That is within noise, but the median of the first pack sits slightly above 1. The scanner does one more type check per value. **The ship gate must run an early-stop A/B on plain flat data in all three browsers and confirm the change costs less than 5%.**

**Decision: ADOPT CANDIDATE (v3)**, with that control gate. Lessons recorded:
- Always time the case where every cell takes a new slow path, not only the case it was built for.
- Per-cell JS work on a fallback can cost more than the slow path it replaces. Hand the work to one native `JSON.parse` per column, and cut over to the old path past the break-even point.

### 2026-11-11 E4: skip zstd on incompressible frames (measured headroom only)

**Upstream:**
- Brotli's encoder `ShouldCompress` ([encode.c](https://github.com/google/brotli/blob/master/c/enc/encode.c), checked on `master` this session) samples every 13th byte (`kSampleRate = 13`) into a 256-bin histogram. It skips compressing when the data is nearly all literals (`num_literals > 0.99 * bytes`, inside `num_commands < (bytes >> 8) + 2`) and the estimated entropy is above `kMinEntropy = 7.92` bits per byte.
- zstd stores a block raw when compressing does not shrink it.
- LZ4 (`LZ4_skipTrigger = 6`, [lz4.c](https://github.com/lz4/lz4/blob/dev/lib/lz4.c), `dev` branch) and Snappy ("heuristic match skipping": `skip = 32`, `bytes_between_hash_lookups = skip >> 5`, [snappy.cc](https://github.com/google/snappy/blob/main/snappy.cc)) both widen the search step after repeated misses, so they move quickly through random input.

**Measured headroom:** on the `ids` set, frames that end up stored raw (UUID, hex, random doubles) cost 4 to 5% of pack time in all three browsers (E1). zstd already moves fast through random bytes, and LFC-pack's fast writer already stops a losing candidate once it overflows its byte limit. **Decision: DEFER.** The ceiling is under 5%, and an order-0 entropy check cannot see repeated IDs (foreign keys), so it could make some files bigger. If ever done, combine it with B2: a sample that does not compress marks the frame stored.

### 2026-11-11 E7 (B14): where column and filtered reads spend their time

Asked by the owner ("Do first 3", lead 1), 6:45 PM Eastern. Code: JS-modules `main` at `537242c` (lfc-pack 0.8.3). Same browsers and machine as above.

**Method:** `experiments/rddrive.cjs` opens one fresh page per set, packs once, then times each read mode 5 times after one warm-up call (median). The decompress hook of `mkinst.py` gives the zstd share. Modes: `rowsAll` = `unpack(file)`; `rows2` = `unpack(file, { keys: [2 keys] })`; `colsAll` and `cols2` = `unpackColumns` with all or 2 keys; `range10` and `range1` = `unpack(file, { range })` over the first 10% or 1% of a key's span; `lazy2` = `{ rows: 'lazycols' }` reading 2 keys of every row.

**Time of each mode against a full `unpack`** (median ms ratio; Chromium / Firefox / WebKitGTK):

| Set (blocks) | `rows2` | `cols2` | `colsAll` | `range1` | `lazy2` |
|---|---|---|---|---|---|
| logs, range on `ts` (4) | 0.17 / 0.20 / 0.28 | 0.10 / 0.10 / 0.12 | 0.96 / 0.82 / 0.69 | 0.30 / 0.30 / 0.29 | 0.53 / 0.63 / 0.57 |
| sensors, `ts` (3) | 0.50 / 0.37 / 0.39 | 0.12 / 0.14 / 0.13 | 0.27 / 0.41 / 0.36 | 0.40 / 0.44 / 0.28 | 0.47 / 0.64 / 0.43 |
| sensnull, `ts` (3) | 0.37 / 0.31 / 0.25 | 0.10 / 0.15 / 0.13 | 0.39 / 0.55 / 0.46 | 0.41 / 0.43 / 0.34 | 0.34 / 0.85 / 0.38 |
| ids, range on random `k` (4) | 0.38 / 0.28 / 0.43 | 0.20 / 0.20 / 0.27 | 0.85 / 0.82 / 0.75 | 0.97 / 1.03 / 0.87 | 0.55 / 0.66 / 0.59 |
| nd_dense, `amount` (1) | 0.16 / 0.27 / 0.22 | 0.10 / 0.09 / 0.11 | 0.76 / 0.82 / 1.00 | 0.76 / 0.91 / 1.11 | 0.48 / 0.45 / 0.78 |
| events, nested (4) | 0.57 / 0.58 / 0.64 | n/a | n/a | 0.22 / 0.23 / 0.22 | 0.97 / 0.96 / 0.74 |

Full table with milliseconds and zstd shares: `results/rd-<browser>.json` (`python3 experiments/rdanal.py`).

**What it shows:**
1. **zstd is still a small share.** 0 to 40% of a mode's time, usually under 20%; the highest shares are on tiny reads of 1 to 3 ms. Decoder ideas (B5) stay deferred.
2. **A range read opens whole blocks and then builds every row in them.** `range1` costs the same as `range10` (logs 0.30 against 0.32 in Chromium), because a default block holds 13 MB of text (75,000 to 100,000 rows), and `unpack` builds all row objects of an opened block before `keepRows` drops the ones outside the range. On a key whose values are not in order (`ids`, `k`), no block can be skipped, so a 1% range costs as much as a full read. This is the lead for B14.
3. **Rows with a few keys cost 2 to 5 times the columns.** `rows2` against `cols2`: sensors 48.6 against 11.6 ms in Chromium. A Node profile of `unpack(file, { keys })` on sensors gives 50% garbage collection, 18% `assemble`, 10% column decoding. In a Node micro-test on the same columns, building `{ ts, temp }` with an object literal takes 9 ms for 300,000 rows. The library's way (empty object, then one keyed store per column) takes 29 to 45 ms. Generated code (`new Function`) is 4 to 7 times faster than every non-generated way tried (column-major, row-major, template clone). That path already exists as `rows: 'generated'`, and it is opt-in because the page rules (CSP) forbid `eval`. No CSP-safe way matched it, so this is recorded, not proposed (B15).
4. **`unpackColumns` with all keys is barely faster than rows on string-heavy data** (logs 0.69 to 0.96): making the JS strings is the cost, not the rows.

**B14 prototype: test the range first, build only the matching rows** (`experiments/b14-range-late-rows.diff`, about 45 added or changed lines in `src/flat.js` and `src/api.js`). This is "late materialization" from column stores (Abadi, Myers, DeWitt and Madden, "Materialization Strategies in a Column-Oriented DBMS", ICDE 2007; not re-fetched this session): decode the filter column, keep a list of matching row numbers, then build objects for those rows only. Two cutovers keep the old path where it is faster: a block that the footer's number ranges show is wholly inside the range skips the test, and a block where more than half the rows match goes the old way (reusing the decoded range column). Nested blocks, key-order lists, `__proto__` keys and lazy or generated rows also go the old way.

Correctness: `selverify.cjs` compares the JSON text of the rows from 0.8.3 and the prototype for 6 ranges (1%, 10%, a middle 1%, everything, none) times 3 key choices: 0 differences in 252 checks on 8 made-up sets and 6 real corpus files (FHIR, GitHub events, gen_logs, gen_sparse, gen_config, nd_dense).

Paired fresh pages, alternating order, 4 rounds, 5 timed reads per mode (ratio of medians, prototype / 0.8.3; Chromium / Firefox / WebKitGTK):

| Set | 1% range | middle 10% | 1% range, one other key |
|---|---|---|---|
| sensors | 0.31 / 0.52 / 0.52 | 0.36 / 0.48 / 0.75 | 0.45 / 0.48 / 0.69 |
| sensnull | 0.40 / 0.49 / 0.54 | 0.47 / 0.62 / 0.56 | 0.46 / 0.50 / 0.62 |
| logs | 0.68 / 0.71 / 0.73 | 0.63 / 0.93 / 0.77 | 0.59 / 0.57 / 0.67 |
| ids (unordered key, every block opened) | 0.70 / 0.77 / 0.85 | 0.69 / 0.78 / 0.84 | 0.61 / 0.68 / 0.72 |
| mix3 | 0.58 / 0.63 / 0.74 | 0.56 / 0.73 / 0.76 | 0.48 / 0.54 / 0.63 |
| nd_dense (1 block) | 0.71 / 0.78 / 0.78 | 0.85 / 0.81 / 0.89 | 0.55 / 0.50 / 0.50 |
| events (nested, control: no code change) | 0.96 / 0.91 / 1.00 | 1.09 / 1.01 / 1.08 | 0.99 / 1.07 / 1.03 |

**Worst case (the rule from E6):** a range that keeps every row, or 90% of rows. The first version, without the cutovers, was up to 1.35 times slower in Chromium (nd_dense). With them, each mode on its own fresh page, 6 rounds:

| Set | everything: C / F / W | 90%: C / F / W |
|---|---|---|
| sensors | 0.98 / 0.99 / 0.94 | 1.02 / 0.99 / 0.95 |
| sensnull | 1.03 / 0.98 / 0.95 | 1.01 / 1.06 / 1.08 |
| logs | 1.03 / 1.02 / 1.01 | 1.03 / 0.97 / 0.94 |
| nd_dense | 0.95 / 1.00 / 1.00 | 1.02 / 1.09 / 1.04 |
| events (control) | 1.01 / 1.02 / 0.95 | 0.96 / 0.98 / 1.02 |

That is within the control's noise (0.95 to 1.02). One caveat: when the same page ran narrow ranges first and then a range that keeps every row, the wide range read 1.04 to 1.29 times slower. The narrow ranges no longer warm up the shared row builder, so it is still running colder code. A page that loads the whole file first (the usual case) warms it up. **The ship gate must time that sequence too.** (Firefox and WebKitGTK timers round to 1 ms, so nd_dense ratios there move in steps of about 0.09.)

**Decision: ADOPT CANDIDATE (B14)**, read path only, no format change, same rows. Gates: the early-stop A/B on plain full reads and on the narrow-then-wide sequence in all three browsers, plus `node test/query.cjs` and the rest of the suite.

### 2026-11-11 E8 (B13): what `null` costs in a typed column

Lead 2. Made-up pairs from the 300,000-row sensor set (`experiments/mknull.py`): one key set to `null` in a random share of rows, and the same key left out of those rows. Left out is stored as a typed column plus a presence plane, which is what a null plane would cost, so it stands in for the proposal. Sizes come from Node (they do not depend on the engine).

| Column (encoding) | 0.1% null | 1% | 10% | 50% |
|---|---|---|---|---|
| `temp`, slowly changing decimals (`V` delta) | +14.6% | +14.6% | +15.9% | +14.3% |
| `dev`, 40 names (`D`) | +11.5% | +11.7% | +13.1% | +12.8% |
| `ok`, true/false (`T`) | +0.9% | +1.1% | +2.8% | +4.3% |

File growth with `null` against left out. One `null` in 1,000 rows costs as much as many, because the whole column falls back to JSON text (`j`).

Read time, one fresh page per file, 7 reads (median ms, `null` file → left-out file):

| | Chromium | Firefox | WebKitGTK |
|---|---|---|---|
| `unpackColumns`, `temp` 1% | 45.3 → 29.8 | 50 → 28 | 37 → 24 |
| `unpackColumns`, `dev` 1% | 59.3 → 26.2 | 57 → 28 | 57 → 25 |
| `unpackColumns`, `temp` 10% | 45.5 → 26.7 | 55 → 28 | 40 → 21 |
| `unpack`, `temp` 1% | 106 → 96 | 79 → 92 | 62 → 55 |
| `unpack`, `dev` 1% | 120 → 92 | 86 → 68 | 78 → 52 |
| `unpack`, `temp` 10% | 136 → 96 | 87 → 96 | 63 → 51 |

Column reads take 0.44 to 0.66 of the time. Row reads take 0.67 to 0.90, except Firefox on `temp`, where the left-out file read 1.10 to 1.16 times slower (sparse rows cost more there). One pass per browser, so treat the row numbers as rough.

**Real corpus:** only 2 of 8 files have a key holding one kind of value plus `null`: `mixed.ndjson` (`n`, 33% null, but the file is nested) and `nd_gen_logs` (`cache`, true/false, 34% null): 1.4% smaller if left out. There is no database export in the corpus, which is where such columns are common.

**Decision: DEFER, proposal written** (`PROPOSAL-null-plane.md`): a new column type `N` wrapping the typed column plus a null plane, so 0.8.x readers refuse such files instead of misreading them. Needs a real nullable workload first.

### 2026-11-11 E9 (B7): small files, app saves and a built-in dictionary

Lead 3. Inputs: the first 10, 100 and 1,000 rows of the made-up sets and of FHIR and gen_logs, plus Netflow map saves cut from `netflow-map/test/maps/netflow-test-map-2000.json` (20, 200 and 2,000 nodes, saved with `packTables` the way `src/app/75-mapfile.js` does). `experiments/ovh.cjs` splits each file into its parts. Sizes only (Node).

- **Fixed parts are 350 to 840 bytes per file:** trailer 16, footer 144 to 330, block headers 47 to 148, meta 155 to 400 (flat blocks), planes 17 to 141 below 1,000 rows. That is 39 to 81% of a 10-row file (FHIR, with long rows: 9%), 4 to 41% at 100 rows and 1 to 12% at 1,000 rows.
- **Against gzip -9 of the JSON:** at 10 to 20 rows LFC-pack is 1.2 to 3.4 times larger (Netflow 20 nodes: 1,034 against 308 bytes). At 100 rows it is 0.76 to 0.98 of gzip; at 1,000 rows 0.45 to 0.74.
- **Built-in dictionary, estimated** (`experiments/dict.cjs`: `c(D + x) - c(D)` + 6 at zstd level 3, D = footer and meta text of the other file families): saves 120 to 320 bytes per file, 15 to 31% of a 10-row file (FHIR 2.5%), 1 to 16% at 100 rows, 1 to 3% at 1,000 rows. A 10-row file stays larger than its gzip.
- **No-format-change option:** a raw block (the whole text as one zstd frame) for tiny inputs gives logs 10 rows 647 bytes (flat 834) and sensors 403 (639), but loses at 100 rows, and `unpackColumns` refuses raw blocks.

**Decision: REJECT the dictionary for now** (format change for a few hundred bytes; owner's rule is speed over size). Proposal with the numbers: `PROPOSAL-small-file-dictionary.md`. Revisit only if many small files are stored side by side.

### 2026-11-11 E10 (B16): smaller blocks for range reads

Owner's pick on the B14 card: "Test smaller blocks first". Same 4 sets as E7 (300,000 rows each; `events` is nested), packed with `blockBytes` of 13 MB (today), 4 MB and 1 MB, read with 0.8.3 (`r83`) and with B14 (`sel`). 4 rounds, paired fresh pages, ratio of medians against `r83` at 13 MB (`experiments/bsanal.py`, `results/rdab-*-bs.json`). `r1` is a 1% time range, `mid10` a 10% range, `keys1` one column.

4 MB blocks with B14, against today:

| Set | size | pack | full read | 1% range | 10% range | one column |
|---|---|---|---|---|---|---|
| logs (Chromium / Firefox / WebKitGTK) | +0.4% | 0.87 / 0.96 / 0.88 | 0.81 / 0.89 / 0.94 | 0.17 / 0.25 / 0.29 | 0.44 / 0.58 / 0.68 | 0.21 / 0.25 / 0.33 |
| sensors | -0.3% | 0.94 / 0.95 / 0.97 | 0.92 / 0.91 / 0.82 | 0.12 / 0.15 / 0.22 | 0.11 / 0.13 / 0.21 | 0.19 / 0.20 / 0.25 |
| mix3 (3 families mixed) | +3.3% | 0.91 / 0.98 / 0.91 | 1.02 / 0.92 / 1.01 | 0.59 / 0.56 / 0.78 | 0.59 / 0.53 / 0.83 | 0.48 / 0.59 / 0.58 |
| events (nested) | +7.5% | 0.85 / 0.97 / 0.92 | **1.04 / 1.15 / 1.12** | 0.22 / 0.37 / 0.33 | 0.20 / 0.36 / 0.35 | 0.28 / 0.32 / 0.33 |

- 1 MB blocks cut a 1% range to 0.04 to 0.12 on logs and sensors (mix3 0.57 to 0.88), but sensors pack took 1.09 to 1.24 times longer and the nested set's full read 1.05 to 1.21 times longer. Size grows up to 3.5% (flat) and 11.5% (nested).
- B14 and smaller blocks stack: blocks decide how much is opened, B14 how much of it is built. On sensors, `r1` goes 0.33 (B14 alone) and 0.21 (4 MB alone) to 0.12 (both) in Chromium.
- The mixed set gains least, because its time key is shared by 3 families with different ranges, so the zone maps skip fewer blocks.

**Decision: ADOPT CANDIDATE with B14: 4 MB blocks for flat blocks only**, nested blocks stay at 13 MB. No format change (block size is a writer choice). Gate: full-read ratio at most 1.05 on flat sets and a size gate on the real corpus.

### 2026-11-11 E11 (B13): a real null-plane prototype, and stacking it with B3b

Owner: "more testing and stacking of null handling and dictionaries". `experiments/b13-patch-null.py` (diff: `b13-null-plane.diff`, about 20 lines in `src/flat.js`) adds the type `N` from `PROPOSAL-null-plane.md` to a copy of 0.8.3: a column of one scalar kind plus nulls keeps the typed encoding of its non-null values, and frame 0 is the null bitmap. Readers: the copy only. Checks (`experiments/nverify.cjs`): same rows (key-sorted compare) on all 21 test files, and the module's tests pass on the copy.

Sizes (Node; sizes do not depend on the engine; data from `experiments/mkshapes.py`):

| Data | file size with the null plane |
|---|---|
| made-up orders export, 300,000 rows (6 nullable columns: a date, 3 numbers, a text, a true/false) | -23.9% |
| 3 nullable columns (temp, hum, dev, 5% null each) | -24.5% |
| nulls in runs of 200 rows (1% and 10% null) | -12.3% to -12.7% |
| real `nd_gen_logs` (`cache`, true/false) | -0.9% |

- Against a spare out-of-range number (-999) or a sentinel text instead of `null`, the null plane is up to 5.5% smaller on numbers and equal on text.
- Choosing per column between `N` and JSON text (`__NULLMODE=both`) gained nothing: `N` won every time.
- Stacked with B3b v3 (mixed kinds stay on the fast writer), Node pack of orders: 794 ms (0.8.3), 629 (B3b), 637 (`N`), 450 (both). Browser times below.

Browser timing: 100,000-row cuts of three sets, `rdab.html` with `ONLY=full,keys1`, 4 paired rounds of 3 reads, ratio of medians against 0.8.3 (`experiments/nlanal.py`, `results/rdab-*-nl.json`). `N` = null plane alone, `B3b` = mixed kinds v3 alone, `both` = stacked. Each cell is Chromium / Firefox / WebKitGTK.

| Set (size change with `N`) | build | pack | full read | one column |
|---|---|---|---|---|
| orders (-23.5%) | `N` | 0.89 / 0.83 / 0.89 | 0.54 / 0.60 / 0.71 | 1.07 / 1.00 / 0.91 |
| | `B3b` | 0.85 / 0.90 / 0.91 | 1.03 / 1.10 / 1.03 | 0.96 / 0.91 / 0.91 |
| | both | **0.75 / 0.69 / 0.76** | **0.50 / 0.62 / 0.65** | 0.96 / 1.09 / 1.00 |
| 3 nullable columns (-24.3%) | `N` | 0.98 / 1.05 / 0.88 | 0.51 / 0.58 / 0.59 | 0.52 / 0.69 / 0.74 |
| | `B3b` | 0.90 / 0.93 / 0.82 | 1.00 / 1.07 / 1.04 | 0.87 / 1.14 / 1.13 |
| | both | **0.80 / 0.86 / 0.71** | **0.54 / 0.64 / 0.64** | 0.68 / 0.69 / 0.57 |
| temp 10% null (-13.6%) | `N` | 0.99 / 1.02 / 0.89 | 0.75 / 0.81 / 0.85 | 0.61 / 0.58 / 0.69 |
| | `B3b` | 0.80 / 0.75 / 0.69 | 1.01 / 1.00 / 1.10 | 1.05 / 0.91 / 0.88 |
| | both | **0.81 / 0.71 / 0.65** | **0.80 / 0.83 / 0.92** | 0.67 / 0.64 / 0.62 |

- Stacked, pack takes 0.65 to 0.86 of the time and a full read 0.50 to 0.92, with files 14 to 24% smaller. The two ideas add up: B3b removes the slow writer path, the null plane removes the JSON-text column on both write and read.
- One column read on orders (`total`, which has no nulls; 5.5 to 6.2 ms) showed 1.45 in WebKitGTK for `both` in this run; 8 more rounds on its own page gave 1.00 (`results/rdab-webkit-nlk.json`). Treated as noise.
- `N` alone is up to 1.05 slower to pack in Firefox on the 3-column set; stacked with B3b it is never slower.
- Files with no nullable typed column are unchanged: the writer only picks `N` for a column of one kind plus nulls, so every other file is byte-identical (checked on 9 files without such columns, `experiments/ident.cjs`).

### 2026-11-11 E12 (B7): real zstd dictionaries for small files, and the previous save as a dictionary

E9 estimated a built-in dictionary with `c(D + x) - c(D)`. This round uses the real thing: the system `libzstd` 1.5.5 already on the test box, called from Python `ctypes` (`experiments/zdict.py`; no download, nothing installed). `experiments/dumpfr.cjs` dumps every zstd frame of a packed file; each frame is recompressed at level 3 with a dictionary and the smaller of old and new is kept. Frames stored without zstd are left as they are. Plain level 3 without a dictionary reproduces today's sizes (to 1 byte), so the method is sound.

Dictionaries tried, none ever built from the file it is tested on:
- **Built-in** (`static`): footer and meta frames of the other data families, as raw content (16 KB) or trained with `ZDICT_trainFromBuffer`.
- **Per app** (`app`): the same family's frames from 1,000 different rows (rows 5,001 to 6,000; for maps, nodes 1,000 to 1,999 of the 2,000-node map), as raw content (64 KB) or trained (16 KB).
- **Previous save** (`prev`): the frames of the earlier version of the same document, used as a prefix (what `zstd --patch-from` does). Edits: a 200-node map with 3 renames, 2 new nodes and 6 changed links; a 2,000-node map with 10 renames, 20 weights and 1 new node; 10 rows appended to 1,000 (orders, logs).

Whole-file size as a share of today (0.8.3; `results/zdict-small-files.txt`):

| Input | today | built-in | per app | previous save |
|---|---|---|---|---|
| 10 rows (logs, sensors, events, ids, orders, multi) | 639 to 1,024 | 76 to 89% | 72 to 85% | |
| 100 rows | 1,268 to 5,857 | 88 to 97% | 84 to 97% | |
| 1,000 rows | 6,394 to 53,261 | 97 to 100% | 94 to 100% | |
| Netflow map 20 / 200 / 2,000 nodes | 1,034 / 2,905 / 22,634 | 82 / 93 / 99% | 71 / 89 / 85% | |
| map 200 nodes, edited | 3,015 | 93% | | **27% (803 bytes)** |
| map 2,000 nodes, edited | 22,845 | 99% | | **6% (1,258 bytes)** |
| orders 1,000 + 10 rows | 10,083 | 99% | | **10% (992)** |
| logs 1,000 + 10 rows | 22,698 | 99% | | 47% (10,661) |

- **Real dictionaries save less than the E9 estimate:** 11 to 24% of a 10-row file, not 15 to 31%. Trained dictionaries did worse than raw content on almost every file (too few samples). The per-app dictionary wins on maps (15% at 2,000 nodes) because node labels and groups repeat across maps.
- **Stacked with the null plane** (same table on the `N` copy): 10-row orders 921 → 840 (`N`) → 720 (`N` + built-in) → 622 (`N` + per app), 68% of today. 100-row orders 2,054 → 1,389 (68%). Multi 10 rows 683 → 478 (70%).
- A 10-row file still loses to gzip -9 of its JSON (logs 615 at best against 503, map 20 nodes 735 against 308).
- **The previous save is the big lever:** an edited 2,000-node map costs 1,258 bytes instead of 22,845, because nearly every frame is a near copy of the earlier one. Logs gain less (47%) because each new row shifts the time and id columns. With `N`, the orders append stays at 87%, because the null plane moves most of those bytes into frames stored without zstd, which this script does not recompress.

**Decisions:** the built-in dictionary stays **REJECT** (real saving 1 to 24%, format change). The per-app dictionary is **DEFER** (needs a dictionary store per app). The previous-save delta is a new lead, **B17, EXPERIMENT**: it fits autosave and history (Netflow saves, Story Editor and Mind Mapper autosave, Workbench snapshots), where each save is a small edit of the last.

### 2026-11-11 E13 (B17): the previous save as a zstd prefix, sizes after many edits and native timing

Owner: "Keep going". A 2,000-node Netflow map save, then the same map after 1, 5, 20, 100 and 500 random edits (40% label renames, 40% link weight changes, 10% new nodes, 10% new links; seed 11). Every zstd frame of the new save is compressed at level 3 with a prefix from the base save, either all base frames (`whole`) or the frame in the same place (`match`; files with the same columns have the same frame order). `experiments/zprev.py`, system libzstd 1.5.5 through ctypes, every frame checked to decompress back to the same bytes. Times are native (not browser), median of 5 runs of 60, all frames of one file (`results/zprev-native.txt`).

| Edits since the base save | today | delta, whole | delta, match | compress ms: full / whole / match | decompress ms: full / whole / match |
|---|---|---|---|---|---|
| 1 | 22,635 | 582 (3%) | 601 (3%) | 0.50 / 0.92 / 0.13 | 0.19 / 0.04 / 0.04 |
| 5 | 22,710 | 822 (4%) | 707 (3%) | 0.38 / 0.91 / 0.13 | 0.16 / 0.04 / 0.04 |
| 20 | 22,976 | 1,082 (5%) | 950 (4%) | 0.38 / 0.90 / 0.13 | 0.15 / 0.05 / 0.04 |
| 100 | 23,945 | 2,313 (10%) | 1,931 (8%) | 0.38 / 0.90 / 0.14 | 0.15 / 0.05 / 0.05 |
| 500 | 25,401 | 4,823 (19%) | 4,141 (16%) | 0.40 / 0.94 / 0.17 | 0.16 / 0.06 / 0.06 |
| 200-node map, 11 edits | 3,015 | 803 (27%) | 749 (25%) | 0.08 / 0.13 / 0.06 | 0.07 / 0.05 / 0.05 |
| 1,000 orders + 10 rows | 10,083 | 992 (10%) | 935 (9%) | 0.11 / 0.26 / 0.08 | 0.06 / 0.04 / 0.04 |

- **Frame-to-frame (`match`) is both smaller and faster** than a whole-file prefix: zstd only indexes one frame per frame, and long matches are cheap. Compress takes 0.25 to 0.75 of a full save's zstd time and decompress 0.25 to 0.75, native.
- Deltas grow slowly: still 16% of a full save after 500 edits. A rule "write a full save when the delta passes 25% of the last full save" would write a full save every several hundred edits on a 2,000-node map.
- zstd is only part of pack and read time (E1), and a reader needs the base save decoded first, so these are zstd-only numbers. A delta read costs about one full read plus a small delta.
**Browser timing (added 9:40 PM Eastern, owner approved the zstd source download).** The pinned zstd 1.5.7 source (checksum as in `wasm/build.sh`) rebuilt the shipped `zstd-full.wasm` byte for byte. A research copy of `wasm/zstd-glue.c` adds `compress_prefix` and `decompress_prefix` (`experiments/b17-zstd-glue-prefix.diff`, +1.3 KB of wasm). `experiments/www/zp.html` times the zstd step only for every frame of the file, 50 runs per sample, 7 samples per page, 5 fresh pages per browser, and checks that each delta decodes back to the same bytes (`results/zp-*.json`). Bytes are the zstd frames only, not the whole file.

| Case | frames, full → delta | compress, delta / full (Chromium / Firefox / WebKitGTK) | decompress, delta / full |
|---|---|---|---|
| 2,000-node map, 1 edit | 22,358 → 324 (1%) | 0.26 / 0.25 / 0.23 | 0.07 / 0.09 / 0.11 |
| 20 edits | 22,699 → 673 (3%) | 0.27 / 0.27 / 0.24 | 0.07 / 0.09 / 0.11 |
| 100 edits | 23,668 → 1,654 (7%) | 0.31 / 0.31 / 0.27 | 0.11 / 0.10 / 0.11 |
| 500 edits | 25,124 → 3,864 (15%) | 0.37 / 0.36 / 0.33 | 0.20 / 0.18 / 0.20 |

- Full-save zstd time on the 2,000-node map is 0.48 to 0.56 ms; a whole `packTables` of it is 5 to 6 ms and `unpackTables` 1.5 to 2 ms. So zstd is about a tenth of a save, and a delta save is about 7% faster in total, not 3 times. The gain of B17 is size, and the speed is never worse.
- A delta read needs the base save decoded first: about 0.18 ms of zstd plus 0.01 to 0.04 for the delta, against 0.18 for a full read. That is under 0.05 ms more per read on this map.
- The 200-node map and orders cases run 0.03 to 0.12 ms, below the timer resolution in Firefox and WebKitGTK (1 ms clamps), so only Chromium is quoted for them: compress 0.41 to 0.46, decompress 0.20 to 0.29.

**Decision: B17 ADOPT CANDIDATE for a proposal** (`PROPOSAL-delta-saves.md`) (not code yet). The size win is large (1 to 15% of the zstd bytes over 1 to 500 edits) and nothing got slower. It needs an API (`pack(rows, { base })`), a footer flag naming the base save by its XXH64, a full-save rule (a full save when the delta passes 25%), and the prefix calls in the shipped wasm. Next: `PROPOSAL-delta-saves.md` and an app check of how Netflow and Story Editor autosave would keep the base.

### 2026-11-11 E14 (B13, real data): the NYC taxi table, against Parquet

Owner approved three downloads (pyarrow 26.0.1 wheel, the NYC TLC yellow taxi trips for January 2024, Brotli 1.1.0 source), all kept in research scratch. The taxi table has 2,964,624 rows and 19 columns; 5 columns (`passenger_count`, `RatecodeID`, `store_and_fwd_flag`, `congestion_surcharge`, `Airport_fee`) are null in the same 140,162 rows, all at the end of the file. Sets (`experiments/mktaxi.py`, timestamps as epoch ms): `taxit` = the last 300,000 rows as stored (160k rows without nulls, then 140k with), `taxis` = the same rows sorted by pickup time (nulls spread through every block, as a database export sorted by time would be), `taxi0` = the first 100,000 rows (no nulls).

**Sizes** (Node, rows checked; Parquet from pyarrow on the same rows, `experiments/pqsize.py`, `results/parquet-taxi.txt`):

| Set | LFC-pack 0.8.3 | null plane | null plane + B3b | Parquet zstd-1 (default) | Parquet zstd-3 | Parquet snappy |
|---|---|---|---|---|---|---|
| taxit 300k | 4,324,352 | -0.1% | -0.2% | 5,535,876 | 4,968,395 | 6,347,190 |
| taxis 300k | 3,736,788 | -1.5% | -2.5% | 5,442,897 | 4,841,548 | 6,503,439 |
| taxi0 100k | 1,512,525 | same bytes | same bytes | 1,914,601 | 1,729,659 | 2,200,722 |

- **The null plane saves only 0.1 to 2.5% on the real table**, not the 14 to 24% of the made-up sets. The nullable taxi columns are small categories (1 to 6, `N`/`Y`, 0 / 2.5, 0 / 1.75), which compress well even as JSON text: together they are 4.6% of the file (`experiments/cols.cjs`). In 4 of 9 blocks the typed inner column was larger than the text, so the writer kept `j`. The made-up sets had nulls in high-entropy columns (dates, decimals), which is where the plane pays.
- **LFC-pack is 0.75 to 0.87 of Parquet's size** (zstd-3) on the same rows, and 0.68 to 0.79 of pyarrow's default. Parquet keeps typed timestamps and dictionary pages, with 1 MB pages and one row group. Parquet times are native pyarrow on one thread (write 33 to 113 ms, read 12 to 40 ms) and are not comparable to browser numbers. The fair speed test is a Parquet reader in the browser (card to the owner).

**Browser timing** (300,000 rows, `ONLY=full,keys1`, 4 rounds, ratio of medians against 0.8.3, `results/rdab-*-tx.json`), Chromium / Firefox / WebKitGTK:

| Set | build | pack | full read |
|---|---|---|---|
| taxis (sorted) | null plane | 1.01 / 1.01 / 0.98 | 0.90 / 0.88 / 0.83 |
| | B3b | 0.85 / 0.78 / 0.77 | 0.98 / 0.89 / 1.00 |
| | both | 0.92 / 0.82 / 0.82 | 0.89 / 0.93 / 0.92 |
| taxit (as stored) | null plane | 1.04 / 1.00 / 1.03 | 0.97 / 0.84 / 0.92 |
| | B3b | 0.93 / 0.85 / 0.88 | 0.93 / 0.98 / 0.99 |
| | both | 0.92 / 0.88 / 0.92 | 0.94 / 0.93 / 0.98 |

- On real data the null plane gives full reads 0.83 to 0.97 and costs up to 1.04 on pack when alone. Stacked with B3b, pack is 0.82 to 0.92 and full read 0.89 to 0.98: a real but smaller gain than on made-up data. One-column reads (3 to 5 ms) swung 0.75 to 1.33 and are below this harness's resolution.
- Expectation for the code thread: on real data with nulls in small categorical columns, expect 0 to 3% smaller files and reads up to 0.83; the 14 to 24% applies to nulls in dates, decimals and names.

### 2026-11-11 E15 (B7): Brotli against LFC-pack on small files and app saves

Brotli 1.1.0 (PyPI source package; the GitHub archive URL was refused by the proxy) built for wasm32 without a C library (`experiments/brotli-wasm/`, `clang --target=wasm32 -Os -mbulk-memory -nostdlib -ffreestanding -DNDEBUG -DBROTLI_BUILD_PORTABLE`, 730 KB). Its output matches Node's Brotli byte for byte on the 200-node map.

Sizes (`experiments/brsize.cjs`, `results/brotli-small-files.txt`): Brotli quality 11 of the JSON beats LFC-pack below about 100 to 200 rows (LFC-pack is 1.4 to 4.4 times larger at 10 to 20 rows, 0.90 to 1.27 at 100 rows) and loses above (LFC-pack 0.61 to 0.84 of Brotli 11 at 1,000 rows and on the 2,000-node map). Brotli 5 is close to gzip -9.

Browser timing (`experiments/www/br.html`, 5 fresh pages, 5 samples; Brotli times include `JSON.stringify` / `JSON.parse`, as an app would do), ms, Chromium / Firefox / WebKitGTK:

| File | size: Brotli 5 / Brotli 11 / LFC-pack | save: Brotli 5 / LFC-pack | save: Brotli 11 | load: Brotli 5 / LFC-pack |
|---|---|---|---|---|
| map, 20 nodes | 253 / 233 / 1,034 | 0.06 / 0.34, 0.05 / 0.23, 0.08 / 0.30 | 2.3 / 2.8 / 2.5 | 0.013 / 0.13, 0.025 / 0.13, 0.025 / 0.15 |
| map, 200 nodes | 3,327 / 2,687 / 2,905 | 0.57 / 0.67, 0.60 / 0.65, 0.63 / 0.68 | 49 / 59 / 53 | 0.14 / 0.21, 0.15 / 0.23, 0.20 / 0.23 |
| orders, 100 rows | 2,248 / 1,936 / 2,054 | 0.31 / 0.82, 0.35 / 0.78, 0.35 / 1.00 | 23 / 28 / 25 | 0.06 / 0.13, 0.05 / 0.13, 0.08 / 0.10 |
| logs, 100 rows | 3,293 / 2,891 / 2,908 | 0.34 / 0.26, 0.38 / 0.23, 0.38 / 0.33 | 18 / 22 / 20 | 0.06 / 0.08, 0.05 / 0.10, 0.08 / 0.10 |

- Below about 100 rows, Brotli 5 of the JSON is smaller than LFC-pack, faster to save (except logs) and 1.3 to 10 times faster to load. All of these are under 1 ms, so no user waits on either.
- Brotli 11 is the smallest but takes 18 to 59 ms to save a 100 to 200 row file: too slow for autosave on every edit.
- **Threshold for app threads:** an app save under about 100 rows is smaller as compressed JSON than as LFC-pack; above about 200 rows LFC-pack wins on size, and from about 1,000 rows by 16 to 39%. A small-file rule belongs in the app or in a future LFC-pack "tiny" mode (the raw `r` block of E9 with a stronger coder), not in the format today. Brotli is not shipped by LFC-pack and would add 730 KB of wasm, so it stays a yardstick, not a candidate.

### 2026-11-11 E16: everything stacked against each part (B14 + 4 MB blocks + null plane + B3b)

Owner rule (9:48 PM Eastern, relayed by the orchestrater): test stacked ideas together as well as alone, and look for combinations that beat the sum of their parts. Build `all` = B3b v3 + null plane + B14 (`b14-range-late-rows.diff` applied on top), written with 4 MB blocks. Parts: `sel` (B14 at 13 MB), `r83` at 4 MB, `b3bn` (null plane + B3b at 13 MB). 3 rounds, paired fresh pages, ratio of medians against 0.8.3 at 13 MB (`experiments/stkanal.py`, `results/rdab-*-stack.json`). "Product" is what independent gains would give (the parts' ratios multiplied). Range reads on the stacked build pass 108 of 108 checks against a filtered full read, including ranges on nullable columns (`experiments/selverify2.cjs`).

| Set | measure | product of parts | all stacked (Chromium / Firefox / WebKitGTK) |
|---|---|---|---|
| orders 100k (6 nullable columns) | 1% range | 0.16 / 0.28 / 0.23 | **0.08 / 0.12 / 0.10** |
| | one column | 0.36 / 0.27 / 0.50 | **0.19 / 0.25 / 0.29** |
| | full read | 0.53 / 0.69 / 0.59 | **0.50 / 0.62 / 0.51** |
| | pack | 0.71 / 0.67 / 0.72 | 0.65 / 0.63 / 0.70 |
| 3 nullable sensor columns 100k | 1% range | 0.18 / 0.25 / 0.13 | **0.12 / 0.18** / 0.14 |
| | one column | 0.17 / 0.18 / 0.19 | 0.14 / 0.15 / 0.17 |
| | full read | 0.40 / 0.62 / 0.67 | 0.50 / 0.62 / **0.47** |
| | pack | 0.89 / 0.96 / 0.88 | **0.80 / 0.77 / 0.76** |
| taxi 300k, sorted (real) | 1% range | 0.24 / 0.18 / 0.30 | 0.32 / 0.29 / 0.46 |
| | full read | 0.83 / 0.92 / 1.15 | 0.87 / 0.85 / 0.97 |
| | pack | 0.89 / 0.84 / 0.80 | 0.90 / 0.78 / 0.82 |

- **Better than the sum on data with nullable columns.** A 1% range read on orders takes 0.08 to 0.12 of today's time, against 0.16 to 0.28 if the gains were independent. Why: with a `j` (JSON text) column, B14 still has to parse the whole column to pick its selected rows; with the null plane the column is typed, so B14 decodes it and picks values cheaply. The null plane also gives nullable number columns zone maps, so smaller blocks can be skipped on them. Pack gains more than the product on the sensor set (0.76 to 0.80 against 0.88 to 0.96).
- **On the real taxi table, the stack equals 4 MB blocks alone for range reads.** On their own pages at 4 MB (6 rounds, `results/rdab-*-txiso.json`), `all` against `r83` was 1.00 to 1.04 for a 1% range (10 to 13 ms). Both ideas cut the same rows there: a 4 MB taxi block holds about 10,000 rows, and a 1% range keeps about 30% of the block, near the B14 cutover. The stack is not slower; the overlap just means no extra gain. One-column taxi reads (1.5 to 5 ms) are below the harness's resolution.
- Size stacks as expected (sizes do not interact).

**Decision:** ship the three approved items together as one release, and gate it on these stacked numbers, not only on each item alone. The orders and sensor rows above are the stacked gate; the taxi rows are the real-data control.

### 2026-11-11 E17: LFC-pack against Parquet and Arrow readers in the browser, and where saves lose (B18)

Owner approved fetching browser rivals into research scratch (npm): parquet-wasm 0.9.0, hyparquet 1.33.0, Apache Arrow JS 21.2.0 (DuckDB-wasm 1.33.1-dev57.0 fetched, not run yet). Same 300,000 taxi rows as E14 sorted by pickup time. Rival files written by pyarrow 26 (`experiments/mkrival.py`): Parquet zstd-3 and snappy, Arrow IPC stream uncompressed; 64-bit ints narrowed to int32 and timestamps as milliseconds, so Arrow JS returns numbers. "rows" = plain row objects (for Arrow and parquet-wasm built with one keyed store per column, nulls via `isValid`, as LFC-pack does); "cols" = decoded columns (LFC-pack `unpackColumns`; Arrow table). "save" = from row objects (`packRows`; parquet-wasm via `tableFromJSON`, IPC, `writeParquet` with zstd). `experiments/www/rv.html`, 4 fresh pages per library, median of 3 (`results/rv-*.json`). ms, Chromium / Firefox / WebKitGTK:

| Library | size | rows | cols | save |
|---|---|---|---|---|
| LFC-pack 0.8.3 | 3,736,788 | 339 / 286 / 325 | 204 / 143 / 153 | 1,809 / 1,799 / 1,647 |
| LFC-pack, research stack (4 MB) | **3,716,840** | **305 / 261 / 276** | 167 / 134 / 115 | 1,733 / 1,490 / 1,401 |
| parquet-wasm, zstd-3 | 4,396,479 | 574 / 508 / 515 | 102 / 103 / 105 | **617 / 830 / 746** |
| parquet-wasm, snappy | 6,043,732 | 546 / 436 / 484 | 86 / 88 / 83 | |
| hyparquet, snappy | 6,043,732 | 494 / 641 / 369 | | |
| Arrow IPC, uncompressed | 37,549,576 | 348 / 260 / 291 | **0.6 / 1.0 / 1.0** | |

- **Size:** LFC-pack is 0.85 of Parquet zstd-3 even with Parquet's types narrowed, and a tenth of Arrow IPC.
- **Rows:** LFC-pack builds row objects in 0.51 to 0.63 of parquet-wasm's time and 0.41 to 0.75 of hyparquet's. Arrow IPC rows cost about the same as LFC-pack, because both spend the time on the same keyed stores.
- **Columns:** LFC-pack's `unpackColumns` takes 1.1 to 2.0 times parquet-wasm's time. Arrow IPC reads in about 1 ms, because it does not decode anything (37.5 MB on disk).
- **Saves lose: `packRows` takes 1.8 to 2.9 times parquet-wasm's time.** Split (`experiments/www/ps.html`, 3 browsers): `JSON.stringify` of the rows 220 to 290 ms, packing the same rows from NDJSON bytes 890 to 1,120 ms, `packRows` 1,600 to 2,000 ms. Two causes: (1) an array bigger than the tokenizer buffer (about 16 MB of text) falls back to a JavaScript comma scan of one huge text; (2) in 0.8.3 the taxi blocks fall to the slow JavaScript writer because of the nulls (Node profile: `writeFlatBlock` 26%, `encodeColumn0` 14%, garbage collection 11%). B3b fixes (2): with the stack the profile is on the fast writer.
- **B18a, slices (`experiments/b18-patch-rows-slices.py`):** stringify a big array in slices that each fit the tokenizer buffer, so each slice takes the wasm comma scan. Same bytes. `packRows` 0.80 in Chromium, 0.89 in WebKitGTK, but 1.08 in Firefox (3 pages each). Sweep (10:40 PM, `experiments/psdrive2.cjs`, 5 rounds, slices of 1/1.3, 1/3 and 1/8 of the buffer, `results/ps-*.json`): Chromium 0.86 to 0.88, WebKitGTK 0.92 to 0.95, Firefox 1.03 to 1.05 at every size. SpiderMonkey's JavaScript scan of one big text is already fast, and the extra slicing and copies cost more there. **DEFER** (slower in one engine; fold into B18b, which removes the text altogether).
- **B18b, the real gap:** LFC-pack goes rows → JSON text → tokens → columns, while parquet-wasm goes rows → columns. Even packing from NDJSON bytes (no stringify) is 1.3 to 1.5 times parquet-wasm's whole save from objects. A writer that reads row objects straight into columns would skip the text twice. **EXPERIMENT** (large: a second front end to the flat writer; must give the same bytes).

### 2026-11-11 E18: real nested data (GitHub Archive) and DuckDB-wasm

**Nested:** the first 10,000 events of the public GitHub Archive hour 2024-01-15 15:00 UTC (35,635,662 bytes of NDJSON, kept in research scratch only, not committed: it holds real public user names). LFC-pack 0.8.3 writes it as nested blocks; rows come back the same (10,000 of 10,000). Sizes: LFC-pack 3,134,169; whole-text zstd-3 3,655,030; zstd-19 2,599,552; Brotli 5 (24-bit window) 2,920,187; Brotli 9 2,615,880; gzip -9 5,075,476; Parquet zstd-3 via pyarrow `from_pylist` 6,816,302 (its inferred schema fills every missing key with null, so it does not give back the same JSON). The 4 MB rule must stay flat-only: 4 MB nested blocks made this file 10% bigger (3,456,861).

Browser timing (`experiments/www/gh.html`, 4 fresh pages, median of 3; "read" = to row objects, including `JSON.parse` per line for the whole-text codecs), ms, Chromium / Firefox / WebKitGTK:

| | save | read |
|---|---|---|
| LFC-pack | 339 / 302 / 327 | **157 / 191 / 130** |
| zstd-3 of the text | **86 / 84 / 82** | 261 / 231 / 201 |
| Brotli 5 of the text | 466 / 529 / 534 | 272 / 254 / 165 |
| `JSON.parse` of the plain text (no codec) | | 232 / 229 / 225 |

- LFC-pack reads nested real data in 0.57 to 0.83 of the time `JSON.parse` takes on the uncompressed text, and 0.60 to 0.83 of zstd-3 plus parse.
- Whole-text zstd-19 and Brotli 9 are 17% smaller than LFC-pack's level 3 here: a 35 MB window finds repeats (avatar URLs, repository names) across the whole hour that 13 MB blocks cannot. LFC-pack `level: 19` would close part of the gap (README: about 12% smaller, 15 times slower to write).

**DuckDB-wasm 1.33.1-dev57.0** (`experiments/www/dk.html`, worker, `eh` bundle) on the taxi Parquet zstd-3 file against LFC-pack (research stack, 4 MB blocks), 4 fresh pages, median of 3, ms, Chromium / WebKitGTK:

| | DuckDB-wasm | LFC-pack |
|---|---|---|
| start (worker plus wasm) | 664 / 3,612 | (`init` is part of page load) |
| 1% time range to rows (6,658 rows) | 29 / 43 | **12 / 12** |
| count in that range | 14 / 21 | |
| sum of one column | **4.3 / 10** | 9.4 / 10 (`unpackColumns`, then a loop) |
| all 300,000 rows | 180 / 216 (Arrow row proxies, not plain objects) | 307 / 271 (plain objects) |

- Firefox could not run DuckDB: its Parquet extension is fetched from `extensions.duckdb.org` at run time, and the test box has no route there.
- Range reads to rows: LFC-pack takes 0.27 to 0.41 of DuckDB's time. Column aggregates: DuckDB is 1 to 2.2 times faster. DuckDB's whole-table result is lazy row proxies, so it is not comparable with plain objects.

### 2026-11-11 E19 (B18b): saving straight from row objects into columns, alone and stacked

**Prototype** (`experiments/b18b-patch-rows-to-columns.py`): when every row is a plain object with scalar values, and none of `exact`, `block` or `share` is set, `packRows` with more than 4,096 rows hands the row objects to the JavaScript flat writer in slices of about one block. There is no JSON text and no wasm scan. Two more parts came from the screens:
- **Both number layouts.** On this path the writer tries both varint forms (absolute and delta), as the fast wasm writer does. The first draft compressed only the shorter one and made taxi files 1.1% bigger. Now files are 0.999 to 1.000 of 0.9.3's size.
- **Gate.** The row path is used only above an estimated 16 MB of text, or when fewer than 40% of the first 256 rows' cells are strings. String-heavy tables under 16 MB pack 1.1 to 1.5 times slower this way: the wasm scanner handles strings faster than the JavaScript column writer. Above 16 MB, today's text path leaves the wasm scanner anyway (`rowsScanJs`). Under the gate, files are byte-identical to 0.9.3.

**Chromium stack screen against 0.8.3** (`experiments/prdrive.cjs`, `www/pr.html`, 3 fresh pages per cell, `results/pr-stack-chromium.json`). `packRows` time and file size as a share of 0.8.3:

| Variant | Taxi 300k | Orders 100k | Sensors with nulls 300k | Logs 300k |
|---|---|---|---|---|
| B18b | 0.45 (1.001) | 0.42 (0.999) | 0.42 (1.000) | 0.79 (1.000) |
| Null plane | 1.02 (0.985) | 0.90 (0.764) | 1.04 (0.958) | 1.08 (1.000) |
| 4 MB blocks | 0.99 (1.016) | 0.94 (1.023) | 0.91 (1.002) | 1.05 (1.004) |
| B18b + null plane | 0.59 | 0.39 | 0.39 | 0.80 |
| B18b + 4 MB | 0.43 | 0.40 | 0.38 | 0.74 |
| All three | 0.57 | 0.29 | 0.39 | 0.76 |
| Approved stack (B3b, N, B14, 4 MB) | 0.92 | 0.78 | 0.80 | 1.07 |
| Approved stack + B18b | 0.60 | 0.29 | 0.34 | 0.72 |

- **Better than the sum:** orders (all three 0.29, where the parts multiply to 0.36) and logs (approved + B18b 0.72, against 0.85).
- **About even:** sensors.
- **Worse than the sum:** taxi. Once the text step is gone, the null plane's typed encoding of nullable columns costs about 0.14 (Node profile: more column encoding and more garbage collection). B18b also replaces the gain B3b gave by keeping nullable rows on the fast writer, so the two overlap.

**Size sweep on 0.9.3** (main moved during this round: 0.9.1 shipped B3b and 0.9.3 shipped B14; `results/pr-93-chromium.json`, ungated B18b in Chromium):
- Logs: 1.53 at 10,000 rows, 1.22 at 30,000, 1.09 at 100,000 (14 MB) and 0.74 at 300,000.
- IDs: 1.32 at 30,000 and 0.74 at 300,000.
- Orders: 0.92 at 10,000, 0.79 at 30,000 and 0.52 at 100,000.
- Sensors with nulls: 0.88 at 30,000 and 0.53 at 300,000.
- Mixed kinds: 0.57 at 30,000 and 0.53 at 300,000.
- Taxi: 0.57. GitHub events (flat, 22 MB): 0.68.

That sweep set the gate above.

**3-browser gate on 0.9.3** (`results/pr-gate18-*.json`, 3 fresh pages per cell). `packRows` time as a share of 0.9.3, given as Chromium 156 / Firefox 158 / WebKitGTK 2.52.6:

| Data | B18b | 4 MB alone | B18b + 4 MB |
|---|---|---|---|
| Taxi 300k | 0.55 / 0.60 / 0.60 | 1.06 / 0.91 / 1.03 | 0.54 / 0.58 / 0.51 |
| Orders 100k | 0.51 / 0.60 / 0.59 | 1.04 / 1.01 / 0.98 | 0.47 / 0.60 / 0.60 |
| Logs 300k | 0.71 / 0.90 / 0.86 | 0.98 / 1.01 / 1.05 | 0.67 / 0.94 / 0.91 |
| IDs 300k | 0.70 / 0.85 / 0.69 | 1.01 / 0.85 / 1.00 | 0.71 / 0.88 / 0.63 |
| Orders 10k (gate on) | 1.08 (0.96 over 6 rounds re-run alone) / 0.76 / 0.82 | | |
| Logs 30k (gate off, same code: noise) | 0.94 / 1.17 / 1.10 | | |

- 4 MB blocks don't change pack time, so that pair is about even.
- Values matched in every cell (compared with keys sorted).
- Key order: lfc-pack keeps keys in first-seen order per block, as documented for value-exact mode. B18b cuts blocks by row count, so a later block can order a key differently. On 200,000 GitHub events with an often-missing key, 0.9.3 itself reorders keys on 53,388 rows and B18b on 31,164.
- Decision: **ADOPT CANDIDATE**, owner card posted 11:43 PM Eastern. Summary for other threads: `B18b-GATE-2026.11.11.md`.

### 2026-11-11 E20 (B19): equality reads through dictionary codes, alone, with a cache and with the null plane

From the Codex review (KB M110): scan a dictionary column's codes, and build strings and rows only for matches.

**Prototype** (`experiments/b19-patch-equality-reads.py`, on 0.9.3 and on the null-plane build): `unpack(file, { equals: { key, value } })`, matched strictly (`===`), so a missing key never matches `null`. It has three modes for A/B timing:
- `off`: read whole blocks, then filter (what an app does today).
- `plain`: test the decoded column and build only the matching rows, as B14 does for ranges.
- `codes`: also reads a `D` column, or a null-plane column over `D`, through its codes. The label frame is decompressed first, and a block whose labels lack the value stops there. Other columns are decompressed only when a row matches.

More than half the rows of a block matching sends the block down the whole-block path.

**Correctness** (`experiments/eqverify.cjs`): every mode gives the same rows as `unpack(file).filter(...)`, with the same key order, on 378 checks. They cover accents, CJK, emoji, empty text, near-duplicate labels, null against missing keys, a number asked of a text column, 256 KB to 13 MB blocks, with and without `keys`, and real GitHub events (flat rows made by `experiments/mkgh-flat.py`; the data stays in scratch). Timing is next.

**Timing** (`experiments/eqdrive.cjs`, `www/eq.html`, `eqanal.py`, `eqq.py`; `results/eq-*.json`). This adds a third variant, `cache` (`experiments/b19-patch-cache.py`, the Codex variant): it keeps each block's decoded columns, plus one code per row for the asked key, between queries on the same file.

Over 0.9.3's read-then-filter, 3 browsers (C / F / W):
- **24 queries:** B19 takes 0.53 to 0.79 on big files. With the cache, 0.10 to 0.37.
- **First query:** B19 takes 0.36 to 0.87. With the cache, 0.41 to 1.03, because it copies frames out of the read buffer.
- **Per query:** dictionary codes tie with plain late rows when the value is present. They take an absent value from 0.10-0.27 down to 0.02-0.05.
- **Cache memory:** about 99 MB for a 6 MB, 300,000-row log file, against 85 MB for all rows held. So the cache is opt-in.
- **Stacked with the null plane, first query:** better than the sum. Orders take 0.37 to 0.44 against an expected 0.44 to 0.59, and taxi 0.32 to 0.41 against 0.36 to 0.51.
- **With the cache, 24 queries:** about even or a bit worse than the sum (0.14 to 0.16 against 0.11 to 0.12).

Decision: **ADOPT CANDIDATE**, with the cache opt-in and given a size limit before it ships. Summary for other threads: `B19-GATE-2026.11.12.md`. New leads:
- B19b: decode only the matching positions of `D` and `B` columns.
- A per-block label summary in the footer (B8 follow-up).

### 2026-11-12 E21: Blob-range import jobs paired with B18b saves, with real peak memory

The idea comes from the Codex review thread (its no-copy screen, `/mnt/project-files/js-modules-research/codex-review-2026.11.11/no-copy-screen/`).

The test is one app session in two steps (`experiments/www/sess.html`, `sw.js`, `experiments/sessdrive.cjs`, `sessanal.py`, `results/sess-*.json`; 4 MB blocks, 2 helpers, 3 fresh pages per cell):
1. **Import** a file with helper workers. Today's shape reads the whole file, slices each block and transfers it. Blob-range jobs instead send each helper the `Blob` and a byte range. Each packed block is unpacked to rows as it arrives.
2. **Save** with `packRows`: lfc-pack 0.9.3, or 0.9.3 + gated B18b.

Peak memory is measured, not modeled: the summed resident memory (RSS) of all the browser's processes, sampled every 20 ms during each step, minus the level before the step.

Results, as a share of today, given as Chromium 156 / Firefox 158 / WebKitGTK 2.52.6:

| Data | Blob-range import | B18b save | Both, whole session | Import peak MB, today -> Blob-range | Save peak MB, today -> B18b |
|---|---|---|---|---|---|
| Orders 100k (18 MB) | 0.96 / 0.96 / 1.02 | 0.64 / 0.51 / 0.56 | 0.81 / 0.74 / 0.77 | 204->191 / 226->196 / 326->321 | 92->26 / 121->65 / 101->2 |
| GitHub events 200k (22 MB) | 1.00 / 1.02 / 1.01 | 0.71 / 0.90 / 0.79 | 0.80 / 0.92 / 0.88 | 204->188 / 228->213 / 307->265 | 113->54 / 173->123 / 103->14 |
| Logs 300k (44 MB) | 0.93 / 0.96 / 1.06 | 0.90 / 0.75 / 1.00 | 0.98 / 0.83 / 1.04 | 303->269 / 354->372 / 406->342 | 242->134 / 169->58 / 211->41 |

- **Blob-range jobs:** main-thread copy time goes from 9 to 24 ms to 0, and import time is flat (0.93 to 1.06). Import peak memory falls 5 to 64 MB in Chromium and WebKit. In Firefox it is mixed, from -30 to +18 MB.
- **B18b saves:** save peak memory falls 50 to 170 MB (there is no JSON text). The time gain is smaller here than in the E19 gate, because rows built by lfc-pack's reader save slower through the row path than rows from `JSON.parse`. Logs were 0.90 / 0.75 / 1.00 here, against 0.71 / 0.90 / 0.86 in E19.
- **Stacking:** the two act on different steps, so session time is about the B18b number alone (0.74 to 1.04). For the session's peak memory (the larger of the two steps), the import step dominates, so Blob-range sets it. Neither is better than the sum; they add up.
- Lead checked (12:21 AM): I found no gap for rows built by the reader. In Node, logs rows from `unpack` save in 0.72 of 0.9.3's time through B18b, against 0.84 for rows from `JSON.parse`. Both kinds keep fast properties and one shared shape (`%HasFastProperties`, `%HaveSameMap`). The browser differences in this table point both ways (Firefox did better here than in E19), so they are noise from the heap the import step leaves behind, not a shape problem. Closed.

Decision: Blob-range jobs **ADOPT CANDIDATE** for imports (main-thread copy and memory, not speed). The pairing needs no extra work.

### 2026-11-12 E22 (B19b): decode only the matching positions, alone and with the B19 cache and the null plane

**Prototype** (`experiments/b19b-patch-decode-at-matches.py`): when at most 1 in 8 rows of a block match, the other columns are decoded only at the matching positions where the layout allows it:
- Text (`s`): one zero-byte scan; an all-ASCII frame is decoded once and cut with `substring`, otherwise each wanted string is decoded alone.
- Dictionary (`D`), true/false (`T`) and bit-packed numbers (`B`): read straight at each matching position.
- Varints and other kinds are still decoded whole.

In cache mode, the first use of a column decodes only the matching positions, and the second use decodes it in full and keeps it. Rows matched the full read on 1,062 checks. Results are in `results/eq-b19b*.json`, with `-nob` marking runs with B19b off.

Chromium 156 (3 fresh pages per cell), share of 0.9.3's read-then-filter, first query / 24 queries:
- **Without the cache:** B19b changes little. First queries are 0.03 to 0.09 better on GitHub events and taxi; elsewhere the change is within noise. Per-query runs vary by about 0.2, so no single query can be called a gain.
- **With the cache:** B19b removes the cache's first-query cost on text-heavy rows. GitHub events go from 1.20 to 0.70 and taxi from 0.64 to 0.48. Over 24 queries the result is unchanged (0.12 to 0.37).
- **Firefox 158, with the cache:** GitHub events go from 1.10 to 0.48 and orders from 0.91 to 0.82 on the first query.
- **WebKitGTK 2.52.6, with the cache:** even (0.92 to 0.93 on GitHub events, 0.80 to 0.87 on orders, 0.38 to 0.35 on taxi). The 24-query numbers are even in both browsers.
- **With the null plane (Chromium):** even; nullable columns are decoded whole.

Decision: **ADOPT CANDIDATE as part of the B19 cache.** It adds no API, and it makes the opt-in cache's first query no slower than B19 without the cache. As a separate item: DEFER.

**Through the null plane (added 12:25 AM, 11.12).** B19b now also decodes null-plane (`N`) columns at the matching positions: it walks the null bitmap once, then reads the inner typed column at the non-null matches. Rows matched the full read on 198 more checks. Three-way stack (null plane + B19 + B19b) in Chromium 156, against 0.9.3's read-then-filter (`results/eq-3way-*.json`), first query / 24 queries:

| Data | Null plane alone | B19 + B19b alone | Expected if independent | All three, measured | Null plane + B19 without B19b |
|---|---|---|---|---|---|
| Sensors with nulls, 300k | 0.88 / 0.82 | 0.42 / 0.29 | 0.37 / 0.24 | **0.35 / 0.14** | 0.48 / 0.25 |
| Taxi, 300k | 0.88 / 0.89 | 0.41 / 0.62 | 0.36 / 0.55 | **0.34 / 0.49** | 0.39 / 0.53 |
| Orders, 100k | 0.63 / 0.42 | 0.76 / 0.67 | 0.48 / 0.28 | **0.43 / 0.27** | 0.41 / 0.27 |

- **Better than the sum, most of all on sensors over 24 queries** (0.14 against 0.24). Without the null plane, the nullable `hum` column is JSON text and has to be parsed whole. With it, that column is typed bit-packed numbers, which B19b can read at the matches alone.
- With the cache, the three-way stack is even with the cache alone: 0.07 on sensors, where everything is decoded once anyway.
- This pairing (null plane, then B19b) is a reason to ship them together.

**Three-way stack in all three browsers (12:33 AM, 11.12).** Same runs in Firefox 158 and WebKitGTK 2.52.6 (`results/eq-3way-*-{firefox,webkit}.json`; match counts identical in every mode). 24 queries, against 0.9.3's read-then-filter, Chromium / Firefox / WebKit:

| Data | Expected if independent | All three, measured | First query, all three |
|---|---|---|---|
| Sensors with nulls, 300k | 0.24 / 0.25 / 0.33 | **0.14 / 0.17 / 0.18** | 0.35 / 0.31 / 0.38 (expected 0.37 / 0.39 / 0.63) |
| Taxi, 300k | 0.55 / 0.59 / 0.50 | **0.49 / 0.46 / 0.42** | 0.35 / 0.24 / 0.26 |
| Orders, 100k | 0.28 / 0.34 / 0.34 | 0.26 / 0.34 / 0.26 | 0.44 / 0.44 / 0.39 |

- **Confirmed in every browser.** It beats the sum most on sensors (WebKit 0.18 against 0.33) and by 0.06 to 0.13 on taxi; orders are even to better.
- Without B19b (`codes-nob`), the null plane plus B19 gives sensors 0.25 / 0.29 / 0.31, so B19b is what makes the pairing pay.

### 2026-11-12 E23 (B20): why column reads trailed parquet-wasm, and two read fixes

**Profile** (Node 22, 300,000 taxi rows, `experiments/coldt.cjs` with a timing wrapper around `decodeColumn`). `unpackColumns` on 0.9.3 took 204 ms per read:
- 118 ms in JSON-per-cell (`j`) columns. The five nullable taxi columns are `j` in 0.9.3, read with one `JSON.parse` per cell. Even with the null plane, 13 of 29 blocks keep them as `j`, because the column is null in every row of those blocks, and that is 665,000 `JSON.parse('null')` calls (54 ms).
- 53 ms in zigzag number columns. The money columns (scale 100) went through three passes over a Float64Array: the varints, then the zigzag, then the division.
- Bit-packed columns took 10 ms, and decompression 2 to 5%.

**Two read fixes, with no format change and the same values** (`experiments/b20-patch-json-cells.py`, `experiments/b20-patch-one-pass-zigzag.py`):
1. **JSON cells.** A `j` frame that is exactly `null` on every line is filled with nulls straight from its bytes. Otherwise, in Chromium and Firefox, `null`, `true`, `false` and whole numbers of up to 15 digits are read by hand, and everything else still goes to `JSON.parse`. WebKitGTK keeps `JSON.parse` per cell, because the hand reader was slower there: orders took 1.08 to 1.20 of the time (`results/cols-i-webkit.json`).
2. **One-pass zigzag.** Zigzag number columns (neither monotonic nor delta) are decoded in one loop: varint, zigzag with integer operations below 2^21, then the division by the scale.

**Correctness.**
- `experiments/colsame.cjs`: the same column kinds and values (`Object.is`), and identical `unpack` rows, on 12,053,388 cells (0.9.3) and 9,953,388 cells (null-plane build), across taxi, orders, sensors, logs and GitHub events.
- `experiments/jcelltest.cjs`: the hand reader gives the same result as `JSON.parse`, or throws where it throws, on edge cases (`-0`, `-`, `01`, 16-digit numbers, `nul`, spaces, `1e3`) and on 200,000 random integers.

**3-browser gate** (`experiments/colsdrive.cjs` + `www/cols.html`, 4 fresh pages per build, alternating, ratio of medians, `results/cols-g*-*.json`). Warm reads, shown as Chromium 156 / Firefox 158 / WebKitGTK 2.52.6:

| Data | `unpackColumns` | `unpack` (rows) | First `unpackColumns` on a page |
|---|---|---|---|
| Taxi 300k, on 0.9.3 | **0.57 / 0.69 / 0.80** | **0.70 / 0.79 / 0.88** | 0.75 / 0.69 / 0.81 |
| Taxi 300k, null-plane build | **0.61 / 0.66 / 0.65** | 0.69 / 0.75 / 0.86 | 0.77 / 0.64 / 0.70 |
| Orders 100k, on 0.9.3 | 0.72 / 0.79 / 1.03 | 0.81 / 0.91 / 1.00 | 0.92 / 0.74 / 0.93 |
| Orders 100k, null-plane build | 0.82 / 1.08 / 1.12 | 1.08 / 0.92 / 1.01 | 0.88 / 1.16 / 1.08 |
| Sensors with nulls 300k, on 0.9.3 | 0.97 / 0.95 / 1.05 | 0.90 / 0.87 / 1.07 | 1.02 / 0.86 / 1.12 |
| GitHub events 200k, on 0.9.3 | 1.01 / 1.01 / 0.95 | 0.99 / 0.98 / 0.95 | 0.98 / 1.03 / 0.92 |

- The worst cells are orders on the null-plane build in Firefox and WebKit (1.08 to 1.16). Those reads take 13 to 29 ms, so the difference is 1 to 3 ms, near the 1 ms timer step. They need more rounds before anything ships.

**Against parquet-wasm.** On the same taxi rows, E17 measured parquet-wasm 0.9.0 at 102 / 103 / 105 ms, against 1.1 to 2.0 times that for lfc-pack. Now:
- 0.9.3 + B20 takes 122 / 112 / 108 ms.
- The null plane + B20 takes **107 / 85 / 69 ms**, so it reads columns faster than parquet-wasm in Firefox and WebKit and about evenly in Chromium. The file is 0.85 of parquet's size.
- The null-plane build's own baseline matches E17's research stack (176 / 130 / 106 against 167 / 134 / 115), so the two sessions line up.

**Stacked with the null plane**, taxi columns against 0.9.3:

| | Null plane alone | B20 alone | Expected if independent | Both |
|---|---|---|---|---|
| Chromium / Firefox / WebKit | 0.82 / 0.79 / 0.78 | 0.57 / 0.69 / 0.80 | 0.47 / 0.55 / 0.62 | 0.50 / 0.52 / 0.51 |

The pair beats the sum in Firefox and WebKit, and is about even in Chromium. The null plane turns most `j` blocks into typed columns, and B20 removes the cost of the all-null blocks the null plane leaves as `j`.

**Lead this opened:** the writer could store an all-null column as a null-plane column with no values. That would be a format change, so it belongs with B13's format minor version.

Decision: **ADOPT CANDIDATE** (read-only, no format change). Owner card, 12:50 AM Eastern 11.12.

## Backlog (prioritized)

Each entry: technique · source · LFC Foundry target · expected advantage · evidence strength · difficulty · compatibility risk · experiment · measured result · decision.

**B1. UUID text to bytes with char codes.** Source: general byte-codec practice (table lookup; same as LFC-pack's own `H` path). Target: lfc-pack `src/flat.js` `encodeColumn` `U` branch. Advantage: pack 0.74 to 0.91 on UUID-heavy blocks. Evidence: strong (3 browsers, paired fresh pages, same bytes). Difficulty: trivial (one line). Risk: none, same bytes. Experiment: E3. **ADOPT CANDIDATE.**

**B2. Choose the encoding from a sample, compress the winner once.** Source: BtrBlocks (SIGMOD 2023). Target: lfc-pack flat writers' `cand()`; later memory-compression's chooser, whose packing was 23 to 52 times slower than jso fast in the October study. Advantage: pack 0.85 to 0.96 on number and log data; zstd input down 49% on sensors. Evidence: moderate to strong (3 browsers, 6 to 8 paired rounds, same bytes on 10 made-up sets; real corpus not yet run). Difficulty: low to medium. Risk: a wrong pick makes a file bigger. Mitigation: exact comparison when the top two are within 2%, plus a corpus size gate. Experiment: E2, then the corpus size gate, then early-stop A/B. **ADOPT CANDIDATE.**

**B3. Keep long numbers on the fast flat writer (per-column fallback instead of per-block).** Source: our own profile. The principle matches how Parquet and ORC writers fall back one column at a time. Target: `wasm/flatscan.c` and the `src/flat.js` fast writer. Advantage: pack 0.67 to 0.86 on blocks with long, exponent or `-0` numbers; 0.50 to 0.54 stacked with B1 and B2. Evidence: strong (3 browsers, byte-identical on 19 sets including edge cases, full test suite passes). Difficulty: medium (wasm rebuild, 38 lines). Risk: low to medium, because numbers must stay exact. This is covered by the edge sets and by the mantissa / 10^digits argument in E5. Experiment: E5. **ADOPT CANDIDATE.**

**B3b. Mixed-kind keys (nullable numbers and strings, string/number mixes) stay on the fast writer.** Source: our own profile. The principle is the same per-column fallback as B3. Target: `wasm/flatscan.c`, `src/flat.js`, `src/api.js` (layout guard). Advantage: pack 1.6 to 2x slower today on a block with 1% nulls in one column, and the prototype removes that (E6). Evidence: real-corpus count (gen_sparse), the headroom run, and 41/41 byte-identical sets. Difficulty: medium (65 changed lines with B3). Risk: low to medium, covered by the edge sets and the layout guard. **ADOPT CANDIDATE (v3)**: wins 0.50 to 0.93 where up to about half the cells are mixed, the worst case is even (0.94 to 1.05), and a control gate is required (E6).

**B14. Late materialization for range reads: test the range column, then build only the matching rows.** Source: column-store materialization strategies (Abadi, Myers, DeWitt and Madden, ICDE 2007; not re-fetched this session); the selection vectors used by vectorized engines work the same way. Target: lfc-pack `src/flat.js` (`readSel`) and `src/api.js` (`unpackSome`, `blockInside`). Advantage: 1% range reads take 0.31 to 0.85 of the time, and 0.45 to 0.72 with `keys`. Evidence: strong (3 browsers, paired fresh pages, 252/252 same rows, worst case even when each mode runs on its own page). Difficulty: low (about 45 lines, no wasm). Risk: low, read path only, no format change; the narrow-then-wide sequence ran 1.04 to 1.29 slower in one page and must be gated. Experiment: E7. **ADOPT CANDIDATE.**

**B13. Validity bitmap (null plane) for nullable typed columns.** Update (E11): a real prototype (`experiments/b13-null-plane.diff`), same rows on 21 files, byte-identical on files without nullable columns. Stacked with B3b: pack 0.65 to 0.86, full read 0.50 to 0.92, 14 to 24% smaller in 3 browsers. **ADOPT CANDIDATE as a format minor**, owner's call (three readers). Original entry: Source: Arrow's validity bitmap ([Columnar.html](https://arrow.apache.org/docs/format/Columnar.html), not re-fetched this session); Parquet definition levels. Target: the LFC-pack flat layout. Advantage: files 11 to 16% smaller when a number or text column has any nulls (1 to 4% for true/false), column reads 0.44 to 0.66 of the time (E8). Evidence: strong on made-up data; the real corpus has only one such flat key (1.4%). Risk: high, format change for three readers. **DEFER**, proposal in `PROPOSAL-null-plane.md` (new column type `N`, so old readers refuse safely).

**B3c. Remaining scanner bail-outs** (list items over 32 bits, code 9; scaled values of 2^50 or more; integer-like or `__proto__` keys). Evidence: code 9 hit once in 13 FHIR blocks, and that block is nested anyway. **DEFER** (rare in the corpus).

**B4. Byte-budgeted admission and backpressure for worker pools.** Source: LZ4 1.11 multithreading and memory option (see the Codex handoff docs). Target: lfc-pack pool, Workbench import. **Owned by the Codex handoff thread; not duplicated here.**

**B5. Faster entropy and integer decoding (Huffman-only literals, ANS swaps, Stream VByte, FastLanes-style transposed bit-packing, wasm SIMD unpack).** Sources: zstd's Huffman and FSE decoders; Stream VByte (Lemire, Kurz and Rupp, Information Processing Letters, 2018); FastLanes (Afroozeh and Boncz, PVLDB 2023). Not re-fetched this session. Target: `unpackColumns`, `keys` reads, memory-compression scans. Advantage: under 15% on a full `unpack` (E1 ceiling); possibly more on column-only reads. Evidence: E1 caps it. Difficulty: high, and it changes the format for varint and bit-pack layouts. **DEFER** until a column or query path is the bottleneck. Then measure the `unpackColumns` decode share first. Idea 9 in `FORMAT-IMPROVEMENT-IDEAS-2026.10.30.md` (aligned bit-pack groups) belongs here too.

**B6. Skip zstd on incompressible frames.** Sources: Brotli `ShouldCompress`, zstd raw blocks, LZ4 and Snappy skip heuristics. Target: zstd glue. Advantage: 4 to 5% or less of pack. Evidence: measured headroom (E1/E4). **DEFER** (fold into B2 if ever done).

**B7. Trained or static dictionaries for small files.** Update (E12, real libzstd 1.5.5): built-in saves 11 to 24% of a 10-row file (not 15 to 31%), per-app 15 to 28%, trained dictionaries lose to raw content at these sizes. Built-in stays REJECT, per-app DEFER. Original entry: Source: zstd dictionaries (`ZSTD_compress_usingDict`, `ZDICT_trainFromBuffer`); Brotli's built-in static dictionary. Not re-fetched this session. Target: small LFC-pack files and app saves (Netflow map files use `packTables`; Story Editor and Mind Mapper do not use LFC-pack today). Measured (E9): fixed parts are 350 to 840 bytes per file; a built-in dictionary saves an estimated 120 to 320 bytes (15 to 31% of a 10-row file, 1 to 3% at 1,000 rows), and a 10-row file stays larger than gzip. Risk: high (format change, dictionary kept forever, wasm grows). **REJECT for now**, proposal with numbers in `PROPOSAL-small-file-dictionary.md`.

**B15. Faster row objects without generated code.** Source: our own profile (E7). Building rows with one keyed store per column costs 4 to 7 times generated object literals (`rows: 'generated'`, opt-in because of CSP), and is half garbage collection. No CSP-safe way tried (row-major, column-major, template clone) came close. **DEFER**; recorded so the next attempt starts from these numbers.

**B16. Smaller skip units for range reads.** Update (E10): 4 MB flat blocks with B14 take 0.12 to 0.29 of the time for a 1% range on logs and sensors (0.56 to 0.78 mixed), the full read 0.81 to 1.02, up to 3.3% bigger. Nested stays at 13 MB (full read 1.04 to 1.15 at 4 MB). **ADOPT CANDIDATE with B14** (writer default, no format change). Original entry: Source: Parquet page index and ORC row groups (see B8). Default blocks hold 13 MB of text, so a 1% range opens a whole block (E7: `range1` costs the same as `range10`). Next experiment: smaller `blockBytes` (1, 2, 4 MB) for size against range-read time, which needs no format change. **EXPERIMENT** (after B14, which removes most of the per-row cost inside an opened block).

**B17. Save as a delta of the previous save (zstd prefix, like `zstd --patch-from`).** Source: zstd `ZSTD_CCtx_refPrefix` and `--patch-from` (zstd 1.4.5 and later; not re-fetched this session). Target: autosave and history for Netflow map saves, Story Editor and Mind Mapper autosave, Workbench snapshots. Advantage (E12, sizes only): an edited 2,000-node map 1,258 bytes instead of 22,845 (6%), an edited 200-node map 27%, 10 rows appended to 1,000 orders 10%, to logs 47%. Evidence: real zstd, made-up edits; no speed numbers yet. Difficulty: medium to high: the wasm build has no prefix call today, and a delta file is unreadable without the earlier file, so it needs an API (`pack(rows, { base })`) and a container flag that names the base, plus a rule to write a full save every few saves. Risk: high (format and app change). E13: frame-to-frame prefixes stay under 16% of a full save after 500 edits, and native zstd time is 0.25 to 0.75 of a full save. Browsers (E13): the zstd step of a delta save is 0.23 to 0.37 of a full save's, decoding 0.07 to 0.20; zstd is about a tenth of a whole save, so the gain is size. **ADOPT CANDIDATE for a proposal.**

**B18. Faster saves from row objects.** Source: our own profile against parquet-wasm 0.9.0 (E17). Target: `packRows`, `packTables` (app saves), Workbench import. (a) Stringify big arrays in slices: 0.80 to 1.08, EXPERIMENT. (b) Read row objects straight into columns, no JSON text: up to about 2x on saves if it reaches parquet-wasm's speed. Evidence: profiles plus rival timing. Difficulty: (a) low, (b) high. Risk: bytes must stay identical; (b) is a second writer front end. **EXPERIMENT.** Update (E19): (b) built as B18b with a size and string-share gate. Over 0.9.3, big tables save in 0.51 to 0.90 of the time in 3 browsers, files are 0.999 to 1.000 of the size, and files under the gate are byte-identical. (a) stays DEFERRED. **B18b: ADOPT CANDIDATE**, owner card 11:43 PM Eastern.

**B19. Equality reads through dictionary codes.** Source: the Codex research branch (DuckDB and Parquet dictionary filtering; KB M110). Target: `unpack(file, { equals })`, Netflow category filters, Workbench queries. 3-browser gate in E20: 24 queries 0.53 to 0.79 of today (0.10 to 0.37 with the opt-in cache), absent values 0.02 to 0.05, better than the sum with the null plane on first queries. **ADOPT CANDIDATE**, owner card 12:04 AM Eastern 11.12.

**B20. Faster column reads: JSON cells and one-pass zigzag.** Source: our own profile against parquet-wasm (E17, E23). Target: `unpackColumns` and `unpack` on tables with nullable or money columns (Netflow, Workbench). Taxi columns take 0.57 to 0.80 of the time, and rows 0.70 to 0.88. With the null plane, columns are faster than parquet-wasm in Firefox and WebKit. Same values, no format change. Difficulty: low. Risk: an engine-specific branch, which lfc-pack already uses for address and list columns. **ADOPT CANDIDATE**, owner card 12:50 AM Eastern 11.12.

**B8. Page-level indexes and string zone maps or Bloom filters for random access.** Sources: Parquet page index ([PageIndex.md](https://github.com/apache/parquet-format/blob/master/PageIndex.md)); ORC row index (10,000-row stride) and Bloom filters. Not re-fetched this session. Target: LFC-pack footer sections 3 and 4 (reserved), Workbench filters. Advantage: query throughput and less read amplification. LFC-pack already has number zone maps (section 5), `keys` reads and XXH64 prefix checks. Evidence: none locally (no query workload yet). **DEFER**, with a design ready: measure the bytes read per filtered query on a 1 GB Workbench file with and without block skipping.

**B9. Arrow string-view layout (length plus 4-byte prefix, inline short strings) for column reads.** Source: the Arrow columnar format's variable-size binary view layout ([Columnar.html](https://arrow.apache.org/docs/format/Columnar.html)). Not re-fetched this session. Target: `unpackColumns` string columns and Workbench sort and filter. Advantage: comparisons and filters without building JS strings. **DEFER** (no column-query workload measured; ties into B5 and B8).

**B10. Dictionary-encoding cutoffs.** Source: ORC `orc.dictionary.key.threshold` = 0.8 ([config page](https://orc.apache.org/docs/core-java-config.html), checked); Parquet's dictionary page size fallback. **ALREADY HAVE.** LFC-pack tries `D` only at n/4 distinct values or fewer and stops counting past n/2. No action.

**B11. Independent blocks, parallel pack and known-size whole-buffer decoding.** Sources: zstd and LZ4 multithreading; libdeflate's whole-buffer API. **ALREADY HAVE.** Blocks are independent, `packParallel` exists, frames declare raw lengths, and `decompressView` reuses its output buffer.

**B12. zstd block boundaries.** Source: zstd 1.5.7 release notes ("slightly improve compression ratio across all levels thanks to better block boundaries", [v1.5.7](https://github.com/facebook/zstd/releases/tag/v1.5.7), checked). LFC-pack already builds zstd 1.5.7. **No action.** An earlier draft of this log claimed a named "pre-splitter" parameter; the release notes do not say that, so the claim was dropped.

## Rejected or parked ideas (do not rediscover)

| Idea | Why | Where recorded |
|---|---|---|
| Cheaper zstd level for Workbench import | No speed gain, 7% bigger | catalog M60 |
| Lazy row view objects | 300k views cost as much as objects; Firefox 7% slower | catalog (lfc-pack, R-series) |
| Rows as text, then one `JSON.parse` | Slower | catalog |
| Third parse helper for Workbench import | No gain on 4 cores | catalog M60 |
| Adopting LZ4, or copying its worker count or benchmark percentage | No local evidence | Codex handoff PERFORMANCE-VALIDATION.md |
| Aliasing caller Buffers to skip copies | Loses caller-memory safety | same |
| Speculative SIMD without a measured hot loop | Weak evidence | same; E1 caps decoder-side SIMD on full unpack |
| Order-0 entropy skip on its own (B6) | Under 5% headroom; misses repeated IDs | this log, E4 |
| Built-in zstd dictionary for small files (B7) | Saves 120 to 320 bytes per file (real zstd: 11 to 24% of a 10-row file); format change | this log, E9, E12 |
| Trained (`ZDICT`) dictionary from one app's earlier rows | Lost to a raw-content dictionary on almost every small file (too few samples) | this log, E12 |
| 1 MB blocks | Range reads faster still, but pack up to 1.24x and nested full reads up to 1.21x slower | this log, E10 |
| Raw block for tiny inputs | Smaller below about 20 rows, but `unpackColumns` refuses it and it loses at 100 rows | this log, E9 |

## Reproduce

`experiments/run.sh` reruns everything (about 10 minutes on 4 cores, most of it browser pages). It needs the three test browsers from the knowledge-base `browsers` branch and the story-editor qa-kit drivers. Raw results are in `results/`. Generated data and instrumented copies are not committed (`experiments/.gitignore`).

## Limits of this round

- The data is made up and seeded. A real corpus (FHIR, Netflow maps, Workbench imports) is required before B2 ships.
- One noisy shared 4-core cloud box. Ranges are wide in Firefox, so use the medians. There were no laptop, tablet or phone runs. Per the owner's device rule, laptop and tablet come first for JS-modules.
- Main-thread, single-threaded packs only. Memory (RSS, heap), allocation counts and concurrency were not measured this round.
- Rival comparisons used each library's defaults as of 2026-11-11 and research builds; Parquet files came from pyarrow (one row group). DuckDB did not run in Firefox (no network for its extension).
- E12 sizes leave frames stored without zstd as they are, so the delta numbers for files with many such frames (orders with the null plane) are pessimistic. Node jobs ran beside some browser runs; the noisy cell was rerun on its own.
- Upstream items marked "not re-fetched this session" are cited from earlier knowledge. Recheck the exact lines before a design is built on them.
