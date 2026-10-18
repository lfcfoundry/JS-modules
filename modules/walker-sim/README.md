# walker-sim

**Version 2.2.0 · API 2**

**Tested in:** Node 22.22.0 (walker-sim checks on all four files); tests/wasm-default-bench.js one browser at a time on 2026-10-18: Firefox 158.0 (reports 158.0b5), ungoogled-chromium 155.0.8059.39-1, WebKitGTK 2.52.6 (MiniBrowser), GNOME Web (Epiphany) 46.5; the default file also on a page without WebAssembly in all four

Simulates random walkers on a network (where do they end up, how long does it take, what does it cost), with the exact odds worked out by arithmetic so you can check the simulation against them. No dependencies. Cut from Netflow Map. 61 KB readable (with its notes), or 31 KB as `walker-sim.min.js` (12.1 KB gzipped). The plain-words names for the random-number kinds are an optional 4 KB file, `walker-sim-menu.js` (1.5 KB gzipped), that a settings page loads and a script does not.

Each walker starts at a start item and, at every item, picks one of the ways on by a rule (by weight, evenly, first, softmax or curious) until it reaches an item with no way on or hits a step cap. The run counts where walkers end up, how many steps and how much cost they took, and puts a 95% range on each end's share. Every trial draws its numbers from the seed and the trial number, so the same seed gives the same run.

## Why it exists

When a result comes from a simulation you want to know the simulation is right. Where the odds can be worked out exactly (fixed weights) you get both and can compare. Where they cannot (uncertain weights, costs, waiting) the simulation is the only answer, and the 95% ranges say how far to trust it.

## Use

Copy `walker-sim-with-wasm.js` (or `walker-sim-with-wasm.min.js`), the default: a `<script>` tag sets `WalkerSim`, or `require` it in Node. Big runs use a small WebAssembly walking loop and everything else, or any page that forbids WebAssembly, uses the JavaScript loop; the counts are the same either way. Pages that must stay as small as possible copy `walker-sim.js` (or `walker-sim.min.js`), the JavaScript-only file.

```js
var P = WalkerSim.graph({ links: [
  { from: "start", to: "a", weight: 3 }, { from: "start", to: "b", weight: 1 },
  { from: "a", to: "win", weight: 2 },   { from: "a", to: "lose", weight: 2 }
], start: "start" });                                       // weight: how likely this way on is next to the other ways out of the same item (missing = 1)
var sim = WalkerSim.create(P, { seed: 7, trials: 1000, rule: "weights", weights: P.w, arrivals: { dist: "dunif", a: 100, b: 100 } });
sim.run(1e9, 1e9);                                          // run(most trials, most milliseconds); call again to carry on
var r = sim.snapshot();                                     // r.endpoints: [{ id, count, share, lo, hi }], r.walkers, r.stuck, steps, costs
var exact = WalkerSim.exactEndpoints(P, { rule: "weights", weights: P.w });   // exact.ends (indexes), exact.p (odds), exact.meanSteps, exact.converged
```

**Try it:** `demo.html`. **Test it:** `node modules/walker-sim/test/run.js` (distributions, exact solver, loops, batches and split runs, what-if sweeps; about 2 s; add the path of `walker-sim.min.js` to check the minified file). `node tests/walker-sim-browser.js` runs one fixed set of walks and exact solves in Node and in a real browser and compares the answers (`CHROMIUM=...`, `FIREFOX=...` or `WEBKIT=1`, one at a time).

## What it can do

