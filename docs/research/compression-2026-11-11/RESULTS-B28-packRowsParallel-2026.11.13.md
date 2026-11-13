# B28: packRowsParallel, a save that encodes big number columns in helper workers (E32)

Research, 2026.11.13 9:07 to 9:35 AM Detroit time. The owner named the call `packRowsParallel` on the card at 9:07 AM. Nothing in `modules/` was pushed. The base is 0.10.1 + B21 + B25 + B25d + B26b, which is the 0.10.2 handoff. The diff on top of that is `b28-on-b25-b26.diff` (`src/flat.js`, `src/pool.js`, `src/api.js`).

## How it works

- `packRowsParallel(rows, opts)` returns a Promise of **the same bytes `packRows(rows, opts)` writes**.
- **Same row path as packRows.** It applies the same gate as `packRows` (exact / block / share / 4,096 rows / flat sample / `b18Pays`). It then scatters the rows into columns on the calling thread, block by block (B21 / B26).
- **Big number columns go to helpers.** Any typed number column with at least 8,192 values (`B28_MIN`) moves to a pack helper. Its Float64Array (and null plane) is transferred, so nothing is copied.
  - The helper runs the same `b28Col` code: number checks, the B25 kernel, candidates, zstd. It sends back the frames and the zone entry.
  - The other columns are encoded on the calling thread at the same time.
  - Blocks don't wait for each other: block k+1 is scattered while the helpers encode block k. The footer is written once every block is in.
- **Refactor:** the writer's per-column code moved into `b28Col` (`writeFlatBlock0` and the helper both call it). `writeFlatBlock0` returns `{ wait }` when a hook sent columns away.
- **Fallback:** a B26 bail, whether on this thread or in a helper, falls back to `pack(rowsBytes(rows))`, exactly as `packRows` does. Helpers that still have answers in flight are drained before they're reused.
- **Size rule:** under 4 blocks of row text (about 52 MB, `B28_TEXT`), it simply calls `packRows`.
- **Auto start (the default):** when no helpers exist yet, the first call starts them without waiting and saves on this thread. Later calls use the helpers, and `warmPack()` works too. Helpers close 3 s after the last call (10 s after an auto start).

## Same bytes

- Byte-identical to `packRows` on 19 files (seeded sets, edge sets, the taxi table stored and sorted, 100k/200k/300k taxi slices), across 3 calls in a row.
- 15 odd-row cases come out the same (`bail28.cjs`).
- `node test/run.js` passes everything.
- A bug found and fixed during the build: a late answer from a helper after a bail could reach the next call's queue. Helpers are now drained before reuse, and warm-up answers are ignored.

## Speed (share of packRows on B25 + B26 (b25d build), fresh page per build per round, 3 helpers on a 4-core box)

| | Chromium | Firefox | WebKitGTK | Weighted |
|---|---|---|---|---|
| **Auto start**, taxi 300k: first call | 0.82 | 0.88 | 0.98 | **0.87** |
| Auto start, taxi 300k: later calls | 0.50 | 0.59 | 0.59 | **0.54** |
| Auto start, taxi 200k: first call | 0.88 | 0.99 | 0.95 | **0.92** |
| Auto start, taxi 200k: later calls | 0.68 | 0.60 | 0.54 | **0.63** |
| Always helpers, taxi 300k: first call | 0.89 | 0.98 | 1.05 | 0.95 |
| Always helpers, taxi 300k: later calls | 0.63 | 0.62 | 0.44 | 0.58 |
| Always helpers, taxi 200k: first call | 1.04 | 0.89 | **1.39** | **1.11** |
| Always helpers, taxi 200k: later calls | 0.58 | 0.47 | 0.51 | 0.55 |
| Always helpers + `warmPack(3)` first, 200k: first call | 0.72 | 0.54 | 1.12 | 0.79 |

- **The first auto-start call (0.87 to 0.92) is not a real gain.** That call goes through `packRows`, so it's the same work. The figure is within noise (the per-browser cells run 0.82 to 0.99). It shows the auto start costs nothing.
- In absolute terms, later calls on the 300k taxi table in Chromium take 224 ms, against parquet-wasm 0.9.0's 767 ms (E31 run), and packRows on B21 at 631 ms.
- **Small tables lose without the size rule.** Sensors 100k (10 MB) came in at 1.39 to 1.55x and taxi 100k (40 MB) at 1.12 on a cold first call (`p1.json`, `p2.json`). With few jobs per call, the helpers' own code never warms up. That's why the rule sends anything under about 52 MB to `packRows`.

