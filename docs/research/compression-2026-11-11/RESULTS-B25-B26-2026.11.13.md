# B25 + B26: wasm number kernel and folded gate check for saves (E31)

Research, 2026.11.12 11:21 PM to 2026.11.13 12:00 AM Detroit time, by "Research compression and data performance, part 2". It's research only: nothing in `modules/` was pushed. The base is lfc-pack 0.10.1 (main `0af469e`, which has P13 and P14) plus B21 (`b21-patch-writer.py a,b,c`). That base equals part 1's `v-100ppw.js`, byte for byte, at 494,039 bytes.

## What changed

- **B25: wasm number kernel.** One `numcol` call per number column, added to `flatscan.c`, does all of the following.
  - It finds whether the column is monotone, and its min and max.
  - It writes every varint form in one pass: zigzag of each value, zigzag of the differences, and, while the column stays monotone, the plain differences.
  - It applies the general writer's 5% rule (mode 0) or the fast writer's rule for 0 to 2 fraction digits (mode 1).
  - It bit-packs the offsets from the min when the range is under 2^24.
  - It runs on its own instance of the flat-scan module, so it never touches the fast writer's memory.
  - It replaces `numStats`, `numFirst`, `numDeltaZz`, `vlenSum`, `varintsT`, `numOff` and `bitpack` in `numGeneral` (general writer) and `numCands` (fast writer), for columns of 64 or more values.
- **B25b: two more checks moved into wasm.**
  - `b21Flags` now runs in wasm as `numflags`. It finds -0, whole numbers under 2^50, and (for B26) NaN or infinity.
  - The writer's zone-map min and max reuse the kernel's min and max, divided by the scale. That is exact, because `x / scale === v` was already proven for every value.
- **B25c: a faster kernel.** It has a branchless zigzag, varints written as one 8-byte store, a 32-bit bit-pack flush, and one pass instead of two. In native code the kernel went from 70 to 45 ms on 14 random columns of 300k values. Inside a Chromium taxi save the kernel took 72 to 86 ms before this change (instrumented build, `nkt.html`).
- **B26: the save gate check is folded in.** `packRows` used to scan every value with `flatScalars` before taking the row path, which was about 9% of the taxi save.
  - Now it checks only the first and last 1,024 rows up front.
  - The writer then checks each row (a plain object) and each column: typed number columns through the wasm flags, other columns with one `typeof` loop.
  - On the first value that isn't a flat scalar it throws `B26_BAIL`. `packRows` catches it and takes the text path, exactly as before.
  - The first B26 version checked each value inside the scatter loop. That made WebKitGTK repeat saves 1.09 to 1.27x slower (`w1.json`), so it was replaced by the per-column checks (B26b).

## Same bytes

- Files are byte-identical to B21 on 19 files in all 3 save modes (packRows, pack, exact): the 15 seeded sets (logs, events, sensors, ids, repeat at 100, 10k and 100k rows), 2 edge sets (negatives, near 2^49, 1 to 9 decimals, nulls, constant, monotone, wide ranges), and the taxi rows as stored and sorted.
- The same holds with the kernel forced onto every column (`__NKMIN=1`, `same1.cjs`).
- 15 odd-row cases come out the same bytes, or the same error, as B21 (`bail.cjs`): a nested object, an array value, -0 (decimal and whole), NaN, Infinity, undefined, a function, a class instance, an array row, a null row, a null-prototype row, a BigInt, and mixed kinds.
- `node test/run.js`: all lfc-pack checks pass.

## Speed (packRows, fresh page per build per round, alternating order; `sv2.html`, `svd.cjs`)

Share of B21's time. "First save" is the first `packRows` on a fresh page; "repeat" is the median of the next 3. Each cell shows the ratio of medians ± the SE of the per-round ratios. Chromium 156.0.8078.79 (5 rounds), Firefox 158 (4), WebKitGTK 2.52.6 (5). Weights are 60/15/25.

| Data | | B25 only (C / F / W) | Weighted | B25 + B26 (C / F / W) | Weighted |
|---|---|---|---|---|---|
| Taxi 300k (real) | first save | 0.70 / 0.72 / 0.70 | 0.70 | 0.65 / 0.64 / 0.61 | **0.64** |
| | repeat | 0.69 / 0.63 / 0.73 | 0.69 | 0.56 / 0.63 / 0.59 | **0.58** |
| Sensors 100k (nulls) | first save | 0.64 / 0.70 / 0.82 | 0.69 | 0.64 / 0.69 / 0.70 | **0.66** |
| | repeat | 0.70 / 0.69 / 0.86 | 0.74 | 0.62 / 0.71 / 0.74 | **0.66** |
| Logs 100k (mostly text) | first save | 1.04 / 0.95 / 0.87 | 0.99 | 1.02±0.03 / 0.99 / 0.86 | 0.98 |
| | repeat | 1.00 / 0.87 / 0.90 | 0.96 | 1.00 / 0.90 / 0.91 | 0.96 |

