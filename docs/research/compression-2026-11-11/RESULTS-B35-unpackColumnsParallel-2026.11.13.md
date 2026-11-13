# B35: unpackColumnsParallel, a whole-table column read (E39)

2026.11.13 6:13 to 6:21 PM Detroit. The orchestrater assigned this read area at 6:13 PM, and the owner picked the name at 6:19 PM. Base: lfc-pack 0.10.10 plus B34. Nothing was pushed to `modules/`.

## The call

`await LfcPack.unpackColumnsParallel(bytes, { keys, workers })` resolves to `{ key: array }` for the whole table, with no row objects. It pairs with packColumnsParallel: its result can be passed straight back.

- **How:** helpers decode the blocks through the existing pool read (`makePool`). In a new `_columns` mode, each block comes back as `rf.columns(F)` instead of rows. The calling thread then joins each key's block arrays (`b35Join`):
  - Typed arrays of one kind stay that kind.
  - Mixed typed kinds become Float64Array.
  - Anything else becomes a plain array.
  - A key missing from some rows gives `undefined` at those rows.
- **Auto start (B35b):** the first call reads on the calling thread (unpackColumns plus the join), then starts the helpers. Later calls use them. They close after 10 s idle.
- Files with one block skip helpers.
- Flat-row blocks only, like unpackColumns.

Diff: `b35b-unpackColumnsParallel-on-b34b.diff` (pool.js, plus one api.js line).

## Same values (`b35chk.cjs`)

- Every value equals `unpackRows` (Object.is, with undefined for missing keys). Checked on taxi, sensors, logs, edge, sparse, late-key and ids, each packed with packRows and with `pack` at 1 MB blocks.
- The `keys` option works.
- `node test/run.js` passes.

## Speed (fresh page each; share of unpackRows)

| File | Read | Chromium | Firefox | WebKitGTK | Weighted | unpackColumns + join (weighted) |
|---|---|---|---|---|---|---|
| Taxi 300k, 9 blocks | later | 0.32 | 0.32 | 0.25 | **0.30** | 0.44 |
| | first | 0.59 | 0.61 | 0.44 | **0.56** | 0.54 |
| Logs 300k, 4 blocks | later | 0.65 | 0.66 | 0.77 | **0.68** | 0.65 |
| | first | 0.57 | 0.86 | 0.74 | **0.66** | 0.66 |
| Sensors 100k, 1 block | later | 0.42 | 0.54 | 0.48 | **0.45** | 0.44 |

- The longest main-thread stall drops to 0.05 to 0.17 of unpackRows on taxi, and to 0.25 to 0.32 on logs.
- Auto start matters. Without it (B35, `rd-*.json`), the first taxi read was 0.62 weighted, and in WebKitGTK the first logs read was 1.05. With auto start (B35b, `rdb-*.json`, 3 rounds), the first read costs about the same as the hand join.
- On logs (4 blocks, mostly strings) the helpers don't beat the hand join in time (0.68 vs 0.65, noise). They still cut the stall to about a third.

## Pairings

- With **packColumnsParallel (B34)**, a columnar app does a full save and read cycle without ever building rows: later saves at 0.60 and later reads at 0.30 on taxi.
- With **B24 readAhead** and **open()** readers, this is a whole-file call and doesn't overlap with them.
- P13 owns sparse and filtered reads. The sparse case here only joins what unpackColumns already gives back.

## Limits

- One 4-core cloud box, with 3 helpers. No laptop run.
- Strings and nulls come back as plain arrays (same as unpackColumns).

Catalog: B35 unpackColumnsParallel (E39), later reads 0.30 of unpackRows on taxi weighted, same values, RESULTS-B35-unpackColumnsParallel-2026.11.13.md, on a card.
