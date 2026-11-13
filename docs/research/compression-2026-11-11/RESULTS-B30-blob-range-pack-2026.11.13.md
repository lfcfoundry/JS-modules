# B30: Blob-range pack jobs, no main-thread copy (E34)

Research, 2026.11.13 5:00 to 5:26 PM Detroit time. The orchestrater relayed this lead from the Codex review thread: part 1's screen (Chromium 153 only, NO-COPY-SCREEN-2026.11.11.md) had never had a three-browser result. Base: B25 + B26 + B28e. Nothing was pushed to `modules/`.

## What changed (`b30-on-b28.diff`, pool.js only)

- `packParallel(input)` now also accepts a `Blob` or `File`.
  - Block cuts come from 64 KB windows read after each nominal boundary, using the same rule: the first newline at or after start + blockBytes.
  - Each helper gets `{ blob, a, e }` and reads its own range with `blob.slice(a, e).arrayBuffer()`.
  - The calling thread never holds the whole file and never copies it.
- Exact mode, shared tables, `balance`, and inputs of 1 block read the Blob whole and then take the old path, so the output is the same.
- Before this, a Blob passed to packParallel was not supported. That makes this a new input kind, not a new setting.
- `__B30 = 0` turns it off (research switch).

## Same bytes

- `b30chk.cjs` (Node 22, Blob through worker_threads) compares `pack(bytes)`, `packParallel(bytes)` and `packParallel(blob)` on 18 cases: small (50 rows), logs 60k, no trailing newline, 200 KB lines, runs of blank lines, nested events 100k, each at the default, 256 KB and 1 MB blocks. 0 differences.
- Every browser run below had the same output hash in both modes.
- `node test/run.js`: all checks pass.

## Speed, peak memory, main-thread stall

Setup:
- Fresh page per run, alternating order, 4 rounds, 3 helpers (warmed first).
- "Today" = `new Uint8Array(await blob.arrayBuffer())` then `packParallel(bytes)`. "B30" = `packParallel(blob)`.
- **Peak memory is measured, not modeled.** It's the summed RssAnon (private memory) of the whole browser process tree, sampled every 8 ms from /proc, minus the level just before the call.
- Stall = the longest gap seen by a 4 ms timer on the main thread.

Time is a share of today: ratio of medians ± SE of per-round ratios.

| File | Time C / F / W | Weighted | Peak MB today -> B30 (C / F / W) | Stall ms today -> B30 (C / F / W) |
|---|---|---|---|---|
| Taxi 121 MB (real) | 0.92±0.01 / 0.75±0.01 / 0.95±0.02 | **0.90** | 376->267 / 569->506 / 567->536 | 71->8 / 18->10 / 62->19 |
| Logs 44 MB | 1.01±0.04 / 0.74±0.05 / 0.82±0.05 | **0.92** | 267->227 / 293->240 / 409->399 | 37->11 / 12->7 / 33->15 |
| Events 17.5 MB (nested) | 0.87±0.02 / 0.91±0.03 / 0.92±0.06 | **0.89** | 101->85 / 96->81 / 187->158 | 23->5 / 10->6 / 21->15 |

- No cell is slower beyond 2x SE. Logs in Chromium is even (1.01 ± 0.04).
- Peak memory falls by roughly one file copy in Chromium (taxi -109 MB of 121 MB). It falls less in Firefox and WebKitGTK (-62 and -31 MB on taxi), whose Blob reads keep more of their own buffers.
- Part 1's screen saw flat wall time. Here, with the pinned browsers and real reads counted, wall time also drops: the helpers' reads overlap packing, and the main-thread read and copy are gone.

## Stack test with B28 packRowsParallel (taxi, 3 rounds)

The page imports the 121 MB file with packParallel, then saves the same 300k rows with packRowsParallel. Both calls share the warm helpers.

| | Total C / F / W | Weighted | Peak MB today -> B30 (C / F / W) |
|---|---|---|---|
| Import + save | 0.96±0.02 / 0.80±0.02 / 1.02±0.04 | 0.95 | 386->271 / 567->460 / 580->402 |

- The import part gains as above, and the save part is unchanged (302 vs 306 ms in Chromium, 220 vs 234 in Firefox, 259 vs 262 in WebKitGTK). The gains add up. They don't multiply, because the two calls work on different inputs.
- Memory adds up better: the peak falls by 107 to 178 MB, because the file buffer is no longer held while the save runs.
- The long main-thread stall in the stack (209 to 301 ms) belongs to packRowsParallel's row scatter. B30 doesn't change it. That's the target for the B29 retry.

## Limits

- One shared 4-core cloud box, with 3 helpers. Laptops with more cores may gain more time, because packing stops being the limit later.
- The Blob comes from `fetch().blob()`. A real `File` from a file picker is disk-backed, so its memory win may be larger.
- 4 rounds per cell (3 for the stack).

## Files (this folder)

- `b30-on-b28.diff` (60 lines, pool.js).
- `results/bl-*.json` and `results/bls-*.json`.
- `tools/bl.html`, `bld.cjs` (driver with the memory sampler), `bla.py`, `b30chk.cjs`.
- Card picture: `B30-blob-range-options.png`.

Catalog: B30 Blob-range pack jobs (E34), taxi import 0.90 weighted, peak -31 to -109 MB, main-thread stall 71 to 8 ms (Chromium), same bytes, RESULTS-B30-blob-range-pack-2026.11.13.md, on a card.
