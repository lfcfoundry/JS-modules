Copyright (c) 2026 LFC Foundry. MIT License.

# Brief for the JS-modules code thread: two lfc-pack pack speedups (research 2026-11-11)

Send this only after the owner approves it on the card. The evidence is in [RESEARCH.md](RESEARCH.md) (E2, E3). Both changes write byte-identical files, so readers are not affected.

## B1: UUID text to bytes (src/flat.js, encodeColumn, `U` branch)

Replace:
```js
raw = new Uint8Array(n * 16); for (i = 0; i < n; i++) { var hx = v[i].replace(/-/g, ''); for (j = 0; j < 32; j += 2) raw[p++] = parseInt(hx.substr(j, 2), 16); }
```
with:
```js
raw = new Uint8Array(n * 16); for (i = 0; i < n; i++) { x = v[i]; for (j = 0; j < 36; j += 2) { if (j === 8 || j === 13 || j === 18 || j === 23) j++; raw[p++] = (hexv(x.charCodeAt(j)) << 4) | hexv(x.charCodeAt(j + 1)); } }
```
Research screen: pack takes 0.74 to 0.91 of the time on UUID-heavy blocks in Chromium 156, Firefox 158 and WebKitGTK 2.52.6, and it was never slower. Gate: the usual tests, plus an early-stop A/B on a UUID-heavy set.

## B2: choose each flat column's encoding from a sample

In both `cand()` functions (encodeColumn and the fast writer), estimate each candidate's size instead of compressing it in full:
- Frames of 64 KB or less: compress exactly.
- Larger frames: compress 4 evenly spaced 16 KB slices (8-byte aligned) and scale the result, capped at the raw size.

Keep the candidate with the smallest estimate, then compress only that one in full, with the stored-raw fallback, before its meta is written. The prototype is `experiments/mkvar.py`, kind `sample` (the `__est` and `__fin` functions).

Required before shipping:
1. **Close-call guard:** if the best two estimates are within 2% of each other, compress both in full and keep the smaller.
2. **Corpus size gate:** every real-corpus file must be at or below its 0.8.1 size. Any larger file goes on an owner card, and a file must never be larger than plain zstd.
3. **Speed gate:** a three-browser early-stop A/B on logs, sensor-style and nested data. The nested control must stay neutral.

Research screen: pack takes 0.85 to 0.96 of the time on 300,000-row number and log sets, with bytes identical on 10 made-up sets.

Changelog note for users (one plain line each): "Packing UUID columns is faster." / "Packing picks each column's layout faster."

## B3: keep long numbers on the fast flat writer (needs its own owner card; not covered by "Send both")

Apply `experiments/b3-long-numbers.diff`, which touches `wasm/flatscan.c`, `src/flat.js` and `src/api.js`. The diff was updated at 9:52 AM Eastern with a 2-line layout guard. In auto mode, a block kept only through the new fallback goes the old way whenever 0.8.1 would have compared it with the nested layout (256 KB or smaller, or first lines not `looksFlat`), so the same layout wins. Without the guard, small blocks could come out larger. Then rebuild with `wasm/build-flatscan.sh` (clang 18.1.3) and `python3 build.py`. `tpl4.wasm` and `rowscan.wasm` stay byte-identical; `flatscan.wasm` and `flatscan-plain.wasm` change. Today the scanner gives up on the whole block at one number with more than 15 digits, more than 9 decimals, an exponent or -0. With the patch, that key becomes type 6: the cell keeps the number's text and the column goes through `encodeColumn`, with the same zone-map entry as the general writer.

Research screen: pack takes 0.67 to 0.86 of the time on such blocks in all 3 browsers, and 0.50 to 0.54 stacked with B1 and B2 in Chromium 156. Files are byte-identical on 19 sets (`experiments/b3verify.cjs`), and `node test/run.js` passes. Gate: the usual tests, `b3verify.cjs` against the release build, and a three-browser early-stop A/B.

User changelog line: "Packing is faster for rows with long or exponent numbers."

## B3b: keys with mixed kinds of value stay on the fast flat writer (v3, against lfc-pack 0.8.3; needs its own owner card)

