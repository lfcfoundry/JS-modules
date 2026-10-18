# walker-sim

**Version 2.1.0 · API 2**

**Tested in:** Node 22 (84 checks, for the readable file, the minified file and the joined file); Firefox 158.0 (reports 158.0b5), ungoogled Chromium 155.0.8059.39-1, WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, one at a time, in a real browser (tests/walker-sim-browser.js, 2026-10-17). Not run: the demo page in GNOME Web, a phone

Simulates random walkers on a network (where do they end up, how long does it take, what does it cost), with the exact odds worked out by arithmetic so you can check the simulation against them. No dependencies. Cut from Netflow Map. 61 KB readable (with its notes), or 31 KB as `walker-sim.min.js` (12.1 KB gzipped, against 26 KB and 10.6 KB for 2.0.0, and 39 KB and 12.3 KB for 1.0.0). The plain-words names for the random-number kinds are an optional 4 KB file, `walker-sim-menu.js` (1.5 KB gzipped), that a settings page loads and a script does not.

How it works: each walker starts at a start item and, at every item, picks one of the ways on by a rule (by weight, evenly, first, softmax or curious) until it reaches an item with no way on or hits a step cap. The run counts where walkers end up, how many steps and how much cost they took, and puts a 95% range on each end's share. Every trial draws its numbers from the seed and the trial number, so the same seed gives the same run. Separately, the exact odds are worked out by arithmetic on the network, so the simulation can be checked against them.

## Why it exists
When a result comes from a simulation you want to know that the simulation is right. Where the odds can be worked out exactly (fixed weights), you get both and can compare. Where they cannot (uncertain weights, costs, waiting), the simulation is the only answer and the 95% ranges say how far to trust it.

## Try it and test it

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
- **Which weights matter (new in 2.1.0):** `WalkerSim.sensitivity(P, cfg, { top })` tells, for every link, how far each end's odds move for one more unit of that link's weight (exact, from the same solve as `exactEndpoints`; 501 links in about 2 to 3 ms). Rows come biggest first as `{ from, to, d: [per end], reach }`. Give it `linkWeight` (the same uncertainty menu the simulation uses) and it also returns `sd`, the spread of every end's odds that this uncertainty causes, in about 2 ms; the simulation needs about 850 ms (3,000 trials) to show the same spread. It checks out against finite differences to 1e-12 and, for `sd`, against 300 exact re-solves (within 7%). Needs the `weights` rule.
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

> **Node numbers.** Tables and sentences that say Node were measured in Node, not in a test browser, so they are not what a visitor's browser does; read them only to compare rows with each other. Rows and sentences named for a browser (ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5) were measured in that browser. Re-measuring the Node ones in the four browsers is not done (open item on `TASKS.md`).

A made-up network of 200 items and 587 links, 23 ends, 100 walkers per trial. The exact odds took 0.8 ms. Times are the middle of 7 to 15 runs.

| Walkers | time | walkers per second | worst gap to the exact odds (percentage points) | ends whose exact odds sit inside their 95% range |
|---|---|---|---|---|
| 1,000 | 1.0 ms | about 1.0 million | 1.44 | 22 of 23 |
| 10,000 | 1.7 ms | about 5.8 million | 0.66 | 20 of 23 |
| 100,000 | 16 ms | about 6.2 million | 0.15 | 22 of 23 |
| 1,000,000 | 164 ms | about 6.1 million | 0.06 | 22 of 23 |

1.0.0 took 29 ms for 100,000 walkers and 301 ms for 1,000,000 (about 1.8 times slower). A 95% range misses about 1 end in 20 by design. In the browsers, 1,000,000 walkers took 204 ms in ungoogled Chromium 155, 314 ms in Firefox 158 and 128 ms in WebKitGTK 2.52.6, against 343, 473 and 275 ms for 1.0.0 (one browser at a time; a fresh page each, so the first run includes warm-up). Two worker threads did 2,000,000 walkers in about half the time in all three (below).

