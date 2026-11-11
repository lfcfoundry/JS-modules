Copyright (c) 2026 LFC Foundry. MIT License.

# Claude results (2026-11-11)

Two corrective commits on top of the preserved Codex handoff `2ef4c6b`. Node pass/fail and byte counts only; no speed numbers (project rule: speed only in the three test browsers, which were not run here).

## netflow-plot 2.17.0: rest identity and tiny wedges (`217b9ae`)

**Real "Other" collision: FIXED AND TESTED.** The folded rest of a long list was the string `"Other"` (renamed later to `"Others"` / `"Others, average"`), so a real category spelled the same merged with it or lost rows. It is now a frozen `String` object (=== to no string, its own `gk()` key `-id`, its own legend key `o:`), used in every chart that folds (bar top-N, donut, line, scatter, histogram, box, density, parallel). A real `Other`/`Others`/`Others, average` keeps its own mark and literal label; the Codex candidate's rename to `Other (category)` is removed. The rest takes its usual label unless a shown category already reads that, then `All other(s)...`, then a number.

**Tiny wedges: FIXED AND TESTED.** Policy: every positive share is drawn at least 1 px wide at the outer rim, plus the gap. The width is taken from the wedges above the minimum in proportion, so unwidened wedges keep exact ratios, the ring closes exactly and larger values never draw narrower. Distortion bound: n x (1/r1 + 0.006) rad of the circle, under 2.5% for 12 wedges on a 150 px ring. Wedges are cut into equal pieces (no sliver piece). Texts keep the true value; `<0.1%` and `>99.9%` replace a misleading `0.0%` / `100.0%`; a widened wedge says "drawn at minimum size". Zero and negative shares draw nothing.

Tests: new `modules/netflow-plot/test/rest-and-wedges.js` (186 checks, also run by `test/run.js`): real Other only, overflow only, both, real low-ranked, count-mode Other + Others (the review's 7-row case: 7/7 rows), real "All others", real "Others, average" with averaged rest, blank and missing, grouped, duplicate labels, 24 input orders, line legend with 16 series, JSON and SVG round trips; donut ratios 1e3 to 1e300, 12 adjacent small wedges, exact proportions, six canvas sizes including fractional ones, one category (full circle), zero/negative, 1,000 categories. **Wedge area is read back from the written SVG text (two-decimal coordinates).** Parent 2.16.1 fails 57 of these checks, the Nov 10 candidate 75.

| Command | Result |
|---|---|
| `node modules/netflow-plot/test/run.js` | 628/628 |
| `node modules/netflow-scene/test/run.js` | exit 0 (SVG escaping unchanged) |
| `python3 tools/docs-check/docs-check.py` | 0 problems |

Not shown here: pixel visibility in a browser (no raster evidence). The minimum-size wedge is about 1 px at the rim; whether it is visible depends on the renderer and display.

**SVG XML escaping (netflow-scene): READY FOR INTEGRATION REVIEW**, unchanged. Re-checked in netflow-map: candidate SVG parses; a 1.2-million-character label with controls, lone surrogates and emoji gives a 4.65 MB SVG that parses; the app's grouped SVG (`src/app/76-svg.js`) still parses with a label holding a line break.

## lfc-pack 0.9.0: byte limits, cancelling, stats (`ff6dd17`)

**Buffer transfer fix: preserved unchanged in behavior** (exact-size private copy per block, copy at call). **Byte budget: FIXED AND TESTED, opt-in** (defaults unchanged):

- `pool.unpack(bytes, { stable: true })`: the caller promises not to change the bytes until the read settles, so a block is copied only when a helper takes it (the LZ4F "stable source" trade).
- `LfcPack.pool({ maxInflightBytes })`: byte limit for posted blocks; a block above the limit runs alone (never waits forever).
- `{ signal }`: AbortSignal; queued blocks dropped and released at once, posted blocks released when their helper answers; the pool keeps working.
- `pool.stats()`: queued, in-flight, held-copy and copied bytes, with peaks.

Measured with `node --expose-gc modules/lfc-pack/test/pool-budget.cjs --json` (Node 22.23.4, Linux x86_64, worker_threads; every post to a helper held to simulate a stalled consumer; 3,098,190-byte file, 40 blocks, 2 helpers). ArrayBuffer growth while stalled, caller input excluded:

| Build | Uint8Array input | Buffer input |
|---|---:|---:|
| Parent 0.8.1 | 3,100,083 B | fails: `Cannot transfer object of unsupported type` |
| Nov 10 candidate | 3,100,083 B | 3,100,083 B |
| 0.9.0 default | 3,100,083 B | 3,100,083 B |
| 0.9.0 `stable` | 315,158 B (4 blocks posted) | |
| 0.9.0 `stable` + limit 1.5 blocks | | 81,408 B (1 block) |

Bursty producer (6 calls at once, limit 2 blocks): 78,551 B held, 239 jobs queued with no copies, all rows correct. Cancel: 36 queued dropped, 4 posted released on answer, next read correct, for both modes. Raw JSON: [parent](evidence/pool-budget-parent-0.8.1.json), [candidate](evidence/pool-budget-nov10-candidate.json), [0.9.0](evidence/pool-budget-0.9.0.json).

`node modules/lfc-pack/test/run.js`: all lfc-pack checks pass (Python reader/writer steps skip: no zstandard package; unchanged from before).

Not covered: decoded output still accumulates until the call ends (Promise.all), so a byte limit bounds input copies, not result memory; concurrent SharedArrayBuffer writes during a copy (no atomic snapshot); mutation during synchronous wasm decode; browser Web Workers (`tests/lfc-pack-*-browser.js` not run); speed in browsers. Throughput or latency effects are **NOT RUN**.

## Owner decisions

1. Whether `stable` copy-at-send should become the default (it changes the snapshot rule: a caller that edits its bytes mid-read would then see wrong rows).
2. Release of netflow-plot 2.17.0 and lfc-pack 0.9.0 under the browser and speed rules.
