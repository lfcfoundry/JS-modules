# fuzz-kit

**Version 1.3.1 · API 1**

**Tested in:** runner fakes pass; Chromium 155 example app 14 checks incl. strict-policy page; fuzz-kit core 214 pass

A small, seeded, reproducible random-input fuzzer for **stateful pages and games**, plus the pattern that makes such a page testable without shipping test code. No dependencies; the engine needs only `Promise`.

You give it weighted *operations* (taps, key presses, menu clicks, "load a damaged save"), *invariants* (what must be true after every operation) and an optional *liveness* check (from anywhere, ordinary input must lead somewhere). A seeded random generator picks the operations, so one seed always gives the same sequence. After every operation your rules are checked; a failure carries the tail of operation names that led to it, and the run can be cut down (delta debugging) to the few operations that matter.

- `src/fuzz-core.js`: the engine (ES5, UMD: browser global `Fuzzer` plus `module.exports`), with input helpers (`Fuzzer.Input`), ready-made invariants (`Fuzzer.Invariants`) and a bridge to real mouse and keyboard (`Fuzzer.Real`).
- `runner/fuzz_playwright.py` and `runner/fuzz_puppeteer.mjs`: command-line runners, a fresh browser context per seed; a failing seed exits non-zero.
- `tools/strip-test-hooks.js` and `tools/check-shipped.js`: remove the test handle from the page you ship and check nothing leaked.
- `example/`: a tiny app (`app.html`) with a planted bug, the adapter you would write (`adapter.js`) and `generic-adapter.js` (random clicks, taps, keys and the junk-text rule, no game code) for a first look at any click page.

## Why it exists

In the game this came from, a few hundred thousand random operations across two browsers found bugs that careful reading and scripted tests had missed: a Help window that redrew icons with the wrong data, spending that came back after a reload, a win that could be undone by bumping something. Each finding came with a seed and an operation tail, so it could be reproduced in seconds and fixed with a regression test.

## Use

1. Give the page a test handle that is stripped from the shipped copy, and make the simulation steppable by hand (stop the real-time loop in tests; that is what makes runs repeat exactly):
   ```js
   /*TEST_HOOK_START*/
   window.__app = { get state() { return state; }, tap: tap, step: function (n) { /* advance n ticks */ }, reset: reset };
   /*TEST_HOOK_END*/
   ```
2. Write an adapter (copy `example/adapter.js`): `window.__fuzzConfig = function (seed) { return { seed, ops: [...], invariants: [...], liveness: {...} }; }`. It must also reset the app, because `--shrink` calls it again for every try.
3. Run it:
   ```
   python3 tools/fuzz-kit/runner/fuzz_playwright.py file:///path/to/page.html tools/fuzz-kit/example/adapter.js --seeds 1-20 --ops 400 --shrink
   node tools/fuzz-kit/runner/fuzz_puppeteer.mjs URL ADAPTER --browser firefox
   ```

Try it on the demo: add `#bug` to the example app's URL and the fuzzer finds the planted bug within a few seeds; `--shrink` cuts it to three operations. A finding looks like `{"i": 35, "op": "buy", "what": "coins went negative: -9", "tail": ["wait", ..., "buy"]}`; re-run the same seed to reproduce it, or `run(n, { stopAt: 35 })` to stop in the failing state.

Tests: `node tools/fuzz-kit/test/run.js` (engine, input helpers, in-page driver and the Puppeteer runner's logic against fake pages, 201 checks), `python3 tools/fuzz-kit/test/runner_fakes.py` (Playwright runner's logic against a fake page, 38 checks) and `python3 tools/fuzz-kit/test/browser.py` (the example app in Chromium through Playwright for Python, 16 checks). Run all three after any change.

## API

`new Fuzzer(cfg).run(nOps, runOpts)` returns a promise of `{ seed, ops, fails: [{ i, op, what, tail }], visited, hash }` (plus `script` when recording). `hash` is a fingerprint of the operation names and your `state` labels; the same seed must give the same hash.