- **Repeatable:** trial *t* of seed *s* always draws the same numbers, however the run is cut into slices (to keep a page responsive) or shared between threads.
- **Random numbers** (`WalkerSim.DRAW`; names and help texts for a settings page are in `walker-sim-menu.js`, which adds `WalkerSim.DISTS` and `WalkerSim.DIST_BY`): fixed, normal, lognormal, poisson, binomial, negbinomial, geometric, exponential, gamma, weibull, beta, uniform, triangular, pareto, dunif and empirical. Used for walkers per trial (`arrivals`), link weight uncertainty (`linkWeight`), link cost (`linkCost`) and waiting at an item (`dwell`).
- **Choice rules:** `weights`, `uniform`, `first`, `softmax` (with `temp`) and `curious` (prefers items not yet visited in this walk, as far as the weights allow). An item whose ways on all weigh 0 has no way on: walkers stop there and count as stuck, as in the exact solver. Also `sources` (several starts), `targets`, `stepCap` and `maxWalkers`.
- **Stop when precise enough:** `precision: 0.005` stops once the widest 95% range is within plus or minus 0.5 points (after at least `minWalkers`, default 2,000); the snapshot says `stoppedEarly` and how many `trials` of `planned` ran. A worst-case end share (one holding half the walkers) needs about 38,400 walkers; on the example network, where each end holds a small share, it stopped after 13,600 walkers with the widest range at plus or minus 0.49 points.
- **Exact average steps and cost:** `exactEndpoints` also gives `meanSteps` and, with `linkCost` or `dwell`, `meanCost` (`null` when a distribution has no average, such as a Pareto with shape 1 or less).
- **Loops:** the exact solver goes round until the answers stop moving; a loop that needs more rounds is solved directly (up to 2,500 items in one tangle). Every exact result carries `converged`, `error` and `method` (`'sweeps'` or `'loops'`); a loop with no way out holds its walkers and the answer says `stuck`.
- **What-if sweep:** `WalkerSim.sweep(P, cfg, { what: "items" | "links", top })` ranks which item or link, if removed, moves the end odds most.
- **Which weights matter:** `WalkerSim.sensitivity(P, cfg, { top })` gives, for every link, how far each end's odds move for one more unit of its weight (exact), biggest first as `{ from, to, d: [per end], reach }`. With `linkWeight` it also returns `sd`, the spread of each end's odds that the uncertainty causes. Matches finite differences to 1e-12 and, for `sd`, 300 exact re-solves within 7%. Needs the `weights` rule.
- `graph` throws a plain-words error for an unknown start item and rejects item names such as `__proto__`.

**Sharing a run between threads.** Give each worker its own range with `firstTrial` and `trials` (the last trial number plus one), send back `sim.export()` (plain arrays) and add them with `WalkerSim.merge`; the counts add up exactly:

```js
// worker 1 gets { firstTrial: 0, trials: 10000 }, worker 2 { firstTrial: 10000, trials: 20000 }; each runs create(...).run(...) and postMessage(q.export())
const merged = WalkerSim.merge(P, Object.assign({ weights: P.w }, fullCfg), parts);   // merged.snapshot() reads like one run
```

Counts, shares, step counts, visits, moves and per-trial percentiles come out identical to one run; cost percentiles agree closely, not exactly. `maxWalkers` and `precision` apply inside one sim, so give each worker its own share. A Web Worker needs no second file: put the source text of `walker-sim.js` and an `onmessage` handler in a Blob.

## WebAssembly first (the default since 2.2.0)

Which file to copy:

| File | What it is | Size (smaller is better) |
|---|---|---|
| `walker-sim-with-wasm.js` / `walker-sim-with-wasm.min.js` | **The default.** `walker-sim.js` followed by `walker-sim-wasm.js`: the WebAssembly loop is on from the start. | 66,418 bytes (21,502 gzipped) / 34,764 bytes (13,864 gzipped) |
| `walker-sim.js` / `walker-sim.min.js` | JavaScript only, works under any page policy; for pages that must stay small. | 61,220 bytes (19,219 gzipped) / 30,800 bytes (12,099 gzipped) |
| `walker-sim-wasm.js` / `walker-sim-wasm.min.js` | The WebAssembly loop alone, to load after `walker-sim.js`. The default file already holds both. | 5,197 bytes (2,435 gzipped) / 3,964 bytes (2,015 gzipped) |

- The walking loop runs as a 1 KB WebAssembly program that takes over after a run's first 20,000 walkers (`cfg.wasmAfter`), so small runs never pay for setting it up. `cfg.wasm = false` keeps one run on JavaScript; `sim.engine` says which loop ran (`'js'` or `'wasm'`). The counts are exactly the same either way for the same seed.
- It needs a page that allows WebAssembly (policy word `wasm-unsafe-eval`). Otherwise `WalkerSim.wasm` is `false` and everything runs on the JavaScript loop (checked in all four browsers with a page that forbids it; Firefox also prints a console message).
- `walker-sim-with-wasm.js` is `walker-sim.js` followed by `walker-sim-wasm.js`, nothing else; `test/make-min.js` builds it and the minified files, and the tests fail when it is stale.
- Source: `wasm/walker-sim.c`; `wasm/build.sh` builds `wasm/walker-sim.wasm` (966 bytes, needs clang with wasm32) and `wasm/embed.py` puts it into `walker-sim-wasm.js`.

