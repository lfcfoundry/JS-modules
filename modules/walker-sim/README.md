# walker-sim

**Version 2.0.0 · API 2**

**Tested in:** Firefox 158.0, ungoogled Chromium 155.0.8059.39-1, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time: the same-answers and timing run (tests/walker-sim-browser.js, readable and minified file; WebKit through tools/webkit-driver) and, in the first three, the demo page (tests/flow-demos.js); 70 Node checks in Node 22. Not run: the demo page in GNOME Web, a phone.

Simulates random walkers on a network (where do they end up, how long does it take, what does it cost), with the exact odds worked out by arithmetic so you can check the simulation against them. No dependencies. Cut from Net Flow Map. 51 KB readable (with its notes), or 26 KB as `walker-sim.min.js` (10.2 KB gzipped, against 39 KB and 12.3 KB for 1.0.0). The plain-words names for the random-number kinds are an optional 4 KB file, `walker-sim-menu.js` (1.5 KB gzipped), that a settings page loads and a script does not.

**Test it:** `node modules/walker-sim/test/run.js` (distributions, exact solver, loops, batches and split runs, what-if sweeps; about 2 s; add `modules/walker-sim/walker-sim.min.js` to check the minified file). `node tests/walker-sim-browser.js` runs one fixed set of walks and exact solves in Node and in a real browser and compares the answers (`CHROMIUM=...`, `FIREFOX=...` or `WEBKIT=1`, one at a time). **Try it:** `demo.html`.

## Use
```js
var P = WalkerSim.graph({ links: [
  { from: "start", to: "a", weight: 3 }, { from: "start", to: "b", weight: 1 },
  { from: "a", to: "win", weight: 2 },   { from: "a", to: "lose", weight: 2 }
], start: "start" });                                       // weight: how likely this way on is, compared with the other ways out of the same item (missing = 1)
var sim = WalkerSim.create(P, { seed: 7, trials: 1000, rule: "weights", weights: P.w, arrivals: { dist: "dunif", a: 100, b: 100 } });
sim.run(1e9, 1e9);                                          // run(most trials, most milliseconds); call again to carry on
var r = sim.snapshot();                                     // r.endpoints: [{ id, count, share, lo, hi }], r.walkers, r.stuck, steps, costs
var exact = WalkerSim.exactEndpoints(P, { rule: "weights", weights: P.w });   // exact.ends (indexes), exact.p (odds), exact.meanSteps, exact.converged
```
- **Repeatable:** trial *t* of seed *s* always draws the same numbers, however the run is cut into batches (`run` can be called in small slices to keep a page responsive) and however the trials are shared between threads (see below).
- **Menu of random numbers** (`WalkerSim.DRAW`; names and help texts for a settings page in `walker-sim-menu.js`, which adds `WalkerSim.DISTS` and `WalkerSim.DIST_BY`): fixed, normal, lognormal, poisson, binomial, negbinomial, geometric, exponential, gamma, weibull, beta, uniform, triangular, pareto, dunif and empirical, used for how many walkers arrive each trial (`arrivals`), how uncertain each link weight is (`linkWeight`), what each link costs (`linkCost`) and how long a walker waits at an item (`dwell`).
- **Choice rules:** `weights`, `uniform`, `first`, `softmax` (with `temp`) and `curious` (a walker prefers ways on to items it has not been to yet in this walk, as far as the weights allow). An item whose ways on all weigh 0 has no way on: walkers stop there and count as stuck, as in the exact solver.
- **95% ranges** on every end's share, and `sources` (several starts), `targets`, `stepCap` and `maxWalkers`.
- **Stop when precise enough:** `precision: 0.005` stops the run once the widest 95% range is within plus or minus 0.5 points (after at least `minWalkers`, default 2,000). The snapshot says `stoppedEarly` and how many `trials` of `planned` ran. A worst-case end share (one holding half the walkers) needs about 38,400 walkers for that. On the example network below, where each end holds a small share, it stopped after 13,600 walkers (15 ms, against 161 ms for the full 1,000,000) with the widest range at plus or minus 0.49 points. It stops at the same trial however the run is cut into slices.
- **Exact average steps and cost:** `exactEndpoints` also gives `meanSteps` and, when `linkCost` or `dwell` is set, `meanCost` (`null` when one of the distributions has no average, such as a Pareto with shape 1 or less), so the simulation's step and cost numbers can be checked the way the odds are.
- **Loops:** the exact solver goes round until the answers stop moving; a loop that needs more rounds than that is solved directly (up to 2,500 items in one tangle, a few hundred milliseconds). Every exact result carries `converged`, `error` and `method` (`'sweeps'` or `'loops'`), so a number that did not settle says so. In 1.0.0 it stopped silently after 500 rounds: on a 2,000-item network with 10% loops it reported that 0.02% of walkers reach an end, where the truth is 100% (now 100.000%, 0.4 s). A loop with no way out holds its walkers, and the answer says `stuck`.
- **What-if sweep:** `WalkerSim.sweep(P, cfg, { what: "items" | "links", top })` ranks which item or link, if removed, moves the end odds most.
- `graph` throws a plain-words error for an unknown start item, and rejects item names such as `__proto__`.

