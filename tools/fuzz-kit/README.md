# fuzz-kit

**Test it:** `node tools/fuzz-kit/test/run.js` (engine, no browser) and `python3 tools/fuzz-kit/test/browser.py` (Playwright for Python with Chromium).

> **Sibling tool:** [`tools/fuzz-play`](../fuzz-play/README.md) is a random-play robot with invariants that overlaps with this. Use `fuzz-play` for a ready-made Playwright robot. Use `fuzz-kit` when you want a seeded, weighted set of operations you write yourself, liveness checks ("from anywhere, ordinary input must lead somewhere") with nudges, `stopAt` to rerun a failing seed to the exact operation, a `before` hook, or the hook stripper that keeps test code out of the shipped file.

## What it is

A small, seeded, reproducible random-input fuzzer for **stateful pages and games**, plus the pattern that makes such a page testable without shipping test code.

- **`src/fuzz-core.js`**: the engine. You give it weighted *operations* (taps, key presses, menu clicks, "load a damaged save"), *invariants* (what must be true after every operation) and an optional *liveness* check (from anywhere, ordinary input must lead somewhere). One seed always gives the same sequence, and every failure carries the tail of operation names that led to it. Also a few input helpers (`Fuzzer.Input`: visible controls, pointer and key events, junk values for damaging saved data).
- **Shrinking**: `run(n, { perOp: true })` also returns a `script` (every operation with a random stream of its own), `run(0, { script })` replays it, and `Fuzzer.shrink(make, script)` cuts it down (delta debugging) to the shortest script that still fails the same way. See the top of `src/fuzz-core.js`; `make()` must return a new fuzzer on a freshly reset app each time. 8 engine checks.
- **`runner/fuzz_playwright.py`** and **`runner/fuzz_puppeteer.mjs`**: command-line runners. Each seed gets a fresh browser context, loads your page, injects the engine and your adapter, and prints one line per seed. A failing seed exits non-zero.
- **`tools/strip-test-hooks.js`**: removes everything between `/*TEST_HOOK_START*/` and `/*TEST_HOOK_END*/` so the page you fuzz (with a `window.__app` test handle) and the page you ship come from one source file.
- **`example/`**: a tiny app (`app.html`) with a planted bug, and the adapter (`adapter.js`) you would write for your own app.

## Why it exists

In the game this came from, a few hundred thousand random operations across two browsers found bugs that careful reading and scripted tests had missed: a Help window that redrew icons with the wrong data, spending that came back after a reload, a win that could be undone by bumping something. Each finding came with a seed and an operation tail, so it could be reproduced in seconds and fixed with a regression test.

## Quick start

1. Give your page a test handle that is stripped from the shipped copy:
   ```js
   /*TEST_HOOK_START*/
   window.__app = { get state() { return state; }, tap: tap, step: function (n) { /* advance the simulation n ticks without waiting */ }, reset: reset };
   /*TEST_HOOK_END*/
   ```
   Make the simulation *steppable by hand* (stop the real-time loop in tests). That is what makes runs exactly reproducible.
2. Write an adapter (copy `example/adapter.js`): `window.__fuzzConfig = function (seed) { return { seed, ops: [...], invariants: [...], liveness: {...} }; }`.
3. Run it:
   ```
   python3 tools/fuzz-kit/runner/fuzz_playwright.py file:///path/to/page.html tools/fuzz-kit/example/adapter.js --seeds 1-20 --ops 400
   ```
   or `node tools/fuzz-kit/runner/fuzz_puppeteer.mjs URL ADAPTER --browser firefox`. Try it on the demo: add `#bug` to the example app's URL and the fuzzer finds the planted bug within a few seeds.

A finding looks like `{"i": 35, "op": "buy", "what": "coins went negative: -9", "tail": ["wait", ..., "buy"]}`. Re-run the same seed to reproduce it; use `run(n, { stopAt: 35 })` to stop in the failing state and inspect it.

## API

`new Fuzzer(cfg).run(nOps, { stopAt })` returns `{ seed, ops, fails: [{ i, op, what, tail }], visited }`.

