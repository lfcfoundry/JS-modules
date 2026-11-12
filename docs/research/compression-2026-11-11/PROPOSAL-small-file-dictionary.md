# Proposal: a built-in dictionary for small files and app saves (backlog B7)

Status: research proposal, not a format change. Nothing here is implemented in `modules/lfc-pack`.

## What it is
Every LFC-pack file carries fixed parts: a 16-byte trailer, a footer (block table, number ranges, flags), and per block a JSON header, a meta frame (keys, column types, parameters) and a presence-plane frame. On a big file these are noise. On a file of a few dozen rows they are most of the file. A built-in dictionary is a fixed byte string shipped inside `lfc-pack.js` that zstd uses as already-seen text, so the repeated JSON words (`"keys"`, `"cols"`, `"t":"V"`, `"scale"`, `"writer":"lfc-pack ..."`, `"exact":false`) cost almost nothing. Brotli does the same with its built-in dictionary; zstd supports it with `ZSTD_compress_usingDict`.

## Where the bytes go today (lfc-pack 0.8.3, Node; sizes do not depend on the engine)
"Fixed" is trailer + footer + block headers + meta + planes. Gzip and xz are of the same JSON text, the usual alternatives for an app save.

| Input | JSON | gzip -9 | xz -9e | LFC-pack | fixed parts | fixed share |
|---|---|---|---|---|---|---|
| logs, 10 rows | 1,468 | 503 | 552 | 834 | 467 | 56% |
| logs, 100 rows | 14,677 | 3,417 | 3,228 | 2,908 | 519 | 18% |
| logs, 1,000 rows | 146,990 | 31,841 | 28,084 | 22,473 | 523 | 2% |
| sensors, 10 rows | 1,006 | 259 | 288 | 639 | 515 | 81% |
| sensors, 100 rows | 10,055 | 1,550 | 1,360 | 1,268 | 525 | 41% |
| events, 10 rows | 1,763 | 471 | 524 | 891 | 383 | 43% |
| events, 100 rows | 17,323 | 2,656 | 2,420 | 2,616 | 353 | 13% |
| FHIR, 10 rows | 18,194 | 4,011 | 3,884 | 4,876 | 433 | 9% |
| gen logs, 10 rows | 1,161 | 452 | 528 | 929 | 577 | 62% |
| Netflow save, 20 nodes | 1,500 | 308 | 332 | 1,034 | 788 | 76% |
| Netflow save, 200 nodes | 38,462 | 3,805 | 2,836 | 2,905 | 822 | 28% |
| Netflow save, 2,000 nodes | 476,367 | 43,217 | 27,796 | 22,634 | 836 | 4% |

**Against gzip:** at 10 to 20 rows LFC-pack is 1.2 to 3.4 times larger than gzip -9 of the JSON. It breaks even somewhere between 10 and 100 rows: at 100 rows (200 nodes) it is 0.76 to 0.98 of gzip, and at 1,000 rows 0.45 to 0.74. This is a real loss on tiny files and should be stated wherever small files are compared.

The footer is about 180 to 230 bytes even for one block. Most of it is numbers zstd cannot shrink (CRC-32, column-name hashes, offsets); the rest is JSON words.

## What a built-in dictionary would save (estimate)
Estimate: compressed size with dictionary D is about `c(D + x) - c(D)` plus a 6-byte frame header, at zstd level 3. This treats D as a raw-content dictionary (what `ZSTD_refPrefix` does); a trained dictionary (`ZDICT_trainFromBuffer`) would do somewhat better. D was built from the footer and meta frames of the other file families only, so no file is helped by its own text. (The two log families share some key names, so their numbers may be a little optimistic.)

| Input | LFC-pack | footer + meta now | with dictionary | saved | of the file |
|---|---|---|---|---|---|
| logs, 10 rows | 834 | 387 | 144 | 243 | 29% |
| logs, 100 rows | 2,908 | 432 | 146 | 286 | 10% |
| logs, 1,000 rows | 22,473 | 438 | 178 | 260 | 1.2% |
| sensors, 10 / 100 / 1,000 rows | 639 / 1,268 / 6,394 | 435 / 438 / 488 | 236 / 240 / 272 | about 200 | 31% / 16% / 3.4% |
| ids, 10 / 100 rows | 1,024 / 5,857 | 345 / 365 | 148 / 162 | about 200 | 19% / 3.5% |
| events, 10 / 100 rows | 891 / 2,616 | 303 / 198 | 121 / 76 | 182 / 122 | 20% / 4.7% |
| FHIR, 10 / 100 rows | 4,876 / 12,469 | 285 / 330 | 162 / 211 | about 120 | 2.5% / 1.0% |
| Netflow save, 20 / 200 / 2,000 nodes | 1,034 / 2,905 / 22,634 | 593 / 614 / 628 | 286 / 295 / 309 | about 310 | 30% / 11% / 1.4% |

So a built-in dictionary saves a fixed 120 to 320 bytes per file. Even with it, a 10-row file stays larger than gzip of its JSON (logs 591 against 503, Netflow 20 nodes 727 against 308).

## A no-format-change option checked too
A raw block (`r`, the whole text as one zstd frame, `SPEC.md`) is already readable by every reader. Written for tiny inputs it gives: logs 10 rows 647 bytes (flat 834), sensors 403 (639), events 636 (891), but at 100 rows it is bigger than flat (logs 3,613 against 2,908). The catch is the API: `unpackColumns` and `R.columns` refuse raw blocks, and raw blocks have no number ranges. A writer rule "raw block when the input is under about 2 KB" would change what those calls do on tiny files. Not recommended without an owner decision.

## Real zstd numbers (2026-11-11, E12)
Measured with the system libzstd 1.5.5 (`experiments/zdict.py`), not estimated. A built-in dictionary saves 11 to 24% of a 10-row file, 3 to 12% at 100 rows and 0 to 3% at 1,000 rows, less than the estimate above. A per-app dictionary (the same app's earlier data) saves 15 to 28% at 10 rows and up to 15% on a 2,000-node map. Trained dictionaries lost to raw content at these sizes. The decision below stands for the built-in dictionary. A different use of the same zstd feature looks much stronger: the previous save as the dictionary (backlog B17), which makes an edited 2,000-node map 6% of its size.

## Why not now
- It changes the format: frames are "no dictionary" today (`LAYOUT-SPEC.md` 1.1). A dictionary has to be versioned and kept forever, because files depend on it. The Python and Go readers need the same bytes.
- The gain is a few hundred bytes per file. App saves of that size do not cost users time or space in practice, and the owner's rule is speed over size.
- zstd's dictionary functions are not in the current wasm build (exports: `compress`, `decompress`, `bound`, `tune`, ...), so the wasm grows too.

## Decision asked
REJECT for now as a format change; keep the numbers. Revisit only if a workload stores many small files side by side (for example one file per document in IndexedDB) where a few hundred bytes each add up. In that case, a shared table across files (`share: true`) or one file holding many documents beats a dictionary and needs no format change.