| `cfg` field | Meaning |
|---|---|
| `seed` | A number (integer part only, wrapped to 32 bits) or a string (hashed). Same seed, same sequence. |
| `ops` | `[{ name, weight (default 1), run(c) }]`; `run` may be async; a throw is a finding. Weights are numbers 0 or more, at least one above 0, or `new Fuzzer` throws. |
| `invariants` | `[function (c, pre) { return '' or a message or an array of messages }]`, run after every operation. |
| `before` | `function (c, op)`; its result is passed to invariants as `pre` (for "must only grow" checks). |
| `liveness` | `{ every: 25, tries: 60, signature(c), nudge(c, k) }`: every `every` operations, up to `tries` ordinary nudges must change the signature, or it is a finding ("no progress"). |
| `state` | `function (c)` returning a label counted per operation (`visited`). |
| `errors` | Default on: also fail on window `error` and `unhandledrejection`. |
| `every` | `[{ name, n, run(c) }]`: run something (awaited) every `n` operations, such as a render or a save round-trip. |
| `afterFail` | `function (c)`: put the app back in a sane place so the run can go on. |
| `tailLength`, `maxFails` | Defaults 40 and 5. The run stops at `maxFails` findings. |
| `swarm` | `true` (0.5) or a number 0 to 1: the chance each operation is left out of that seed's run (at least one stays on). Finds bugs that need "buy without sell"; use it on some seeds only. |
| `final` | `function (c)`: runs once after a run that played to its end, for end-state rules such as "save and reload gives the same state". |

A throw in `before`, `state`, `every`, `afterFail` or `final` is a finding.

Run options: `stopAt: k`, `record: true` (also return a replayable `script`), `script` (replay one), `perOp: true`, `firstOnly: true`, `onOp(c)`. `c` has `rand()`, `int(n)`, `pick(array)`, `chance(p)`, `seed`, `i`, `op`. Use these for everything random, or runs stop repeating. If the engine itself fails, `run()` returns the findings so far plus one named `engine`.

**Shrinking.** Build a new fuzzer on a freshly reset app every time:

```js
var make = function () { app.reset(); return new Fuzzer(cfgFor(seed)); };
var r = await make().run(600, { record: true });
if (r.fails.length) var s = await Fuzzer.shrink(make, r.script, { maxTries: 400, maxMs: 20000 });   // { script, finding, tries, from, stopped? }
```

`record: true` plays exactly the game a plain run plays, so an ordinary failing seed goes straight to the shrinker (prefer it to `perOp: true`, which gives each operation its own random stream). The shrinker removes slices of the script at finer sizes and ends 1-minimal; `pieces: true` also tries each slice alone. "The same failure" means the same operation name and whole message with digits blanked (`matchChars: 80` and `match(finding)` change that). `maxTries` (default 400) and `maxMs` stop the search with `stopped: 'tries'` or `'time'`. A script that does not fail on replay gets `note: 'the script does not fail when replayed'`.

**Input helpers** (`Fuzzer.Input`, no app knowledge): `key(k, down, repeat, extra)` (a US-keyboard keydown or keyup to the focused element), `pointer(target, type, x, y, kind, opts)` (a synthetic pointer event; it swallows only the `NotFoundError` from `setPointerCapture` for made-up pointer ids, see `opts.pointerId`, `opts.captureGuard`), `visible(el, opts)` (could a person use it now), `clickables(selector, skip, opts)` (visible controls; links only with `{ links: true }`), `pickVisible(c, selector, skip, opts)` (one random visible control, about 12 times cheaper on a busy page), `canvasPoint(...)` and `junk(c)` (values to damage saved data with). `Fuzzer.Invariants.noJunkText({ skip, words, root })` fails when visible text shows `NaN`, `undefined` or `[object ...]` as whole words. `Fuzzer.Real.ops()` returns `real-click`, `real-move` and `real-key` under `--real-input` and an empty list otherwise, so `ops: myOps.concat(Fuzzer.Real.ops())` is always safe.

## Hunting in the background

`node runner/background.js start URL ADAPTER.js [--browsers chrome,firefox] [--seeds 1-200] [--batch 10] [--ops 400] [--out DIR]` starts a hunt and returns at once. It runs the Puppeteer runner over the seeds, one browser at a time, at the lowest priority so other work is not slowed, with `--shrink` and `--bundle` on. The folder holds `run.log`, `state.json`, `findings.md` (rewritten after every batch), `bundles/` and `DONE` (written last, saying how it ended). `status DIR` prints progress in plain words; `stop DIR` ends it after a few seconds and keeps what was found. Browsers: `chrome`, `firefox`, `webkitgtk` and `epiphany` (GNOME Web); set `CHROME` / `FIREFOX` / `EPIPHANY` or pass `--chrome` / `--firefox` / `--epiphany`. The two WebKit browsers are driven through `tools/webkit-driver` (`runner/webkit_browser.js` gives it the few Puppeteer calls the runner needs), so they need `WebKitWebDriver` on the PATH, plus `xvfb-run` and `dbus-run-session` when there is no display. What differs there: no CPU throttling, no popup, crash or navigation events (so the `page-guard` checks for those do not run), `--init` runs right after the page loads instead of before its scripts, `--hang-trace` names nothing, and the one browser window is reused between seeds after clearing the page and its saved data (a page that hangs ends that window and the next seed gets a new one). The runner finds Puppeteer or puppeteer-core in `NODE_PATH` too, and prints the real browser version on its first line.

