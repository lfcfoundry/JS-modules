# B34: packColumnsParallel, a save that takes columns (E38)

2026.11.13 5:57 to 6:08 PM Detroit. The owner picked the research at 5:57 PM and the name at 5:58 PM. Base: lfc-pack 0.10.10 (main d9e955c). Nothing was pushed to `modules/`.

## The call

`await LfcPack.packColumnsParallel({ key: array, ... }, opts)` resolves to the file for the rows `{ key: array[i], ... }`.

- **Arrays:** plain arrays (any flat values) or number typed arrays (Int32Array, Float64Array, and so on; not BigInt). All must be the same length. A wrong type or unequal lengths reject the call.
- **How:** it runs packRowsParallel's own code through a rows view (`.length`, `.slice`, `rows[i]` for i < 256). It uses the same gates, the same helpers (auto start), B31 yields, B26 bails and fallbacks.
- **Blocks:** the writer gets each block as column ranges, and `b34Fill` builds the column state directly. A typed column is one copy into the block's Float64Array. A plain array gets the same per-value loop as the scatter, without row objects or `for...in`.
- **Fallbacks:** any case packRowsParallel sends to `packRows` or the text path (small tables, values that aren't flat scalars, -0, NaN, undefined, nested values) builds real rows and takes that path, so the file is the same.
- **Option 1 (b34b):** the 40% string gate (`b18Pays`) is skipped for column input. Text-heavy tables stay on the column path instead of building rows and JSON text.

Diffs: `b34b-packColumnsParallel-on-0.10.10.diff` (option 1) and `b34-packColumnsParallel-same-bytes-on-0.10.10.diff` (option 2). Each is 126 lines across flat.js, pool.js and api.js, and they differ in one line.

## Same bytes (`b34chk.cjs`, Node 22)

- **Option 2:** byte-identical to `packRows` and `packRowsParallel` on taxi, taxi200k, sensors, logs, ids, edge and events. Each was checked with typed and with plain columns, twice in a row. Also identical on 6 odd-value cases (small, -0, NaN, undefined, nested object, string among numbers) and an Int32Array column. A length mismatch is rejected. `node test/run.js` passes.
- **Option 1:** the same, except on tables the string gate sends to text. Logs is 2,108,858 bytes against 2,109,758, and ids 5,268,479 against 5,269,079. Both read back exactly with `unpackRows`.

## Speed (fresh page each, 4 rounds; same build for rows and columns; columns built before timing)

Share of packRowsParallel; later = median of calls 2 to 4.

| Table | Save | Chromium | Firefox | WebKitGTK | Weighted |
|---|---|---|---|---|---|
| Taxi 300k | later | 0.57±0.01 | 0.58±0.04 | 0.68±0.07 | **0.60** |
| | first | 0.80±0.06 | 0.73±0.02 | 0.68±0.04 | 0.76 |
| Sensors 100k | later | 0.78±0.02 | 0.69±0.06 | 0.59±0.05 | **0.72** |
| | first | 0.84±0.03 | 0.72±0.09 | 0.85±0.03 | 0.82 |
| Logs 100k, option 2 | later | 1.16±0.04 | 1.03±0.04 | 1.02±0.11 | 1.11 (slower) |
| Logs 100k, option 1 | later | 0.77±0.03 | 0.66±0.02 | 0.78±0.03 | **0.76** |
| | first | 0.82±0.03 | 0.71±0.04 | 0.89±0.02 | 0.82 |
| Ids 100k, option 1 | later | 0.72±0.03 | 0.79±0.03 | 0.71±0.05 | **0.73** |
| | first | 0.71±0.03 | 0.75±0.04 | 0.78±0.03 | 0.73 |

- The longest main-thread stall drops too: taxi from 64 to 28 ms in Chromium and from 33 to 17 ms in Firefox.
- Option 2 loses on logs because a text-path table has to build row objects and JSON text from the columns first.

## Stack

- It builds on B28 (helpers), B31 (yields) and B26 (bails) unchanged. Callers can pass the columns from `unpackColumns` blocks after joining them, or a columnar model such as the Netflow graph.
- Not stacked with B30 (file input), which is a different input kind.
- P13i (another thread's b18Pays rule, unshipped) changes only the string gate, which option 1 skips for column input. The rows view gives b18Pays everything it reads, so option 2 would pick up the rule automatically.

## Limits

- One 4-core cloud box, with 3 helpers. No laptop run yet.
- Columns in the test were built from parsed rows before timing. Real callers that already hold columns skip that step entirely.

Catalog: B34 packColumnsParallel (E38), later saves 0.60 to 0.76 of packRowsParallel weighted, RESULTS-B34-packColumnsParallel-2026.11.13.md, on a card.
