# Proposal: a null plane for typed columns (backlog B13)

Status: research proposal, not a format change. Nothing here is implemented in `modules/lfc-pack`. A research prototype exists (`experiments/b13-null-plane.diff`, `RESEARCH.md` E11). It needs the owner's go-ahead and a code-thread change to the JavaScript, Python and Go readers together.

## What it is
Today a flat-block column keeps a typed encoding (`V`, `B`, `F`, `T`, `D`, `s`, `H`, `U`, `I`) only when every value under the key is of one kind (`LAYOUT-SPEC.md` 2.5). One `null` in the block turns the whole column into JSON text (`j`). The proposal keeps the typed encoding for the non-null values and records which rows hold `null` in one extra bit plane, the same shape as the presence planes the flat block already has (2.2).

This is the idea behind Arrow's validity bitmap and Parquet's definition levels: store "is there a value" apart from the values, so the values keep their best encoding.

## Why
Measured on lfc-pack 0.8.3 in Node (sizes do not depend on the engine). Each pair uses the same 300,000 sensor rows. "With null" sets the key to `null` in a random share of rows; "left out" drops the key from those rows instead. "Left out" is already stored as a typed column plus a presence plane, which is what a null plane would cost, so it is a close stand-in for the proposed size.

| Column (encoding without nulls) | null share | file with `null` | file with key left out | null costs |
|---|---|---|---|---|
| `temp`, slowly changing decimals (`V` delta) | 0.1% | 1,912,019 | 1,668,442 | +14.6% |
| | 1% | 1,916,631 | 1,671,938 | +14.6% |
| | 10% | 1,932,027 | 1,666,609 | +15.9% |
| | 50% | 1,856,230 | 1,623,989 | +14.3% |
| `dev`, 40 device names (`D`) | 0.1% | 1,861,160 | 1,668,581 | +11.5% |
| | 1% | 1,866,470 | 1,671,082 | +11.7% |
| | 10% | 1,884,962 | 1,666,225 | +13.1% |
| | 50% | 1,804,047 | 1,598,809 | +12.8% |
| `ok`, true/false (`T`) | 0.1% | 1,683,372 | 1,668,497 | +0.9% |
| | 1% | 1,691,101 | 1,673,094 | +1.1% |
| | 10% | 1,733,997 | 1,686,784 | +2.8% |
| | 50% | 1,774,327 | 1,701,824 | +4.3% |
| `hum`, whole numbers 30-60 (`B`), earlier `sensnull` set | 1% | 1,739,648 | (no nulls: 1,667,743) | +4.3% |

So one `null` in 1,000 rows costs as much as many: the column loses its encoding, not a few bytes per null. The cost is largest where the lost encoding was best (deltas, dictionaries).

Read time, Node full `unpack` (median of 5, noisy): 160-182 ms with `null` against 107-147 ms left out. Browser read times are in `RESEARCH.md` E8.

## How much real data needs it
Real corpus (`/mnt/project-files/json-format/`, 8 files): only two keys hold one kind of value plus `null`: `n` in `python-writer/mixed.ndjson` (33% null, but that file is nested, so the flat layout is not used) and `cache` in `nd_gen_logs` (true/false, 34% null): 262,078 against 258,459 bytes, 1.4%. The corpus has no database export, which is where nullable typed columns are most common. That is the main gap in the evidence.

## Proposed layout (for discussion)
A new column type, so that old readers refuse the file instead of reading it wrongly:

- `t: "N"`, `p: { "t": INNER, "p": INNER_PARAMS, "m": NONNULL }`.
- Frame 0: the null plane, `ceil(n / 8)` bytes, bit `i` set when the `i`-th value of the column (counting only rows that carry the key) is `null`. Its number of zero bits MUST equal `m`.
- Frames 1 and up: the inner column, exactly as section 2.5 defines `INNER`, holding the `m` non-null values.
- Assembling: walk the column's `n` values; a set bit gives `null`, a clear bit gives the next inner value.

Why a new type and not a new parameter: `LAYOUT-SPEC.md` 5, rule 7 says readers ignore unknown parameters. A reader that ignored a `nulls` parameter would read `m` values as if there were `n`, and either refuse on a length check or show wrong rows. Rule 7 also says to refuse an unknown type, so `N` fails safely on 0.8.x readers.

Compatibility: format minor 1 (`SPEC.md` 2.1). Files without nullable typed columns stay byte-identical. The Python and Go readers need the same change. Zone maps (`LAYOUT-SPEC.md` 4) could then cover `N` columns whose inner type is `V`, `B` or `F`, which they cannot do for `j` columns today.

## Risks
- Format change: three readers, the conformance vectors and the spec. Medium effort, mostly review.
- Writer cost: the scanner already handles mixed kinds on the fast path once B3b ships; picking `N` adds one plane per nullable column. To be timed in the 3 test browsers before adoption.
- `unpackColumns` would return `null` cells in typed columns. A typed array cannot hold `null`, so the API needs a decision: return the inner typed array plus the null plane (like Arrow), or a plain array. This is an API choice for the owner.


## Prototype results (2026-11-11, E11)
Writer and reader for `N` in a copy of 0.8.3 (about 20 lines in `src/flat.js`). Same rows on 21 test files; byte-identical on 9 files without nullable columns. Browser ratios against 0.8.3 on 100,000-row cuts, stacked with B3b v3 (Chromium / Firefox / WebKitGTK):

| Set | size | pack | full read |
|---|---|---|---|
| made-up orders export (6 nullable columns) | -23.5% | 0.75 / 0.69 / 0.76 | 0.50 / 0.62 / 0.65 |
| 3 nullable columns, 5% null each | -24.3% | 0.80 / 0.86 / 0.71 | 0.54 / 0.64 / 0.64 |
| one decimal column, 10% null | -13.6% | 0.81 / 0.71 / 0.65 | 0.80 / 0.83 / 0.92 |

The null plane alone was up to 1.05 slower to pack in Firefox on one set; stacked with B3b it was never slower. With a per-app zstd dictionary on top, a 10-row orders file goes from 921 to 622 bytes (E12).

## Decision asked
Was DEFER until a real workload with nullable typed columns shows up (a database export, a Workbench import). With the prototype numbers above it is an ADOPT CANDIDATE as format minor 1, the owner's call. If the owner says go, the next step is a code-thread prototype behind a writer option, with the 3-browser pack and unpack gates and a byte-identity check on files with no nulls.