## Runner options

Both runners take the same options and print one line per seed. A dead page never reads as green: a crash, a closed page, a new tab or window, or a move off the start page (except a `#fragment` change) fails the seed with a `page-guard` finding. The Puppeteer runner dismisses `alert` and `confirm` boxes so they cannot freeze a page.

| Option | What it does |
|---|---|
| `--seeds 1-20`, `--ops 400`, `--viewport 412x892` | Seeds (`1-5,9,20-22`), operations per seed, page size. |
| `--browser` | Playwright: `chromium` (default), `firefox` (Playwright's own patched build), `webkit`. Puppeteer: `chrome` (default), `firefox` (stock, over WebDriver BiDi), `webkitgtk` or `epiphany` (GNOME Web) through `tools/webkit-driver` (`--webkit-driver PATH` or `WEBKIT_DRIVER` if it is not beside this folder). |
| `--executable PATH` | The browser to start. Puppeteer also reads `FIREFOX` (only with `--browser firefox`) or `CHROME` (only with `--browser chrome`). |
| `--shrink` (`--shrink-tries 200`, `--shrink-secs 30`) | Replay a failing seed and cut it down; prints the short list and the script for `run(0, { script })`. Says so if the failure does not repeat. |
| `--seed-secs 120`, `--hang-trace` | Hang guard: a seed with no answer is reported as hung and its context is closed. `--hang-trace` (slower) names the last operation. |
| `--bundle DIR` | For each failing seed save `seed-N.png`, `seed-N-storage.json` (localStorage, sessionStorage, cookie text) and `seed-N-findings.json`. A hung or dead page keeps only the findings. IndexedDB is not dumped. |
| `--ignore-console REGEX` (repeat), `--allow-console-errors` | A `console.error` fails a seed by default; let some or all pass. |
| `--junk-text`, `--junk-skip "a,b"` | Also fail on junk text (`NaN`, `undefined`, `[object ...]`); the skip list holds phrases that are fine. |
| `--real-input`, `--throttle 4` | Real mouse moves, clicks and key presses through the driver (trusted events). CPU slowdown (Chromium / Chrome only; refused for Firefox). |
| `--mobile` | Touch on and the mobile viewport flag (Chromium and WebKit in Playwright; Chrome in Puppeteer; not Firefox through Puppeteer). |
| `--init "JS"`, `--allow-navigation` | JavaScript that runs before the page's own scripts (e.g. a saved game); a single-page app that changes its path is not "leaving the page". |
| `--jobs N` | Run seeds in N browsers at once (about 350 MB each). Helps when one seed takes more than about a second. |
| `--swarm 0.3`, `--check-repeat`, `--replay FILE` | Swarm testing on even seeds. Play seed 1 twice in one page and once in a fresh page and say plainly whether the app repeats exactly, or where it does not. Replay a `seed-N-findings.json` or a JSON list of steps on its seed. |

## Keeping test code out of the shipped file

`tools/strip-test-hooks.js` deletes everything between `/*TEST_HOOK_START*/` and `/*TEST_HOOK_END*/` and refuses unbalanced or nested markers. Run it before any minifier, because a minifier removes the comment markers and the test handle would ship.

Order: `node tools/fuzz-kit/tools/strip-test-hooks.js src/game.html build/game.html`, then your minifier, then `node tools/fuzz-kit/tools/check-shipped.js dist/game.html` (exit 1 if a marker is still there).

`check-shipped.js` looks for `__app` and the two markers (add names with `--word NAME`); a name built from pieces at run time is not seen.

**Stock Firefox with preferences:** start stock Firefox through Puppeteer over WebDriver BiDi (`puppeteer.launch({ browser: 'firefox', extraPrefsFirefox: { 'layout.css.devPixelsPerPx': '2', 'ui.systemUsesDarkTheme': 1 } })`) to set any preference, such as device pixel ratio or dark mode. WebDriver BiDi has no phone emulation and no CPU throttling, so `--mobile` and `--throttle` are not available in Firefox. This recipe was not run when it was written; try it once and fix the line that disagrees with your Puppeteer version.

## How it differs from existing open source

- **[gremlins.js](https://github.com/marmelab/gremlins.js)** (marmelab, MIT): the best-known monkey-testing library for web pages. It clicks, types and scrolls at random and reports console errors, and needs no knowledge of your app. This kit asks you to describe operations and invariants, which is more work and catches logic bugs (wrong numbers, stuck states), not only crashes. Use gremlins.js (or `example/generic-adapter.js`) for a quick smoke test of an ordinary site; use this for a stateful game or tool.
- **[fast-check](https://github.com/dubzzz/fast-check)** and other property-based and stateful testing libraries have the same idea with a much more capable shrinker (they also shrink the values inside each command); `Fuzzer.shrink` removes whole operations only. They are better when your logic runs in Node; this kit adds the browser-page workflow: injecting into a live page, a steppable clock, a fresh context per seed, runners for Chromium and Firefox.
- **Playwright and Puppeteer** are the drivers; this kit is a layer above them.

gremlins.js and fast-check were not installed or benchmarked for this comparison (no numbers).

## What it is not

- **Reproducibility depends on your app.** The same seed repeats only if the app has no hidden randomness or real-time dependence: stop the real-time loop, seed the app's own random generator from the fuzz seed, drive time with a `step` function. `example/generic-adapter.js` waits in real time, so it repeats the moves but not the exact game.
- **Only whole operations are shrunk,** not the values inside them. Each try calls `__fuzzConfig(seed)` again in the same page, so it must reset the app.
- **The adapter is the work.** Start with invariants like: numbers are finite, state is a known state, counters never go negative or backwards, save-and-reload equals itself, and liveness.
- **Fuzzing runs your page.** Skip controls that download files, open file pickers or navigate away (links are left out by default).
- **Browser status.** Real runs by hand on 2026-10-17: stock Firefox 157.0.1 (over WebDriver BiDi), Chromium 153 (not ungoogled) and Chromium 141 gave the same results for the clean demo (seeds 1 to 5) and found and shrunk the planted bug to the same three steps (seeds 1 to 3: 222, 93 and 322 operations down to 3); the same seed gave the same game in all three. The Puppeteer runner has no automatic test that starts a real browser. Still unchecked: WebKit, Firefox 158 and ungoogled Chromium 155 (the project's test browsers), a phone, and touch with `--mobile` in Firefox. Playwright drives its own patched Firefox, not stock Firefox.

## For AI agents

- Keep the engine free of app knowledge; app code belongs in an adapter.
- Never use `Math.random()` in operations; use `c.rand()`, `c.int()`, `c.pick()`, `c.chance()`.
- Before trusting a new invariant, break the app on purpose (as `example/app.html#bug` does) and confirm the finding names the rule.
- When a finding appears, reproduce it with the same seed before fixing, then add a fixed scripted check. `--shrink` gives the shortest replay.
- Library files (`src/fuzz-core.js`, `runner/page-driver.js`, `tools/*.js`) stay ES5 with the UMD wrapper; `test/run.js` checks this.
- The runners inject scripts as strings: end an injected script with `;0` (Playwright calls a string that evaluates to a function). In Puppeteer pass a real function to `page.evaluate`.

## Prior art and credits

- The seeded random generator in `src/fuzz-core.js` is the small public algorithm mulberry32; the text hash that turns a string seed into a number (and builds the run fingerprint) is FNV-1a. Both are named in the source, which credits no outside code for them.
- Shrinking is delta debugging (and, for `pieces: true`, the original ddmin), from Zeller and Hildebrandt; the implementation is written for this repository.
- gremlins.js, fast-check, Playwright and Puppeteer are named for comparison or as drivers. No code from gremlins.js or fast-check is in this kit. Playwright and Puppeteer are not bundled; the runners call them if you install them.
- `fuzz-play` and `marionette-lite` are earlier tools from this repository, now retired. From `fuzz-play` this kit kept `--throttle`, real mouse and keyboard operations (`--real-input`), the junk-text check (`noJunkText`, `--junk-text`), `--init`, `--mobile`, the crash and navigated-away guard, and the zero-config click-and-key behavior (`example/generic-adapter.js`); its wall-clock run length and "stuck for N seconds" check were not carried over (liveness covers it). `marionette-lite` is replaced by the stock Firefox recipe above.
- The headers of `src/fuzz-core.js`, `runner/fuzz_playwright.py`, `runner/fuzz_puppeteer.mjs`, `tools/strip-test-hooks.js` and `tools/check-shipped.js` name no other source, so apart from the public algorithms above this kit is written for this repository.

## Full research notes

The long version of this page (every runner option with its history, the full shrinking rules, the `--jobs` timings, the detailed browser-by-browser run notes and the two bugs found in those runs, and how the retired tools were folded in) is kept in the project's private knowledge base.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