## Stack

- B28 sits on top of B21 + B25 + B25d + B26b, and the bytes match that build.
- P13 / P14 / P13b / P13c / B24 are reader-side.
- B22 small first block: a 64 KiB head block has fewer than 8,192 rows, so it stays on the calling thread, and the rest is unchanged. It wasn't timed together; add that to the code thread's B22 tests.
- The parts are additive: B25 + B26 took a taxi save to 0.58 of B21 on repeat saves, and B28 takes that to 0.54. Together that is about 0.31 of B21 for repeat big saves.

## Size

`lfc-pack.js` goes from 504,750 (B25 + B26) to 512,891 bytes (+8.1 KB).

## Limits

- One 4-core cloud box with 3 helpers. Laptop core counts will change the gain, and the cloud timings for helpers are noisy (see memory `lfcp-helper-trim-cost`).
- 4 to 5 rounds per cell.
- Memory: each helper holds its own kernel and zstd memory while it's alive.
- Main-thread blocking: the scatter still runs on the calling thread. A 300k-row call blocks it for about 145 ms in Chromium.

## Files

- `b28-on-b25-b26.diff`
- `results/` (`p1`, `p2`, `p3`, `pw`, `pf`, `pc`, `qw`, `qf`, `qc`, `rw`, `rf`, `rc` .json)
- `tools/` (`sv3.html`, `sv3w.html`, `same28.cjs`, `same28b.cjs`, `bail28.cjs`, `b28.py`)
- `B28-packRowsParallel-options.png`

Catalog: B28 packRowsParallel (E32), plus the finding that helpers need about 4+ blocks before they pay.

## Laptop round 1 (owner, 11:01 AM Detroit): Firefox 160 on Windows, 16 cores

| Save | packRows | packRowsParallel | Ratio |
|---|---|---|---|
| First save | 590 ms | 627 ms | 1.06 |
| Later saves | 553 ms | 400 ms | 0.72 |

- The file bytes are the same.
- What I think caused it:
  - Auto start launched 8 helpers (16 cores, capped at 8) *before* the first save, so their start-up competed with that save.
  - With 8 helpers, each one gets fewer jobs, so its code stays cold longer.
- **Fix (v2, `b28e`):**
  - Auto start now runs the first save on the calling thread first, then starts the helpers on the next task.
  - The default helper count is capped at 4 (`B28_MAXW`).
- Cloud check of tester v2 (2 rounds): later saves 0.52 in Firefox 158 and 0.58 in Chromium 156; the first save wasn't slower. Bytes are the same.
- New tester: `helper-saves-tester-v2-2026.11.13.html`.
- Note: in a loop that calls `await packRowsParallel` back to back with no break in between, the helpers start only once the loop gives up a turn.

## Laptop round 2 (owner, 11:32 AM Detroit): tester v2, Firefox 160 on Windows, 16 cores

| Save | packRows | packRowsParallel | Ratio |
|---|---|---|---|
| First save | 582 ms | 595 ms | 1.02 |
| Later saves | 543 ms | 398 ms | **0.73** |

- Verdict: PASS. The file bytes are the same.
- The first save is now within noise: per-round first saves were 549 to 603 ms for packRowsParallel against 552 to 602 ms for packRows. That's down from 1.06 in round 1.
- Later saves on the laptop (0.73) gain less than in the cloud (0.52). Note that packRows on the laptop barely speeds up after its first save (582 to 543 ms), so main-thread work is a bigger share there.
- Chrome on the laptop: not run yet.

## Laptop round 3 (owner, 4:55 PM Detroit): tester v2, Chrome 157 on Windows, 16 cores

| Save | packRows | packRowsParallel | Ratio |
|---|---|---|---|
| First save | 538 ms | 553 ms | 1.03 |
| Later saves | 480 ms | 337 ms | **0.70** |

- Verdict: PASS. The file bytes are the same (4,306,870).
- First saves per round: packRowsParallel 501 to 602 ms, packRows 494 to 597 ms. They overlap, so the first save is even within noise.
- Both laptop browsers now pass: later saves take 0.70 (Chrome) and 0.73 (Firefox), and the first save comes in at 1.02 to 1.03.
- Card picture: `B28-laptop-send-options.png`.
