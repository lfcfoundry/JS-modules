# B33: the calling thread encodes waiting columns at the end of a save (E37), PARKED

2026.11.13 5:51 to 5:55 PM Detroit. Base: lfc-pack 0.10.10 (main d9e955c).

## Idea

The phase profile (E36) showed WebKitGTK waiting 163 ms on helpers after the last block. In B33:
- Each helper gets at most 2 column jobs in flight. Extra jobs wait in a queue, and a helper that answers takes the oldest.
- After the last block, the calling thread encodes the newest waiting jobs itself, one per task.
- Same bytes: same28 (6 sets), bail28, two calls at once. lfc-pack tests pass.

## Result (taxi 300k, `rp.html`, 4 rounds, against 0.10.10)

| Later save | Chromium | Firefox | WebKitGTK |
|---|---|---|---|
| Time | 1.17 ± 0.03 | 1.41 ± 0.03 | 1.33 ± 0.07 |
| Longest stall | 0.92 | 0.93 | 1.04 |

**Parked: 17 to 41% slower.**
- Holding jobs back makes the helpers wait for a round trip before they get their next column. 0.10.10 posts every column at once, so its helpers never sit idle.
- The calling thread is also slower per column than an idle helper.
- In the timing page, 0.10.10's own WebKitGTK later save is 194 ms. That's far below the 382 ms the instrumented phase build showed, so the "163 ms tail" was mostly the cost of timing it. Lesson: confirm a phase-profile lead with the uninstrumented build before building on it.

Catalog: B33 main-thread steal (E37), later saves 1.17-1.41x slower, parked; the WebKitGTK tail was a timing artifact. RESULTS-B33-main-thread-steal-2026.11.13.md.