2.1.0 gives the same counts for the same seed and is faster: 1,000,000 walkers take 80 ms in Node (192 ms for 2.0.0, 2.4 times faster), 102 ms in ungoogled Chromium 155 (was 238), 115 ms in Firefox 158 (was 381), 62 ms in WebKitGTK 2.52.6 (was 141) and 53 ms in GNOME Web 46.5 (was 139), middle of 9 runs on a busy cloud machine. Runs with uncertain weights are 1.2 to 1.8 times faster, runs with random costs or waits 1.2 to 1.6 times (Gamma and Weibull costs barely change: 1.03 times).


| 2,000,000 walkers | one thread | 2 workers | 4 workers |
|---|---|---|---|
| ungoogled Chromium 155 | 474 ms | 246 ms | 219 ms |
| Firefox 158 | 589 ms | 346 ms | 207 ms |
| WebKitGTK 2.52.6 | 244 ms | 151 ms | 178 ms |

These ran on a 4-core cloud machine, include starting the workers and adding the pieces up, and gave identical counts to one thread in every case.

### Optional: the WebAssembly loop (walker-sim-wasm.js)
Two ways to use walker-sim, your choice: `walker-sim.js` alone (the default, plain JavaScript, works under any page policy), or `walker-sim.js` plus `walker-sim-wasm.js` (or the two joined in `walker-sim-with-wasm.min.js`). The counts are exactly the same either way; only the speed differs.

- What it does: the walking loop runs as a 1 KB WebAssembly program. After a run's first 20,000 walkers (change with `cfg.wasmAfter`) it takes over, so small runs never pay for setting it up. `cfg.wasm = false` keeps one run on JavaScript; `sim.engine` says which loop a run used (`'js'` or `'wasm'`).
- How much faster than the plain 2.1.0 file, 1,000,000 walkers (middle of 9 runs): Node 80 to 44 ms (1.8 times), ungoogled Chromium 155 110 to 52 ms (2.1 times), Firefox 158 111 to 52 ms (2.1 times), WebKitGTK 2.52.6 82 to 65 ms (1.3 times), GNOME Web 46.5 50 to 52 ms (no gain). So it is for Chrome-type and Firefox pages with big runs. Runs of one walker per trial do not gain (1.0 to 1.1 times); runs with costs, waits or uncertain weights do not use it.
- What it needs: a page that allows WebAssembly (the policy word is `wasm-unsafe-eval`). Where the page forbids it, or the browser has none, loading the file does nothing: `WalkerSim.wasm` is `false` and everything runs on the JavaScript loop (checked in all four browsers with a page that forbids it; Firefox also prints a console message about the blocked WebAssembly).
- Size: `walker-sim-wasm.min.js` is 3,968 bytes (2,039 gzipped); the joined file is 34,807 bytes (13,857 gzipped); the plain `walker-sim.min.js` is 30,839 bytes (12,141 gzipped).
- Source: `wasm/walker-sim.c`; `wasm/build.sh` builds `wasm/walker-sim.wasm` (966 bytes, needs clang with the wasm32 target) and `wasm/embed.py` puts it into `walker-sim-wasm.js`.

## How it compares
walker-sim is one package for a job that is usually done by hand: random walkers on a network, plus the exact odds to check them against. No ready-made package that does that whole job is named in the research or the changelog, so the table shows the two things people use instead. Speed against both: not measured.

