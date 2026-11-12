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
11. **The null plane stacks with B3b (added 9:20 PM Eastern).** A real prototype of the `N` type, stacked with mixed kinds: pack 0.65 to 0.86, full read 0.50 to 0.92, files 14 to 24% smaller on data with nullable columns in all 3 browsers. Files without such columns are byte-identical. Still a format change, so it goes to the owner (E11, `PROPOSAL-null-plane.md`).
12. **Real zstd dictionaries save less than estimated, but the previous save is a big lever (added 9:20 PM Eastern).** A built-in dictionary saves 11 to 24% of a 10-row file, an app dictionary 15 to 28%. Using the previous version of the same document as the dictionary makes an edited 2,000-node map 6% of its size (22,845 to 1,258 bytes) and a 10-row append to 1,000 orders 10% (E12, new lead B17).
13. **Deltas stay small for hundreds of edits (added 9:30 PM Eastern).** Compressing each frame against the same frame of the previous save keeps a 2,000-node map at 3% of a full save after 1 edit and 16% after 500, and native zstd time drops to 0.25 to 0.75 of a full save. Browser timing needs a zstd wasm with the prefix calls (E13).

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
- **No browser numbers yet.** The shipped zstd wasm (`wasm/zstd-glue.c`) exports no prefix call, and building one needs the pinned zstd 1.5.7 source, which `wasm/build.sh` downloads. That download was refused in this session's sandbox (E12), so the browser step waits for the owner.

**Decision: B17 stays EXPERIMENT**, now with sizes and native times. Next: a research wasm with `ZSTD_CCtx_refPrefix` and `ZSTD_DCtx_refPrefix`, timed in the 3 browsers on the map sequence, then a proposal (API `pack(rows, { base })`, a footer flag naming the base by its XXH64, and the 25% full-save rule).

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

**B17. Save as a delta of the previous save (zstd prefix, like `zstd --patch-from`).** Source: zstd `ZSTD_CCtx_refPrefix` and `--patch-from` (zstd 1.4.5 and later; not re-fetched this session). Target: autosave and history for Netflow map saves, Story Editor and Mind Mapper autosave, Workbench snapshots. Advantage (E12, sizes only): an edited 2,000-node map 1,258 bytes instead of 22,845 (6%), an edited 200-node map 27%, 10 rows appended to 1,000 orders 10%, to logs 47%. Evidence: real zstd, made-up edits; no speed numbers yet. Difficulty: medium to high: the wasm build has no prefix call today, and a delta file is unreadable without the earlier file, so it needs an API (`pack(rows, { base })`) and a container flag that names the base, plus a rule to write a full save every few saves. Risk: high (format and app change). E13: frame-to-frame prefixes stay under 16% of a full save after 500 edits, and native zstd time is 0.25 to 0.75 of a full save. Next experiment: a research wasm with the prefix calls, timed in the browsers, then a proposal. **EXPERIMENT.**

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
- E12 sizes leave frames stored without zstd as they are, so the delta numbers for files with many such frames (orders with the null plane) are pessimistic. Node jobs ran beside some browser runs; the noisy cell was rerun on its own.
- Upstream items marked "not re-fetched this session" are cited from earlier knowledge. Recheck the exact lines before a design is built on them.