- No cell is slower beyond 2x SE. Logs in Chromium (1.02 ± 0.03 first save) is inside noise, and the earlier Chromium screen (`c3.json`) had it at 0.91.
- The part 1 forecast was "about 0.65 of B21". The result is 0.64 on a first save and 0.58 on repeat saves (taxi, weighted).

## Against a rival (same taxi row objects, `rvs.html`, 3 rounds)

parquet-wasm 0.9.0 with Arrow JS 21.2.0 `tableFromJSON`, writing zstd Parquet:

| ms (first / repeat) | Chromium | Firefox | WebKitGTK |
|---|---|---|---|
| parquet-wasm | 868 / 767 | 1018 / 951 | 986 / 856 |
| lfc-pack B21 | 852 / 631 | 671 / 606 | 726 / 537 |
| lfc-pack B25 + B26 | **512 / 351** | **391 / 363** | **455 / 335** |

- B25 + B26 takes 0.38 to 0.59 of parquet-wasm's save time.
- The file is 3,680,842 bytes against 4,659,071, so 0.79 of the size.

## Stack test

- **With P13 + P14:** both are in the 0.10.1 base, and every number above includes them. They are reader changes, and the files are byte-identical, so reads don't change.
- **With B24 (idle read-ahead):** it's a reader change on byte-identical files, so there is no interaction.
- **With P13b / P13c:** these are reader-only, so there is no interaction.
- **With B22 (small first block):** I added an approximate head block to the B18b row path (first slice about 64 KiB of rows when the rows come to more than 4 MiB). On top of it, the B25 + B26 files are byte-identical to B21 + B22.
  - Taxi save with B22: 0.62 first save, 0.60 repeat (Chromium, `c5.json`), the same as without B22. **The gains add up.**
  - **New finding about B22 itself:** on sensors 100k (10 MB of text), B22 makes Chromium row saves **1.16 to 1.20x slower** (`c7.json`).
    - Timing each block (`bt.html`) shows why. The 646-row head block costs 1 to 13 ms. After it, the big block is slower for the first 2 to 4 saves on a page (107 to 140 ms against 91 to 117 ms). The writer is JIT-optimized on the small block, then re-optimized on the big one. By the 5th save the two are even.
    - This is the same moved-warm-up effect as E28, now on the save side.
    - B25 + B26 still give 0.73 to 0.76 of B21 + B22 there.
    - Part 1 only measured B22 on `packStream`, so the code thread should know about this when it adds B22 to `packRows`. One option is to keep the head block on the text path only.

## Size

- `flatscan.wasm` grows from 19,809 to 21,991 bytes (+2.2 KB), and `flatscan-plain.wasm` from 17,044 to 19,222.
- `lfc-pack.js` grows from 494,039 to 504,750 (+10.7 KB, mostly the two base64 copies of flatscan). `lfc-pack-read.js` grows by 2.8 KB.
- Files: unchanged (byte-identical).

## Pairings (stack ideas)

- **B25 + B21:** B21 already gathers number columns into Float64Arrays. A next step is to have the B21 scatter write straight into the kernel's wasm memory, which removes one copy per column (about 1 to 2 ms on taxi). Test it against B25 alone.
- **B25 + column-parallel saves (lead 3):** the kernel is pure and works on typed arrays. Pool workers could each run their own kernel instance on transferred Float64Arrays.
- **B26 + B18b:** with the gate pass gone, the row path's remaining fixed cost is `b18Pays` (one `JSON.stringify` of 1,024 rows, under 1%).
- **B22 x row path:** see the stack finding above. It needs its own test before B22 lands on `packRows`.

## Remaining save profile (Node, attribution only, B25b)

- The scatter (rows to columns) is about 33% of writer ticks.
- zstd is about 13%.
- The kernel is about 15% before B25c.
- `encodeColumn0` is about 5%.
- GC is under 4%.
- The next big lead is the scatter itself: a `for...in` over each row costs this much in every engine.

## Files (this folder)

- `b25-b26-on-b21-0.10.1.diff`: what to apply on top of B21.
- `b21-b25-b26-on-0.10.1.diff`: everything on top of main 0.10.1.
- The wasm needs a rebuild with `wasm/build-flatscan.sh` (clang 18.1.3 reproduces the committed binaries), then `python3 build.py`. `tpl4.wasm` must stay as committed.
- `results/*.json` holds the raw timings: `c*` Chromium, `f*` Firefox, `w*` WebKitGTK, and `weighted.json`.
- `tools/` holds the pages, drivers, the same-bytes and bail checks, and the chart script.
- `B25-B26-saves-options.png` is the card picture.

## Limits

- One shared 4-core cloud box. No laptop, tablet or phone runs yet.
- Rival numbers come from 3 rounds, and the speed numbers from 4 to 5 rounds.
- The B22 row-path head block is an approximation; the code thread's version may cut differently.
- The kernel threshold (64 values) was not tuned.

Catalog: B25 + B26 save kernel (E31), plus the B22-on-row-saves JIT finding. KB numbers are to be assigned by the KB thread.