### Sharing a run between threads
Every trial's random numbers depend only on the seed and the trial number, and nothing a trial counts uses another trial's numbers. So the trials can be split any way you like and the counts add up exactly. Give each worker its own range with `firstTrial` and `trials` (the last trial number plus one), send back `sim.export()` (plain arrays; they travel by `postMessage`), and add them with `WalkerSim.merge(P, cfg, exports)`:
```js
// in the page: const parts = []; two workers get { firstTrial: 0, trials: 10000 } and { firstTrial: 10000, trials: 20000 }
// in each worker: const P = WalkerSim.graph(input); const q = WalkerSim.create(P, Object.assign({ weights: P.w }, cfg)); q.run(1e9, 1e9); postMessage(q.export());
const merged = WalkerSim.merge(P, Object.assign({ weights: P.w }, fullCfg), parts);   // merged.snapshot() reads like one run
```
Counts, shares, step counts, visits, moves and the per-trial percentiles come out identical to one run. The cost percentiles come from a thinned sample, so they agree closely, not exactly. `maxWalkers` and `precision` apply inside one sim, so give each worker its own share. To run in a Web Worker without a second file, put the source text of `walker-sim.js` and an `onmessage` handler in a Blob and start the worker from `URL.createObjectURL`.

## Numbers (Node 22, measured 2026-10-17)
A made-up network of 200 items and 587 links, 23 ends, 100 walkers per trial. The exact odds took 0.8 ms. Times are the middle of 7 to 15 runs.

| Walkers | time | walkers per second | worst gap to the exact odds (percentage points) | ends whose exact odds sit inside their 95% range |
|---|---|---|---|---|
| 1,000 | 1.0 ms | about 1.0 million | 1.44 | 22 of 23 |
| 10,000 | 1.7 ms | about 5.8 million | 0.66 | 20 of 23 |
| 100,000 | 16 ms | about 6.2 million | 0.15 | 22 of 23 |
| 1,000,000 | 164 ms | about 6.1 million | 0.06 | 22 of 23 |

1.0.0 took 29 ms for 100,000 walkers and 301 ms for 1,000,000 (about 1.8 times slower). A 95% range misses about 1 end in 20 by design. In the browsers, 1,000,000 walkers took 204 ms in ungoogled Chromium 155, 314 ms in Firefox 158 and 128 ms in WebKitGTK 2.52.6, against 343, 473 and 275 ms for 1.0.0 (one browser at a time; a fresh page each, so the first run includes warm-up). Two worker threads did 2,000,000 walkers in about half the time in all three (below).

| 2,000,000 walkers | one thread | 2 workers | 4 workers |
|---|---|---|---|
| ungoogled Chromium 155 | 474 ms | 246 ms | 219 ms |
| Firefox 158 | 589 ms | 346 ms | 207 ms |
| WebKitGTK 2.52.6 | 244 ms | 151 ms | 178 ms |

These ran on a 4-core cloud machine, include starting the workers and adding the pieces up, and gave identical counts to one thread in every case.

## Why
When a result comes from a simulation you want to know that the simulation is right. Where the odds can be worked out exactly (fixed weights), you get both and can compare. Where they cannot (uncertain weights, costs, waiting), the simulation is the only answer and the 95% ranges say how far to trust it.

## Limits
- The exact odds exist only for fixed weights with the `weights` or `uniform` rule and ends that are items with no way on. Otherwise `exactEndpoints` returns `null`.
- Walkers that loop forever are stopped at `stepCap` steps (default 400) and counted as `stuck`.
- Step counts, end counts and per-trial counts cover every walker. Cost values are kept as a sample (up to 100,000, and 5,000 per end), so cost percentiles and the cost histogram come from a sample.
- Each trial starts its generator from a 32-bit mix of the seed and the trial number, so the streams of different trials can start inside each other: 9 of 10,000 trials, 1,560 of 100,000 and 130,539 of 1,000,000. Over 40 seeds of 400,000 one-walker trials this made the scatter of results 0.2% wider than honest random numbers and the exact odds fell inside the 95% range 94.7% of the time (95% is honest), so it does not matter in practice; beyond a few million trials, vary the seed instead.
- The exact odds do not stop at `stepCap`: a walker that loops forever is `stuck` in the simulation after `stepCap` steps, but the exact solver follows it all the way. With long loops the two can differ by design; compare `stuck` and use a large `stepCap`.
- It is a simulation of independent walkers; walkers do not block or slow each other.

## Prior art
- [d3-random](https://github.com/d3/d3-random) (ISC, 3.0.1) gives you random numbers from 18 distributions (normal, log-normal, gamma, beta, Poisson and others) and a seedable generator; it does not walk networks or solve for exact odds. This module carries its own seeded generator and the 16 distributions it needs, with fast methods for normal and exponential numbers (ziggurat).
- The exact odds are the standard absorbing Markov chain answer, solved by arithmetic on the network, not by sampling.

## For AI agents
Build the graph once with `graph`, run `create(...).run(...)` for the simulation, and call `exactEndpoints` first: if it returns odds, show the simulation next to them and say how far apart they are, and say so when `converged` is false. Always set `seed` so the user can repeat a run. Do not report a simulated number without its 95% range. For a big run use `precision` to stop early, or share the trials between workers with `firstTrial` / `trials`, `export()` and `merge()`. A settings page that lists the random-number kinds loads `walker-sim-menu.js` after `walker-sim.js`; a script does not need it. Rebuild the minified file with `TERSER=/path/to/terser node modules/walker-sim/test/make-min.js` after any change.
