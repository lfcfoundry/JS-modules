# B31: packRowsParallel yields between blocks (E35)

Research, 2026.11.13 5:28 to 5:34 PM Detroit time. Base: B25 + B26 + B28e + B30. Nothing was pushed to `modules/`.

## Why

In the B30 stack test, a 300k-row taxi save with packRowsParallel kept the main thread busy for 178 to 214 ms in one go: the row scatter for all 9 blocks runs back to back. The helpers already do the number columns, so the calling thread can hand control back between blocks.

## What changed (pool.js, `packRowsBlocks` only)

- **B31 (`b31-on-b30.diff`):** after each block is written, the writer yields with a MessageChannel task. Browsers clamp nested `setTimeout` to 4 ms; a MessageChannel task isn't clamped.
- **B31b (`b31b-on-b30.diff`):** it yields only once 40 ms of blocks have run since the last yield.
- In both:
  - An early bail (B26) or a block that can't take the row path still ends in the same text-path fallback.
  - Pending helper promises are silenced so they never report unhandled.
  - First saves (auto start, before the helpers exist) don't change.

## Same bytes

- `same28.cjs`: 0 differences on taxi, sensors, logs, edge, late-key and sparse sets.
- `bail28.cjs`: 0 differences.
- `b31conc.cjs`: two packRowsParallel calls at once plus a packRows give the same bytes.
- `node test/run.js`: all checks pass.

## Results (taxi 300k rows, `rp.html`, 4 rounds, fresh page each)

Later save = median of calls 2 to 4. Stall = the longest gap seen by a 4 ms main-thread timer.

| | Today | B31 every block | B31b 40 ms budget |
|---|---|---|---|
| Stall, ms (C / F / W) | 210 / 214 / 178 | **53 / 29 / 27** | 98 / not run / 60 |
| Later save time (C / F / W) | 1.00 | 1.07 / 0.97 / 1.05 | 1.03 / not run / 1.05 |
| Weighted later save | 1.00 | 1.05 | about 1.03 (F assumed 1.00) |

- Chromium B31 later-save time was measured twice: 1.06 ± 0.03 and 1.08 ± 0.10. A first-save cell came out at 1.13 in one run and 0.94 in the rerun. That's the same code path, so it's noise.
- The cost is the event-loop turns between blocks, plus helper replies handled in between.

## Verdict

**On a card.** It trades about 5% of later-save time for a page that stays responsive: the longest stall falls from about 200 ms to 27 to 53 ms. It sits on the 5% line, so the owner decides.

Catalog: B31 yield between packRowsParallel blocks (E35), stall 210 to 53 ms (Chromium), later saves 1.05 weighted, RESULTS-B31-yield-between-blocks-2026.11.13.md, on a card.
