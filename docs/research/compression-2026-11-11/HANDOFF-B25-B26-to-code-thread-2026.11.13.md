# B25 + B26 handoff: faster saves (wasm number kernel, folded gate check)

Prepared 2026.11.13 12:00 AM Detroit by "Research compression and data performance, part 2". This is research only; nothing in `modules/` was pushed. Send it only after the owner picks an option on the card.

## What to apply

- Apply it on top of B21, which is in the 0.10.2 queue: `b25-b26-on-b21-0.10.1.diff`, which touches `src/flat.js`, `src/api.js` and `wasm/flatscan.c`.
  - Everything on main 0.10.1 in one diff: `b21-b25-b26-on-0.10.1.diff`.
- Rebuild with `sh wasm/build-flatscan.sh` (clang 18.1.3), then `python3 build.py`.
  - Keep `tpl4.wasm` as committed; the build script rebuilds it too.
- For "B25 only", leave out the `src/api.js` hunk and the `chk26`, `b26Rows` and `b26Vals` lines in `src/flat.js`. The `nf` flag is harmless without B26.

## What it does

- **B25:** `numcol` (wasm) gives the stats and every candidate frame for a number column in one call. `numflags` replaces `b21Flags`. The zone maps reuse the kernel's min and max.
  - It runs on its own instance of the flat-scan module, used for columns of 64 or more values.
  - File bytes don't change.
- **B26:** `packRows` checks only the first and last 1,024 rows up front. The writer then checks every row and column, and on the first non-scalar it throws `B26_BAIL`. `packRows` catches that and takes the text path as before, so the bytes come out the same.

## Evidence

All of it is in `RESULTS-B25-B26-2026.11.13.md`. Weighted 60/15/25, as a share of B21's time:

| Data | First save | Repeat save |
|---|---|---|
| Taxi 300k | 0.64 | 0.58 |
| Sensors 100k | 0.66 | 0.66 |
| Logs 100k | 0.98 | 0.96 |

- The taxi save takes 0.38 to 0.59 of parquet-wasm 0.9.0's time in Chromium 156, Firefox 158 and WebKitGTK 2.52.6.
- Files are byte-identical.

## Tests to add

- Same bytes as B21: run `tools/same21.cjs` on seeded sets plus the edge set, and `tools/same1.cjs` with the kernel on every column.
- The bail cases from `tools/bail.cjs` give the same bytes or the same error: nested object, array, -0, NaN, Infinity, undefined, function, class instance, array row, null row, null-prototype row, BigInt, mixed kinds.
- Columns below and above the 64-value threshold.
- Monotone and non-monotone columns, ranges at 2^24 - 1 and 2^24, and values near ±2^49.

## Watch out for

- **B22 on `packRows`:** the small head block makes the first 2 to 4 row saves on a page 1.16 to 1.20x slower in Chromium on a 10 MB table. The writer gets JIT-optimized on the small block, then re-optimized on the big one.
  - Measure this before adding B22 to the row path. One option is to keep the head block on the text path only.
- **Memory:** the kernel instance grows to about 35 bytes per value of the largest number column (about 10 MB for a 300k-row block), and `trim()` should drop it.
  - `dropSmallWasm()` (used by `trim()`) now drops it: `NKW`, `NK_SRC` and `NKZ` are reset.

## Update 12:10 AM: B25d is included

The diffs now take the number checks just before each column is encoded, so each column is copied into wasm once, not twice.

- Files are byte-identical, and all checks pass.
- Against the card's B25 + B26 build, weighted: taxi 0.965 on a first save and 0.958 on repeat saves.
- That puts taxi at about 0.62 / 0.56 of B21.
