# B36: unpackRows builds dense rows 1,024 at a time (E40)

2026.11.13 6:22 to 6:29 PM Detroit. Base: lfc-pack 0.10.10 (main d9e955c) plus B34 and B35. This is the "full unpackRows on dense tables" piece the orchestrater assigned. The P13 thread was told about the change in flat.js `readRange`.

## Change (`b36b-dense-chunked-rows-non-V8.diff`, flat.js, 29 lines)

- In `readRange` (the path unpackRows uses for flat blocks), after the P13 sparse checks and before `lateInit`, it checks for a dense block: every present key in every row, no key-order lists, no `__proto__` key.
- Such a block is built 1,024 rows at a time. The chunk's rows are made first (a clone of the same template `lateInit` uses, or `{}` under 16 keys), then each column is assigned down the chunk.
- Same objects and the same key order.
- **B36b: V8 is excluded**, so Chromium keeps today's code.

## Same output

- `b36chk.cjs`: `JSON.stringify(unpackRows(...))` is identical to 0.10.10, for whole reads and for `{ from: 123, count: 4567 }`.
- Checked on 9 files (taxi, sensors, logs, edge-5000, edge-70, sparse, late-key, ids, nested events), each written 4 ways (packRows, pack, exact, 1 MB blocks).
- `node test/run.js` passes.

## Speed (unpackRows, fresh page per build, 4 rounds; share of 0.10.10)

| Table | Read | Chromium (B36, before the V8 exclusion) | Firefox | WebKitGTK |
|---|---|---|---|---|
| Taxi 300k, 19 keys (clone) | later | 0.98 / 1.01 rerun | 0.97 ± 0.02 | **0.74 ± 0.03** |
| | first | 0.96 / 0.93 | 0.96 | 0.92 |
| Sensors 100k, 7 keys | later | 0.92 | 0.91 ± 0.06 | **0.80 ± 0.03** |
| | first | 0.89 | 1.05 ± 0.02 | 1.00 |
| Logs 300k, 7 keys | later | **1.06 / 1.09 ± 0.03 rerun** | 0.96 | 0.97 |
| | first | 0.73 / 0.76 | 0.95 | 0.93 |

- Chromium rerun: 6 rounds with an A/A column (a byte copy of 0.10.10). A/A came out 1.00 / 0.99 on logs and 0.98 / 0.93 on taxi, so Chromium's logs later-read loss (1.09) is real.
- That's why B36b leaves V8 out. With Chromium at 1.00, weighted later reads are taxi 0.93 and sensors 0.93.
- P13 warned that chunked clones were about 10% slower in warm Firefox reads in their round. Here Firefox later reads were 0.91 to 0.97 across all three tables, and one first read was 1.05 ± 0.02 (sensors).

## Not yet checked

- Against 0.10.11 (P13i is a save change, so reads should be unaffected; recheck when 0.10.11 is on main).
- Laptop Firefox.

Catalog: B36 dense chunked row building (E40), WebKitGTK taxi later reads 0.74, Firefox 0.91-0.97, Chromium excluded (logs 1.09), RESULTS-B36-dense-chunked-rows-2026.11.13.md, on a card.