| Alternative | Size (smaller is better) | Speed | Features | Where it wins / loses |
|---|---|---|---|---|
| [d3-random](https://github.com/d3/d3-random) (ISC, 3.0.1) | Not measured. This module: 30,839 bytes minified (12.1 KB gzipped) with the walking code, 34,807 joined with the WebAssembly loop | Not measured against d3-random. This module, 1,000,000 walkers on the example network: 102 ms in ungoogled Chromium 155, 115 ms in Firefox 158, 62 ms in WebKitGTK 2.52.6, 53 ms in GNOME Web 46.5 (lower is better) | 18 distributions and a seedable generator; no network walking, no exact odds, no ranges | d3-random wins on having 18 distributions (this module has 16); size: not measured. This module wins if you need to walk a network and check the answer |
| A hand-written loop with `Math.random()` | Smallest possible (no library) | Not measured | Not repeatable from a seed; no 95% ranges; no exact odds; cannot split a run across threads with identical counts | Wins on size and simplicity. Loses on repeatability and on knowing whether the answer is right |

**Where it loses**
- Bigger than a hand-written loop or a distribution-only library (sizes of d3-random: not measured).
- Two distributions fewer than d3-random (16 against 18).
- The exact odds exist only for fixed weights with the `weights` or `uniform` rule; otherwise only the simulation answers.
- The optional WebAssembly loop gives no gain in GNOME Web 46.5 and needs a page that allows `wasm-unsafe-eval`.
- Cost percentiles come from a sample, and very long runs (beyond a few million trials) can see overlapping random streams (see Limits).

## Limits
- The exact odds exist only for fixed weights with the `weights` or `uniform` rule and ends that are items with no way on. Otherwise `exactEndpoints` returns `null`.
- Walkers that loop forever are stopped at `stepCap` steps (default 400) and counted as `stuck`.
- Step counts, end counts and per-trial counts cover every walker. Cost values are kept as a sample (up to 100,000, and 5,000 per end), so cost percentiles and the cost histogram come from a sample.
- Each trial starts its generator from a 32-bit mix of the seed and the trial number, so the streams of different trials can start inside each other: 9 of 10,000 trials, 1,560 of 100,000 and 130,539 of 1,000,000. Over 40 seeds of 400,000 one-walker trials this made the scatter of results 0.2% wider than honest random numbers and the exact odds fell inside the 95% range 94.7% of the time (95% is honest), so it does not matter in practice; beyond a few million trials, vary the seed instead.
- The exact odds do not stop at `stepCap`: a walker that loops forever is `stuck` in the simulation after `stepCap` steps, but the exact solver follows it all the way. With long loops the two can differ by design; compare `stuck` and use a large `stepCap`.
- It is a simulation of independent walkers; walkers do not block or slow each other.

## Prior art and credits
- [d3-random](https://github.com/d3/d3-random) (ISC, 3.0.1) gives you random numbers from 18 distributions (normal, log-normal, gamma, beta, Poisson and others) and a seedable generator; it does not walk networks or solve for exact odds. This module carries its own seeded generator and the 16 distributions it needs, with fast methods for normal and exponential numbers (ziggurat). No d3-random code is used.
- The exact odds are the standard absorbing Markov chain answer, solved by arithmetic on the network, not by sampling. Textbook method, no code from others.
- Ziggurat method for normal and exponential numbers: Marsaglia and Tsang, "The Ziggurat Method for Generating Random Variables" (2000), with the exact tail method of Marsaglia (1964). Published algorithm and constants; the code is written here.
- Gamma numbers: Marsaglia and Tsang's gamma method (2000). Published algorithm; code written here.
- The random-number generator is mulberry32, a small generator shared in the public domain by Tommy Ettinger; the source file names it but not its author or license, so this credit comes from the common publication of that code.
- 95% ranges on the end shares use the Wilson score interval (E. B. Wilson, 1927).
- The optional WebAssembly loop is C written for this module (`wasm/walker-sim.c`), built with clang; it repeats the JavaScript loop step for step.
- The simulator was cut from Netflow Map (LFC Foundry's own code).
No other code from others; the ideas above are theirs.

## For AI agents
Build the graph once with `graph`, run `create(...).run(...)` for the simulation, and call `exactEndpoints` first: if it returns odds, show the simulation next to them and say how far apart they are, and say so when `converged` is false. Always set `seed` so the user can repeat a run. Do not report a simulated number without its 95% range. For a big run use `precision` to stop early, or share the trials between workers with `firstTrial` / `trials`, `export()` and `merge()`. A settings page that lists the random-number kinds loads `walker-sim-menu.js` after `walker-sim.js`; a script does not need it. Rebuild the minified file with `TERSER=/path/to/terser node modules/walker-sim/test/make-min.js` after any change.

Use `walker-sim.js` alone unless the user's page allows WebAssembly and the runs are big (100,000 walkers or more); then add `walker-sim-wasm.js` (or use `walker-sim-with-wasm.min.js`) for about twice the speed in Chromium and Firefox. Never rely on it: results are identical without it.
