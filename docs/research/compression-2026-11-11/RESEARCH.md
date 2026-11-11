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
5. **New lead B3: full-precision decimals push a whole block onto the slow writer.** One column of 17-digit decimals (such as `Math.random()` output) makes the fast flat writer decline the whole block, so the block goes to the `JSON.parse` writer. The UUID/hash test set packs at about 1,000 ms per 45 MB, against about 370 ms per 44 MB for logs. Without that one column, the fast writer takes the block.
6. **Skipping zstd on incompressible frames (the Brotli and zstd raw-block idea) has little headroom.** Even on the UUID/hash/random set, frames that end up stored raw cost only 4 to 5% of pack time, because zstd is already quick on random bytes. Deferred.

Speed numbers come only from the three test browsers. Node was used only for pass/fail checks, byte counts and finding hot spots, never for timing.

## Environment and method

- **Machine:** a 4-core Linux x86_64 cloud container with 15 GB of RAM, shared and noisy. This is not a qualification device. Laptop, tablet and phone runs are still to do.
- **Browsers:** ungoogled Chromium 156.0.8078.79 (Playwright 1.63), Firefox 158.0 (WebDriver BiDi through puppeteer-core 25.16.0) and WebKitGTK 2.52.6 (WebKitWebDriver). All come from the knowledge-base `browsers` branch and ran one at a time.
- **Code:** JS-modules `main` at `69049ec` (lfc-pack 0.8.1). The variants are string patches of the built `lfc-pack.js` (`experiments/mkvar.py`). Nothing in `modules/` was changed.
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

### 2026-11-11 E4: skip zstd on incompressible frames (measured headroom only)

