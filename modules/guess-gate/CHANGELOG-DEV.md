# guess-gate developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-11-21

### Quick
New module: `GuessGate.create(opts)` returns a gate with `start`, `run`, `allowed`, `nextIn`, `stats` and `finish`. A guess runs only when guesses so far plus the estimate fit in `share` of the elapsed time and the import has run for `minMs`.

### Details
Defaults: `share` 0.1, `minMs` 40. The estimate defaults to the cost of the last guess. Simulated progressive Sankey import (40 chunks of 4 ms parsing, final layout), total ms for no guesses / gate at 10% / a guess after every chunk: Chromium 156 282.6 / 282.7 / 1447.7; Firefox 158 266.6 / 265.0 / 1489.6; WebKitGTK 2.52.6 264 / 288 / 1542. In Chromium a 25% gate cost about 322 ms with 2 guesses. Size is in the module page.

### Deep
Added at the coordinator's request on 2026-11-21 to carry the owner's progressive-build rule (show a best guess during import, then refine) without making imports slower; Netflow Map and Workbench can adopt it. Patching a Sankey layout instead of redoing it, and a hierarchy or scene patch, were measured and not worth shipping (the output building dominates), so the gate limits how often a full guess runs instead. Tests (7, fake clock): start state, minMs, share limit, estimate, skip count, nextIn, finish and option errors.