1,000,000 walkers on the README network in a freshly opened page (graph building and the WebAssembly start-up included), median of 7, the two files taking turns. **Lower milliseconds are better; a bigger "times faster" is better.**

| Browser | Plain file (ms) | Default file (ms) | Times faster |
|---|---:|---:|---:|
| ungoogled-chromium 155.0.8059.39-1 | 88.6 | 57.6 | 1.54x |
| Firefox 158.0 (reports 158.0b5) | 88.0 | 56.0 | 1.57x |
| WebKitGTK 2.52.6 | 46.0 | 59.0 | 0.78x |
| GNOME Web 46.5 | 50.0 | 58.0 | 0.86x |

WebKit-family browsers are the exception, and the numbers say so plainly. In a freshly opened page the WebAssembly loop is slower there, at every size tried (milliseconds for the whole page, smaller is better; "default, cfg.wasm = false" is the default file with the loop switched off, to show the extra file itself costs about nothing):

| Walkers | Browser | Plain file | Default file | Default, `cfg.wasm = false` |
|---|---|---:|---:|---:|
| 100,000 | WebKitGTK 2.52.6 | 14 | 22 | 18 |
| 100,000 | GNOME Web 46.5 | 15 | 25 | 19 |
| 1,000,000 | WebKitGTK 2.52.6 | 46 | 53 | 47 |
| 1,000,000 | GNOME Web 46.5 | 51 | 59 | 51 |
| 4,000,000 | WebKitGTK 2.52.6 | 142 | 160 | 144 |
| 4,000,000 | GNOME Web 46.5 | 144 | 173 | 156 |

The 2.1.0 figures for these two browsers (1.0 to 1.3 times faster) came from a page that had already run the loop several times; the first run in a new page, which is what a visitor sees, goes the other way. Chromium and Firefox gain about 1.5 times either way. A page aimed at Safari-like browsers can set `cfg.wasm = false` or copy `walker-sim.js`.

## Numbers

Node rows were measured in Node 22, not in a browser: use them only to compare rows with each other. Browser rows were measured in that browser, one at a time, middle of 9 runs on a busy cloud machine.

**Accuracy and speed** (Node 22; a made-up network of 200 items and 587 links, 23 ends, 100 walkers per trial; the exact odds took 0.8 ms; time is the middle of 7 to 15 runs; time is lower-is-better):

| Walkers | time | worst gap to the exact odds (points, lower is better) | exact odds inside the 95% range |
|---|---|---|---|
| 1,000 | 1.0 ms | 1.44 | 22 of 23 ends |
| 10,000 | 1.7 ms | 0.66 | 20 of 23 |
| 100,000 | 16 ms | 0.15 | 22 of 23 |
| 1,000,000 | 164 ms | 0.06 | 22 of 23 |

A 95% range misses about 1 end in 20 by design.

**1,000,000 walkers on the same kind of network, version 2.1.0** (ms, lower is better): Node 22 80, ungoogled Chromium 155 102, Firefox 158 115, WebKitGTK 2.52.6 62, GNOME Web 46.5 53. Version 2.1.0 is 2.4 times faster than 2.0.0 in Node (192 ms); same counts for the same seed.

**Worker threads** (2,000,000 walkers, ms, lower is better; 4-core cloud machine; includes starting the workers and adding up; counts identical to one thread): ungoogled Chromium 155 474 on one thread, 246 on 2 workers, 219 on 4; Firefox 158 589, 346, 207; WebKitGTK 2.52.6 244, 151, 178.

**WebAssembly loop against the plain 2.1.0 file, in a page that had already run the loop a few times** (1,000,000 walkers, ms, lower is better; the freshly opened page figures are in the WebAssembly section above and differ in WebKit): Node 80 to 44, ungoogled Chromium 155 110 to 52, Firefox 158 111 to 52, WebKitGTK 2.52.6 82 to 65, GNOME Web 46.5 50 to 52 (no gain). It is for Chrome-type and Firefox pages with big runs. Runs of one walker per trial do not gain (1.0 to 1.1 times); runs with costs, waits or uncertain weights do not use it.

## How it compares

walker-sim is one package for a job usually done by hand. No ready-made package that does that whole job is named in the research, so the table shows the two things people use instead. Speed against both: not measured.