**Upstream:**
- Brotli's encoder `ShouldCompress` ([encode.c](https://github.com/google/brotli/blob/master/c/enc/encode.c), checked on `master` this session) samples every 13th byte (`kSampleRate = 13`) into a 256-bin histogram. It skips compressing when the data is nearly all literals (`num_literals > 0.99 * bytes`, inside `num_commands < (bytes >> 8) + 2`) and the estimated entropy is above `kMinEntropy = 7.92` bits per byte.
- zstd stores a block raw when compressing does not shrink it.
- LZ4 (`LZ4_skipTrigger = 6`, [lz4.c](https://github.com/lz4/lz4/blob/dev/lib/lz4.c), `dev` branch) and Snappy ("heuristic match skipping": `skip = 32`, `bytes_between_hash_lookups = skip >> 5`, [snappy.cc](https://github.com/google/snappy/blob/main/snappy.cc)) both widen the search step after repeated misses, so they move quickly through random input.

**Measured headroom:** on the `ids` set, frames that end up stored raw (UUID, hex, random doubles) cost 4 to 5% of pack time in all three browsers (E1). zstd already moves fast through random bytes, and LFC-pack's fast writer already stops a losing candidate once it overflows its byte limit. **Decision: DEFER.** The ceiling is under 5%, and an order-0 entropy check cannot see repeated IDs (foreign keys), so it could make some files bigger. If ever done, combine it with B2: a sample that does not compress marks the frame stored.

## Backlog (prioritized)

Each entry: technique · source · LFC Foundry target · expected advantage · evidence strength · difficulty · compatibility risk · experiment · measured result · decision.

**B1. UUID text to bytes with char codes.** Source: general byte-codec practice (table lookup; same as LFC-pack's own `H` path). Target: lfc-pack `src/flat.js` `encodeColumn` `U` branch. Advantage: pack 0.74 to 0.91 on UUID-heavy blocks. Evidence: strong (3 browsers, paired fresh pages, same bytes). Difficulty: trivial (one line). Risk: none, same bytes. Experiment: E3. **ADOPT CANDIDATE.**

**B2. Choose the encoding from a sample, compress the winner once.** Source: BtrBlocks (SIGMOD 2023). Target: lfc-pack flat writers' `cand()`; later memory-compression's chooser, whose packing was 23 to 52 times slower than jso fast in the October study. Advantage: pack 0.85 to 0.96 on number and log data; zstd input down 49% on sensors. Evidence: moderate to strong (3 browsers, 6 to 8 paired rounds, same bytes on 10 made-up sets; real corpus not yet run). Difficulty: low to medium. Risk: a wrong pick makes a file bigger. Mitigation: exact comparison when the top two are within 2%, plus a corpus size gate. Experiment: E2, then the corpus size gate, then early-stop A/B. **ADOPT CANDIDATE.**

**B3. Keep full-precision decimals on the fast flat writer.** Source: our own profile. The principle is per-column fallback instead of per-block fallback, the way Parquet and ORC writers fall back from dictionary to plain for one column at a time. Target: `wasm/flatscan.c` and the fast writer. Today one column of 17-significant-digit decimals sends the whole block to the `JSON.parse` writer. Advantage: unknown until measured. The upper bound is pack time on such blocks moving from about 1,000 ms toward the about 370 ms of the fast path (300,000 rows). Evidence: moderate (profile plus a drop-one-column test; no A/B yet). Difficulty: medium. Exact decimal-to-double parsing in wasm is the hard part; marking the column for a JS parse is easier. Risk: medium, because number values must stay exact. Experiment: build a variant that sends only that column through `JSON.parse` of a joined array; byte-identical file and three-browser A/B. **EXPERIMENT (next).**

**B4. Byte-budgeted admission and backpressure for worker pools.** Source: LZ4 1.11 multithreading and memory option (see the Codex handoff docs). Target: lfc-pack pool, Workbench import. **Owned by the Codex handoff thread; not duplicated here.**

**B5. Faster entropy and integer decoding (Huffman-only literals, ANS swaps, Stream VByte, FastLanes-style transposed bit-packing, wasm SIMD unpack).** Sources: zstd's Huffman and FSE decoders; Stream VByte (Lemire, Kurz and Rupp, Information Processing Letters, 2018); FastLanes (Afroozeh and Boncz, PVLDB 2023). Not re-fetched this session. Target: `unpackColumns`, `keys` reads, memory-compression scans. Advantage: under 15% on a full `unpack` (E1 ceiling); possibly more on column-only reads. Evidence: E1 caps it. Difficulty: high, and it changes the format for varint and bit-pack layouts. **DEFER** until a column or query path is the bottleneck. Then measure the `unpackColumns` decode share first. Idea 9 in `FORMAT-IMPROVEMENT-IDEAS-2026.10.30.md` (aligned bit-pack groups) belongs here too.

**B6. Skip zstd on incompressible frames.** Sources: Brotli `ShouldCompress`, zstd raw blocks, LZ4 and Snappy skip heuristics. Target: zstd glue. Advantage: 4 to 5% or less of pack. Evidence: measured headroom (E1/E4). **DEFER** (fold into B2 if ever done).

**B7. Trained or static dictionaries for small files.** Source: zstd dictionary training (`lib/zdict.h`, `ZDICT_trainFromBuffer`); Brotli's built-in static dictionary. Not re-fetched this session. Target: small LFC-pack files and app saves (Story Editor, Mind Mapper), where frame overhead and short meta JSON dominate. Advantage: size only, on small files. Difficulty: medium. Risk: high, because frames are "no dictionary" today (`LAYOUT-SPEC.md` 1.1), so this is a format change. Related: shared tables (`share: true`) and idea 5 in the format-ideas file. **DEFER** until a small-file workload shows that size matters there. The owner's rule is speed over size.

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

## Reproduce

`experiments/run.sh` reruns everything (about 10 minutes on 4 cores, most of it browser pages). It needs the three test browsers from the knowledge-base `browsers` branch and the story-editor qa-kit drivers. Raw results are in `results/`. Generated data and instrumented copies are not committed (`experiments/.gitignore`).

## Limits of this round

- The data is made up and seeded. A real corpus (FHIR, Netflow maps, Workbench imports) is required before B2 ships.
- One noisy shared 4-core cloud box. Ranges are wide in Firefox, so use the medians. There were no laptop, tablet or phone runs. Per the owner's device rule, laptop and tablet come first for JS-modules.
- Main-thread, single-threaded packs only. Memory (RSS, heap), allocation counts and concurrency were not measured this round.
- Upstream items marked "not re-fetched this session" are cited from earlier knowledge. Recheck the exact lines before a design is built on them.
