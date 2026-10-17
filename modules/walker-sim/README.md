# walker-sim

**Version 1.0.0 · API 1**

**Tested in:** Node checks; the demo page in Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6, one at a time (`tests/flow-demos.js`, 2026-10-17; WebKitGTK through WebDriver). Not run: GNOME Web (Epiphany) 46.5, a phone.

Simulates random walkers on a network (where do they end up, how long does it take, what does it cost), with the exact odds worked out by arithmetic so you can check the simulation against them. About 39 KB (12.3 KB gzipped), no dependencies. Cut from Net Flow Map.

**Test it:** `node modules/walker-sim/test/run.js` (distributions, exact solver, batches, what-if sweeps; about 1 s). **Try it:** `demo.html`.

## Use
```js
var P = WalkerSim.graph({ links: [
  { from: "start", to: "a", weight: 3 }, { from: "start", to: "b", weight: 1 },
  { from: "a", to: "win", weight: 2 },   { from: "a", to: "lose", weight: 2 }
], start: "start" });                                       // weight: how likely this way on is, compared with the other ways out of the same item (missing = 1)
var sim = WalkerSim.create(P, { seed: 7, trials: 1000, rule: "weights", weights: P.w, arrivals: { dist: "dunif", a: 100, b: 100 } });
sim.run(1e9, 1e9);                                          // run(most trials, most milliseconds); call again to carry on
var r = sim.snapshot();                                     // r.endpoints: [{ id, count, share, lo, hi }], r.walkers, r.stuck, steps, costs
var exact = WalkerSim.exactEndpoints(P, { rule: "weights", weights: P.w });   // exact.ends (indexes), exact.p (odds)
```
- **Repeatable:** trial *t* of seed *s* always draws the same numbers, however the run is cut into batches (`run` can be called in small slices to keep a page responsive).
- **Menu of random numbers** (`WalkerSim.DISTS`): fixed, normal, lognormal, poisson, binomial, negbinomial, geometric, exponential, gamma, weibull, beta, uniform, triangular, pareto, dunif and empirical, used for how many walkers arrive each trial (`arrivals`), how uncertain each link weight is (`linkWeight`), what each link costs (`linkCost`) and how long a walker waits at an item (`dwell`).
- **Choice rules:** `weights`, `uniform`, `first` and `softmax` (with `temp`).
- **95% ranges** on every end's share, and `sources` (several starts), `targets`, `stepCap` and `maxWalkers`.
- **What-if sweep:** `WalkerSim.sweep(P, cfg, { what: "items" | "links", top })` ranks which item or link, if removed, moves the end odds most.
- `graph` throws a plain-words error for an unknown start item, and rejects item names such as `__proto__`.

## Numbers (Node 22, measured 2026-10-17)
A made-up network of 199 items and 561 links, 23 ends, 100 walkers per trial. The exact odds took 7 ms.

| Walkers | time | walkers per second | worst gap to the exact odds (percentage points) | ends whose exact odds sit inside their 95% range |
|---|---|---|---|---|
| 1,000 | 6 ms | about 170,000 | 1.74 | 21 of 23 |
| 10,000 | 16 ms | about 630,000 | 0.34 | 23 of 23 |
| 100,000 | 57 ms | about 1.75 million | 0.12 | 23 of 23 |
| 1,000,000 | 431 ms | about 2.3 million | 0.07 | 21 of 23 |

The gap is about 14 times smaller from 1,000 to 100,000 walkers; at 1,000,000 what is left (0.07 points) is ordinary run-to-run noise. A 95% range misses about 1 end in 20 by design.

## Why
When a result comes from a simulation you want to know that the simulation is right. Where the odds can be worked out exactly (fixed weights), you get both and can compare. Where they cannot (uncertain weights, costs, waiting), the simulation is the only answer and the 95% ranges say how far to trust it.

## Limits
- The exact odds exist only for fixed weights with the `weights` or `uniform` rule and ends that are items with no way on. Otherwise `exactEndpoints` returns `null`.
- Walkers that loop forever are stopped at `stepCap` steps (default 400) and counted as `stuck`.
- Stored samples are capped (step counts, costs), so the histograms use a sample, not every walker.
- It is a simulation of independent walkers; walkers do not block or slow each other.

## Prior art
- [d3-random](https://github.com/d3/d3-random) (ISC, 3.0.1) gives you random numbers from 18 distributions (normal, log-normal, gamma, beta, Poisson and others) and a seedable generator; it does not walk networks or solve for exact odds. This module carries its own seeded generator and the 16 distributions it needs, with fast methods for normal and exponential numbers (ziggurat).
- The exact odds are the standard absorbing Markov chain answer, solved by arithmetic on the network, not by sampling.

## For AI agents
Build the graph once with `graph`, run `create(...).run(...)` for the simulation, and call `exactEndpoints` first: if it returns odds, show the simulation next to them and say how far apart they are. Always set `seed` so the user can repeat a run. Do not report a simulated number without its 95% range.