Apply `experiments/b3b-mixed-kinds.diff`, which touches `wasm/flatscan.c` and `src/flat.js` and is based on 0.8.3. Rebuild with `wasm/build-flatscan.sh` (clang 18.1.3) and `python3 build.py`. What it does:
- A key whose values are of more than one JSON kind becomes type 7, keeping its first type in kfd.
- Each later cell is that value's literal (cfd 255).
- A new wasm export, `litjoin`, joins one key's literals so a single `JSON.parse` reads them.
- The cell lists and join buffer are laid out even in blocks with no text column.
- The scanner stops early (code 18) once more than half of the cells are literals, so all-mixed blocks keep today's path.

Research screen against 0.8.3:
- Pack takes 0.50 to 0.93 of the time where up to about half the cells are mixed.
- The worst case (about 92% mixed) is even, at 0.94 to 1.05 in all 3 browsers.
- Files are byte-identical on 50 of 50 sets (`experiments/b7verify.cjs`, with the sets from `worst.cjs` and `mixk.cjs`).

Gate: the usual tests, `b7verify.cjs`, worst-case and `mixK` sets in all 3 browsers, and an early-stop A/B on plain flat data (logs, nd_dense). Plain data read 1.02 to 1.04 on first packs in an 8-round WebKitGTK rerun, so confirm it costs less than 5%.

User changelog line: "Packing is faster when a column mixes numbers with empty (null) or text values."

## B14: range reads build only the rows they keep (against lfc-pack 0.8.3; needs its own owner card)
Apply `experiments/b14-range-late-rows.diff` (`src/flat.js`, `src/api.js`; no wasm change), then `python3 build.py`. What it does:
- `unpack(file, { range })` on a flat block decodes the range column first, lists the matching rows, and builds row objects for those rows only (`readSel`).
- A block whose footer number range lies wholly inside the asked range skips the test (`blockInside`), and a block where more than half the rows match goes the old way, reusing the decoded range column.
- Nested blocks, key-order lists, `__proto__` keys, and lazy or generated rows go the old way.

Research screen against 0.8.3:
- A 1% range takes 0.31 to 0.85 of the time in all 3 browsers, and 0.45 to 0.72 with `keys`.
- A range that keeps every row, or 90%, is even (0.94 to 1.09) when each mode runs on its own page; the nested control read 0.95 to 1.02.
- The rows are the same on 252 of 252 checks (`experiments/selverify.cjs`, 6 ranges x 3 key choices, 8 made-up sets and 6 real corpus files).

Gate: the usual tests (`test/query.cjs` first), `selverify.cjs`, and an early-stop A/B in all 3 browsers on full reads, on wide ranges, and on narrow ranges followed by a wide range in the same page (that sequence read 1.04 to 1.29 slower in the research screen, because the shared row builder warms up later).

User changelog line: "Reading a time range is faster: only the matching rows are built."

## B16: 4 MB blocks for flat data (with B14; owner tapped "Send B14 + 4 MB flat blocks", 2026-11-11 9:25 PM Eastern)
Writer default only, no format change: readers already take any block size. In `src/api.js` the default `bb` is `BLOCK_BYTES` (13 MB). Proposed rule: when the caller gives no `blockBytes` and the input passes `looksFlat` on its first chunk, use 4 MB (`4 << 20`); otherwise keep 13 MB. An explicit `blockBytes` always wins. Nested data stays at 13 MB, because 4 MB nested blocks read 1.04 to 1.15 times slower in full and grow 7.5% (E10).

Research screen against 0.8.3 at 13 MB (`RESEARCH.md` E10, `results/rdab-*-bs.json`; whole-file `blockBytes`, B14 on):
- A 1% time range takes 0.12 to 0.29 of the time on logs and sensors, 0.56 to 0.78 on a mixed set. One column: 0.19 to 0.59.
- Full read 0.81 to 1.02, pack 0.87 to 0.98. Files grow up to 3.3% (mixed set), 0.4% (logs), and shrink 0.3% (sensors).

Gate: the usual tests, the B14 gate, the real-corpus size gate (no flat corpus file more than 3.5% bigger), and an early-stop A/B in all 3 browsers on full reads (at most 1.05 on flat sets) and on `packParallel`, which splits work by block and was not timed in the research screen. Check that `looksFlat` on the first chunk does not switch a nested file to 4 MB blocks.

User changelog line: "Files of flat rows use smaller blocks, so reading part of a file is faster."