| Alternative | Size (smaller is better) | Features | Where it wins / loses |
|---|---|---|---|
| [d3-random](https://github.com/d3/d3-random) (ISC, 3.0.1) | not measured (this module: 30,839 bytes minified, 12.1 KB gzipped) | 18 distributions and a seedable generator; no network walking, no exact odds, no ranges | d3-random has 18 distributions (this module has 16). This module wins if you need to walk a network and check the answer. |
| A hand-written loop with `Math.random()` | smallest possible (no library) | not repeatable from a seed; no 95% ranges; no exact odds; cannot split a run across threads with identical counts | Wins on size and simplicity. Loses on repeatability and on knowing whether the answer is right. |

**Where it loses:** bigger than a hand-written loop or a distribution-only library; two distributions fewer than d3-random (16 against 18); the WebAssembly loop gives no gain in GNOME Web 46.5 and needs `wasm-unsafe-eval` (more limits below).

## What it is not

- The exact odds exist only for fixed weights with the `weights` or `uniform` rule and ends that are items with no way on. Otherwise `exactEndpoints` returns `null`.
- Walkers that loop forever are stopped at `stepCap` steps (default 400) and counted as `stuck`. The exact solver follows them all the way, so with long loops the two can differ by design: compare `stuck` and use a large `stepCap`.
- Step counts, end counts and per-trial counts cover every walker. Cost values are kept as a sample (up to 100,000, and 5,000 per end), so cost percentiles and the cost histogram come from a sample.
- Each trial starts its generator from a 32-bit mix of the seed and the trial number, so streams of different trials can overlap: 9 of 10,000 trials, 1,560 of 100,000 and 130,539 of 1,000,000. Over 40 seeds of 400,000 one-walker trials the scatter was 0.2% wider than honest random numbers and the exact odds fell inside the 95% range 94.7% of the time (95% is honest): no matter in practice, but beyond a few million trials vary the seed.
- It is a simulation of independent walkers; they do not block or slow each other.

## For AI agents

- Build the graph once with `graph`, call `exactEndpoints` first: if it returns odds, show the simulation next to them, say how far apart they are, and say so when `converged` is false.
- Always set `seed`. Never report a simulated number without its 95% range. For a big run use `precision`, or share trials between workers (`firstTrial` / `trials`, `export()`, `merge()`).
- Load `walker-sim-menu.js` after `walker-sim.js` only for a settings page that lists the random-number kinds.
- Use `walker-sim-with-wasm.js` (the default). Use `walker-sim.js` alone only when the page must stay small or never runs big simulations (100,000 walkers or more). Results are identical either way.
- Rebuild the minified file with `TERSER=/path/to/terser node modules/walker-sim/test/make-min.js` after any change; it also rebuilds `walker-sim-with-wasm.js` (the two sources one after the other). Browser timings: `tests/wasm-default-bench.js`.

## Prior art and credits

- [d3-random](https://github.com/d3/d3-random) (ISC, 3.0.1) gives random numbers from 18 distributions (normal, log-normal, gamma, beta, Poisson and others) and a seedable generator; it does not walk networks or solve for exact odds. This module carries its own seeded generator and the 16 distributions it needs, with fast methods for normal and exponential numbers (ziggurat). No d3-random code is used.
- The exact odds are the standard absorbing Markov chain answer, solved by arithmetic on the network, not by sampling. Textbook method, no code from others.
- Ziggurat method for normal and exponential numbers: Marsaglia and Tsang, "The Ziggurat Method for Generating Random Variables" (2000), with the exact tail method of Marsaglia (1964). Published algorithm and constants; the code is written here.
- Gamma numbers: Marsaglia and Tsang's gamma method (2000). Published algorithm; code written here.
- The random-number generator is mulberry32, a small generator shared in the public domain by Tommy Ettinger; the source file names it but not its author or license, so this credit comes from the common publication of that code.
- 95% ranges on the end shares use the Wilson score interval (E. B. Wilson, 1927).
- The optional WebAssembly loop is C written for this module (`wasm/walker-sim.c`), built with clang; it repeats the JavaScript loop step for step.
- The simulator was cut from Netflow Map (LFC Foundry's own code).

No other code from others; the ideas above are theirs.

## Full research notes

The long version of this page (the history of versions 1.0.0 and 2.0.0 against 2.1.0, the earlier per-browser timings, and the longer write-ups of the loop solver and the what-if tools) is kept in the project's private knowledge base.
