# guess-gate developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.0.1 · API 1 · 2026-11-21

### Quick
The default `share` is 0.05 (was 0.1). Code that passes `share` is not affected; code that relied on the default now gets fewer guesses.

### Details
Simulated progressive Sankey import (40 chunks of 4 ms parsing, final layout), alternating pages, median of 5 (9 in Firefox), total ms for no guesses / gate at 5% / a guess after every chunk: Chromium 156 267.3 / 254.2 / 1358.7; Firefox 158 270 / 258.4 / 1456.4; WebKitGTK 2.52.6 249 / 255 / 1607. At 10% WebKitGTK measured 258 against 279 ms (ratio 1.125 over 5 pages, 0.96 to 1.15).

### Deep
The coordinator flagged the 10% result as over the 5% guard. The first guess is allowed once `minMs` passes and its cost is unknown, so it can use about the whole share; one guess of about 20 ms is 8% of a 260 ms import. Cutting the share to 5% keeps that one guess inside the guard (Firefox A/A on the same page: 0.97; gate at 5%: 0.95 over 9 pages). A 4% share gave the same result as 5% in WebKitGTK (ratio 1.06, noise).

## 1.0.0 · API 1 · 2026-11-21

### Quick
New module: `GuessGate.create(opts)` returns a gate with `start`, `run`, `allowed`, `nextIn`, `stats` and `finish`. A guess runs only when guesses so far plus the estimate fit in `share` of the elapsed time and the import has run for `minMs`.

### Details
Defaults: `share` 0.1, `minMs` 40. The estimate defaults to the cost of the last guess. Simulated progressive Sankey import (40 chunks of 4 ms parsing, final layout), total ms for no guesses / gate at 10% / a guess after every chunk: Chromium 156 282.6 / 282.7 / 1447.7; Firefox 158 266.6 / 265.0 / 1489.6; WebKitGTK 2.52.6 264 / 288 / 1542. In Chromium a 25% gate cost about 322 ms with 2 guesses. Size is in the module page.

### Deep
Added at the coordinator's request on 2026-11-21 to carry the owner's progressive-build rule (show a best guess during import, then refine) without making imports slower; Netflow Map and Workbench can adopt it. Patching a Sankey layout instead of redoing it, and a hierarchy or scene patch, were measured and not worth shipping (the output building dominates), so the gate limits how often a full guess runs instead. Tests (7, fake clock): start state, minMs, share limit, estimate, skip count, nextIn, finish and option errors.