## B13: null plane, new column type `N` (format minor 1; owner tapped "Send it with mixed-kinds", 2026-11-11 9:25 PM Eastern)
Apply after B3b v3 (approved 6:41 PM Eastern). Research prototype: `experiments/b13-null-plane.diff` (against 0.8.3, `src/flat.js` only, about 20 lines; `experiments/b13-patch-null.py` applies the same change to a copy). Layout and reasons: `PROPOSAL-null-plane.md`.
- Writer: a flat column whose values are one scalar kind (number, string or true/false) plus at least one `null` is written as `t: "N"`, `p: { t: INNER, p: INNER_PARAMS, m: NONNULL }`. Frame 0 is the null bitmap (bit set = `null`), frames 1 and up are the inner column of the `m` non-null values. If the inner column would be `j` anyway, write `j` as today.
- Reader: walk the bitmap; refuse the block if the plane is short or the count of clear bits is not `m`.
- Zone maps: an `N` column with inner `V`, `B` or `F` gets a zone entry from its non-null values (the prototype does this in `writeFlatBlock`; the fast writer path needs the same).
- `unpackColumns`: the prototype returns a plain array with `null` cells, which is what a `j` column returns today, so no API change. A typed array plus the bitmap (Arrow style) is a later option, not part of this change.
- Spec: `LAYOUT-SPEC.md` 2.5 gains type `N`; `SPEC.md` format minor 1. Old readers refuse `N` (rule 7: unknown type), so they fail safely. The Python and Go readers and the conformance vectors need `N` in the same release.

Research screen (`RESEARCH.md` E11, `results/rdab-*-nl.json`), stacked with B3b v3, against 0.8.3, 100,000 rows, Chromium / Firefox / WebKitGTK:
- Orders export (6 nullable columns): 23.5% smaller, pack 0.75 / 0.69 / 0.76, full read 0.50 / 0.62 / 0.65.
- 3 nullable columns: 24.3% smaller, pack 0.80 / 0.86 / 0.71, full read 0.54 / 0.64 / 0.64.
- One decimal column 10% null: 13.6% smaller, pack 0.81 / 0.71 / 0.65, full read 0.80 / 0.83 / 0.92.
- `N` alone packed up to 1.05 slower in Firefox on one set; stacked it never was.
- Same rows on 21 test files (`experiments/nverify.cjs`); byte-identical on 9 files without nullable columns (`experiments/ident.cjs`).

Gate: the usual tests plus new vectors for `N` (all-null but one, one null, nulls in the first and last row, every inner type, a damaged plane), the three readers on the same vectors, byte identity on the real corpus files that have no nullable flat column, and an early-stop A/B in all 3 browsers on pack and full read, including the worst case: every column nullable with 50% nulls.

User changelog line: "Columns with some empty (null) values are now stored compactly: such files are up to a quarter smaller and faster to read. Older versions cannot open these files."

## B17: delta saves, prototype behind an option (owner tapped "Send for a prototype", 2026-11-11 10:47 PM Eastern)
A prototype, not a release: behind `pack(rows, { base })`, `packTables(obj, { base })` and `unpack(file, { base })`, off by default. Design, numbers and risks: `PROPOSAL-delta-saves.md`; results `RESEARCH.md` E12 and E13.
- wasm: add `compress_prefix` and `decompress_prefix` to `wasm/zstd-glue.c` (`experiments/b17-zstd-glue-prefix.diff`, +1.3 KB). Rebuild with `wasm/build.sh` (the pinned zstd 1.5.7; the shipped `zstd-full.wasm` rebuilt byte for byte from it in research).
- Frame matching: each frame uses the frame in the same place in the base (block, column, frame number) as its prefix when the base has one; otherwise no prefix.
- Footer: a required flag section with the base save's XXH64; readers refuse a delta without the matching base.
- Full-save rule for apps: a full save when the delta passes 25% of the last full save; saved or exported files are always full.

Research screen (`experiments/www/zp.html`, 3 browsers), zstd step only: delta compress 0.23 to 0.37 of a full save's, decompress 0.07 to 0.20; zstd bytes 1% (1 edit) to 15% (500 edits) of a full save on a 2,000-node map.

Gate: the usual tests plus new ones (wrong base refused, base with different columns, every frame kind, a 500-edit chain against one base), byte identity of files written without `base`, and an early-stop A/B in all 3 browsers on whole save and read time (not only zstd) on Netflow map saves of 20, 200 and 2,000 nodes. First app trial: Netflow autosave, owned by the Netflow thread.

User changelog line (when it ships): "Autosaves can be stored as small changes against the last full save."