| `cfg` field | Meaning |
|---|---|
| `seed` | Number. Same seed, same sequence. |
| `ops` | `[{ name, weight (default 1), run(c) }]`. `run` may be async. A throw is a finding. |
| `invariants` | `[function (c, pre) { return '' or a message or an array of messages }]`. Run after every operation. |
| `before` | `function (c, op)`: whatever it returns is passed to the invariants as `pre` (for "must only grow" checks). |
| `liveness` | `{ every: 25, tries: 60, signature(c), nudge(c, k) }`. Every `every` operations, up to `tries` ordinary nudges must change the signature, or it is a finding ("no progress"). |
| `state` | `function (c)`: a label counted per operation (`visited`), so you can see which parts of the app the run reached. |
| `errors` | Default on: also fail on window `error` and `unhandledrejection` events. |
| `every` | `[{ n, run(c) }]`: run something every `n` operations (a render, a save round-trip). A throw is a finding. |
| `afterFail` | `function (c)`: put the app back in a sane place so the run can continue. |
| `tailLength`, `maxFails` | Defaults 40 and 5. |

`c` has `rand()`, `int(n)`, `pick(array)`, `chance(p)`, `seed`, `i`, `op`. Use `c`'s random functions for everything random in your operations, or runs stop being reproducible.

## How it differs from existing open source

- **[gremlins.js](https://github.com/marmelab/gremlins.js)** (marmelab, MIT) is the best-known monkey-testing library for web pages: it unleashes "gremlins" that click, type and scroll at random and reports console errors. It needs no knowledge of your app, which is a real strength; this kit instead asks you to describe operations and invariants for your app, which is more work and catches *logic* bugs (wrong numbers, stuck states) rather than only crashes. Use gremlins.js for a quick smoke test of an ordinary website; use this for a stateful game or tool where "no console error" is far from "correct".
- **Property-based and stateful testing libraries** such as [fast-check](https://github.com/dubzzz/fast-check) (model-based testing with commands) have the same idea with a much more capable shrinker (they also shrink the values inside each command); this kit's `Fuzzer.shrink` only removes whole operations. They are better when your logic runs in Node; this kit's contribution is the browser-page workflow: injecting into a live page, a steppable clock, fresh contexts per seed, and runners for Chromium and Firefox.
- **Playwright and Puppeteer** are the drivers; this kit is a layer above them.

I confirmed that these projects exist, but I did not install or benchmark gremlins.js or fast-check for this comparison. The ideas here (seeded random testing with invariants, test hooks stripped at build time) are well known; the value is a small, readable, tested version that works in single-file pages.

## Limits and gotchas

- **Reproducibility depends on your app.** The same seed repeats only if the app has no hidden randomness or real-time dependence while fuzzing. Stop the real-time loop, seed the app's own random generator from the fuzz seed, and drive time with a `step` function.
- **Only basic shrinking.** A plain finding gives the last 40 operation names; for a minimal sequence record with `perOp: true` and call `Fuzzer.shrink` (it removes whole operations, not values inside them).
- **The adapter is the work.** Good invariants are what find real bugs. Start with: numbers are finite, state is one of the known states, counters never go negative or backwards, a saved-and-reloaded save equals itself, and liveness.
- **Fuzzing runs your page.** Skip controls that download files, open file pickers or navigate away (`Fuzzer.Input.clickables(selector, skip)` has a skip callback).
- Tested in Chromium (Playwright) and Firefox (Puppeteer over WebDriver BiDi); the demo gives identical findings in both.

## For AI agents

- Keep the engine free of app knowledge. App-specific code belongs in an adapter.
- Never use `Math.random()` in operations; always `c.rand()`, `c.int()`, `c.pick()`, `c.chance()`.
- When you add an invariant, first make sure it can fail: break the app on purpose (as `example/app.html#bug` does) and confirm the finding names the rule.
- When a finding appears, reproduce it with the same seed before fixing, then add a fixed scripted check so the bug cannot return.
- The runners inject scripts as strings: end an injected script with `;0`, because Playwright *calls* a string expression that evaluates to a function.
- Run both test files after any change.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Fancy, the Banana](https://github.com/JNFoo/fancy-banana)
