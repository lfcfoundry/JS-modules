# fuzz-kit

**Test it:**
- `node tools/fuzz-kit/test/run.js` runs the engine, the input helpers, the in-page driver and the Puppeteer runner's own logic against fake pages (no browser; 180 checks).
- `python3 tools/fuzz-kit/test/runner_fakes.py` runs the Playwright runner's own logic against a fake page (no browser; 38 checks).
- `python3 tools/fuzz-kit/test/browser.py` runs the real thing in Chromium (Playwright for Python).

This kit also replaces two older tools that were retired from this repository: `fuzz-play` (its real-input, CPU-throttle and "junk text" ideas were merged in; see [What came from where](#what-came-from-where)) and `marionette-lite` (replaced by the [stock Firefox recipe](#stock-firefox-with-preferences-a-ten-line-recipe) below).

## What it is

A small, seeded, reproducible random-input fuzzer for **stateful pages and games**, plus the pattern that makes such a page testable without shipping test code.

- **`src/fuzz-core.js`**: the engine. You give it weighted *operations* (taps, key presses, menu clicks, "load a damaged save"), *invariants* (what must be true after every operation) and an optional *liveness* check (from anywhere, ordinary input must lead somewhere). One seed always gives the same sequence, and every failure carries the tail of operation names that led to it. It also has input helpers (`Fuzzer.Input`), ready-made invariants (`Fuzzer.Invariants`) and a bridge to real mouse and keyboard input (`Fuzzer.Real`). ES5 syntax, UMD (browser global `Fuzzer` plus `module.exports`), no other globals; it needs `Promise` (every browser since 2015).
- **Shrinking**: a failing run is cut down (delta debugging) to the few operations that matter. See [Shrinking](#shrinking-a-failure-to-the-shortest-replay).
- **`runner/fuzz_playwright.py`** and **`runner/fuzz_puppeteer.mjs`**: command-line runners. Each seed gets a fresh browser context, loads your page, injects the engine, `runner/page-driver.js` and your adapter, and prints one line per seed. A failing seed exits non-zero. Options below.
- **`tools/strip-test-hooks.js`** and **`tools/check-shipped.js`**: remove everything between `/*TEST_HOOK_START*/` and `/*TEST_HOOK_END*/` so the page you fuzz (with a `window.__app` test handle) and the page you ship come from one source file, and check afterwards that nothing leaked.
- **`example/`**: a tiny app (`app.html`) with a planted bug, the adapter (`adapter.js`) you would write for your own app, and `generic-adapter.js`, an adapter with no game code at all (random clicks, taps, keys and the junk-text rule) for a first look at any click page.

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
2. Write an adapter (copy `example/adapter.js`): `window.__fuzzConfig = function (seed) { return { seed, ops: [...], invariants: [...], liveness: {...} }; }`. It must also **reset the app**, because `--shrink` calls it again for every try.
3. Run it:
   ```
   python3 tools/fuzz-kit/runner/fuzz_playwright.py file:///path/to/page.html tools/fuzz-kit/example/adapter.js --seeds 1-20 --ops 400 --shrink
   ```
   or `node tools/fuzz-kit/runner/fuzz_puppeteer.mjs URL ADAPTER --browser firefox`. Try it on the demo: add `#bug` to the example app's URL and the fuzzer finds the planted bug within a few seeds, and `--shrink` cuts it to three operations.

A finding looks like `{"i": 35, "op": "buy", "what": "coins went negative: -9", "tail": ["wait", ..., "buy"]}`. Re-run the same seed to reproduce it; use `run(n, { stopAt: 35 })` to stop in the failing state and inspect it.

## Runner options

Both runners take the same options and print the same lines.

| Option | What it does |
|---|---|
| `--seeds 1-20`, `--ops 400`, `--viewport 412x892` | Which seeds, how many operations each, the page size. |
| `--browser` | Playwright: `chromium` (default), `firefox` (Playwright's own patched Firefox), `webkit`. Puppeteer: `chrome` (default) or `firefox` (stock Firefox over WebDriver BiDi). |
| `--shrink` (`--shrink-tries 200`, `--shrink-secs 30`) | When a seed fails, replay it and cut it down. Prints the short operation list and the script to paste into `run(0, { script })`. Stops at the try cap or the time cap and says so. If the failure does not repeat on replay, it says so plainly and does not shrink. |
| `--seed-secs 120` | Hang guard. A seed with no answer after this long is reported as **hung** and its browser context is closed (killed). A page stuck in an endless loop cannot be asked what it was doing; add `--hang-trace` (every operation name is sent to the runner, which is slower) and the report names the last operation. |
| `--bundle DIR` | For each failing seed, save `seed-N.png` (screenshot), `seed-N-storage.json` (localStorage, sessionStorage, cookie text) and `seed-N-findings.json` (findings, shrink result). A hung or dead page cannot be read, so then only the findings (and maybe a screenshot) are saved, with a note saying what is missing. IndexedDB is not dumped. |
| `--ignore-console REGEX` (repeat), `--allow-console-errors` | A `console.error` fails a seed by default. Let a deliberate message pass with a pattern, or let all pass. |
| `--junk-text`, `--junk-skip "Infinity War,foo"` | Also check that no `NaN`, `undefined` or `[object ...]` shows in the visible text. The skip list holds phrases that are fine. |
| `--real-input` | Let `Fuzzer.Real.ops()` do real mouse moves, clicks and key presses through the driver (trusted events with real pointer ids). Without it those operations are not there. |
| `--throttle 4` | CPU slowdown (slow-phone behavior). **Chromium / Chrome only** (a Chrome DevTools command). Refused for Firefox. |
| `--mobile` | Phone-style page: touch on and the mobile viewport flag (Chromium and WebKit in Playwright; Chrome in Puppeteer). |
| `--init "JS"` | JavaScript that runs before the page's own scripts, for example to start from a saved game: `--init "localStorage.setItem('save','{...}')"`. |
| `--allow-navigation` | A single-page app that changes its path is not "leaving the page". |

**A dead page never reads as green.** If the page crashes, is closed, opens a new tab or window, or moves off the start page (anything except a `#fragment` change), the seed fails with a `page-guard` finding, even if the run itself returned normally. The Puppeteer runner also dismisses `alert`/`confirm` boxes so they cannot freeze a page for ever.

The Puppeteer runner finds the browser through `--executable`, else the `FIREFOX` variable (only for `--browser firefox`) or the `CHROME` variable (only for `--browser chrome`).

## API

`new Fuzzer(cfg).run(nOps, runOpts)` returns a promise of `{ seed, ops, fails: [{ i, op, what, tail }], visited }` (plus `script` when recording).

| `cfg` field | Meaning |
|---|---|
| `seed` | A number (same seed, same sequence; only the integer part counts, wrapped to 32 bits) or a string (hashed, so `'a'` and `'b'` are different runs). |
| `ops` | `[{ name, weight (default 1), run(c) }]`. `run` may be async. A throw is a finding. Weights must be numbers 0 or more, and at least one above 0, or `new Fuzzer` throws a plain error (all-zero weights used to silently run only the first operation). |
| `invariants` | `[function (c, pre) { return '' or a message or an array of messages }]`. Run after every operation. |
| `before` | `function (c, op)`: whatever it returns is passed to the invariants as `pre` (for "must only grow" checks). If it throws, that is a finding and the operation still runs. |
| `liveness` | `{ every: 25, tries: 60, signature(c), nudge(c, k) }`. Every `every` operations, up to `tries` ordinary nudges must change the signature, or it is a finding ("no progress"). |
| `state` | `function (c)`: a label counted per operation (`visited`), so you can see which parts of the app the run reached. If it throws, that is a finding. |
| `errors` | Default on: also fail on window `error` and `unhandledrejection` events. |
| `every` | `[{ name, n, run(c) }]`: run something every `n` operations (a render, a save round-trip). `run` may be async and **is awaited**; a throw or a rejection is a finding named `name` (default `periodic`). |
| `afterFail` | `function (c)`: put the app back in a sane place so the run can continue. If it throws, that is reported as a finding with the operation name `afterFail`. |
| `tailLength`, `maxFails` | Defaults 40 and 5. The run stops at `maxFails` findings. |

Run options: `stopAt: k` (stop after operation k), `record: true` (also return a replayable `script`), `script` (replay one), `perOp: true` (see below), `firstOnly: true`, `onOp(c)` (called before every operation).

`c` has `rand()`, `int(n)`, `pick(array)`, `chance(p)`, `seed`, `i`, `op`. Use `c`'s random functions for everything random in your operations, or runs stop being reproducible.

If something unexpected goes wrong inside the engine, `run()` still returns the findings collected so far, plus one with the operation name `engine`.

## Shrinking a failure to the shortest replay

```js
var make = function () { app.reset(); return new Fuzzer(cfgFor(seed)); };      // a NEW fuzzer on a freshly reset app, every time
var r = await make().run(600, { record: true });                                 // the normal game for this seed, plus a script
if (r.fails.length) {
  var s = await Fuzzer.shrink(make, r.script, { maxTries: 400, maxMs: 20000 });
  console.log(s.script.map(function (e) { return e.op; }));                      // s = { script, finding, tries, from, stopped? }
}
```

- **`record: true` plays exactly the game a plain run of that seed plays** and also returns the `script` (each operation plus the point in the random stream it started from). Replaying with `run(0, { script })` gives every operation the same random numbers, so a failure found by an ordinary seed goes straight to the shrinker. This is what the runners' `--shrink` uses.
- **`perOp: true` is a different game.** It gives every operation a random stream of its own, so the same seed picks different numbers inside the operations and a failure of the plain run may not appear. It is kept for compatibility; prefer `record`. (When operations draw no random numbers, the two runs happen to match.)
- **How it searches:** delta debugging with the "complements" only (it tries the script with one slice removed, at finer and finer slices). The original algorithm (ddmin) also tries each slice on its own; pass `pieces: true` to do that too, which can need fewer tries when the failure sits in one stretch. Both end with a script from which no single operation can be removed ("1-minimal"); the plain mode is the default so results do not change.
- **What "the same failure" means:** the same operation name and the same message with the digits blanked (`-9` and `-4` count as equal), the **whole** message (an older version compared only the first 80 characters, which could slide onto a different bug whose message starts the same). `matchChars: 80` brings the old cutoff back; `match: function (finding) { return key; }` lets you decide. Messages the engine writes itself are cut earlier: a thrown error to 400 characters, an invariant error to 200.
- **Caps:** `maxTries` (default 400) and `maxMs` (default none). When one stops the search, the result has `stopped: 'tries'` or `'time'` and is shorter but not guaranteed minimal. Each try costs a full replay.
- **If the script does not fail when replayed** (the app does not reset fully, or depends on time), the result says `note: 'the script does not fail when replayed'` and changes nothing.

## Input helpers

`Fuzzer.Input` only builds and dispatches events; it knows nothing about your app.

- `key(k, down, repeat, extra)`: a keydown or keyup for `k` (`'a'`, `'Enter'`, `'ArrowLeft'`, `'Space'`). Sets `key`, `code`, `keyCode` and `which` like a US keyboard, goes to the **focused element** (`document.activeElement`, else the body) and bubbles up to `document` and `window`. `extra` can override `code`, `keyCode`, `target` and the modifier flags.
- `pointer(target, type, x, y, kind, opts)`: a synthetic pointer event in client pixels. A real browser throws `NotFoundError` when a page calls `setPointerCapture(e.pointerId)` with an id no real pointer has, and the fuzzer would report that as a false finding. By default this helper swallows exactly that error for the pointer ids it made up (not other errors, not other ids); `opts.pointerId` changes the id (default 1), `opts.captureGuard: false` turns the guard off, and `Fuzzer.Input.unguardCapture()` puts the browser's own method back. The guard patches `Element.prototype.setPointerCapture` and `releasePointerCapture` in the page under test; for fully real pointers use `--real-input`.
- `visible(el, opts)`: could a person use it now? Not disabled, not hidden (`display`, the `hidden` attribute, `visibility`), not zero-size, and not covered by another element at its center. Something scrolled out of view counts as visible. `{ covering: false }` skips the covering test.
- `clickables(selector, skip, opts)`: visible controls. The default list is buttons, checkboxes, radios, selects and ranges. **Links are not included** (clicking one can leave the page or open a tab); ask for them with `{ links: true }` or by putting `a[href]` in your own selector. `skip(el)` excludes more (file pickers, downloads).
- `canvasPoint(canvas, lx, ly, logicalW, logicalH)` and `junk(c)` (values to damage saved data with) are unchanged.

`Fuzzer.Invariants.noJunkText({ skip, words, root })` returns an invariant that fails when the visible text (`innerText` of the body) shows `NaN`, `undefined` or `[object ...]` as whole words. `skip` is a list of phrases or regular expressions removed first (the words "Infinity War" would trip a check for `Infinity`, which is why `Infinity` is not on the default list; add it with `words: ['Infinity']`).

`Fuzzer.Real` is the bridge to real input. `Fuzzer.Real.ops()` returns three operations (`real-click`, `real-move`, `real-key`) when the runner was started with `--real-input`, and an empty list otherwise, so an adapter can always write `ops: myOps.concat(Fuzzer.Real.ops())`. The page asks, the runner acts with the driver's own mouse and keyboard, and the page goes on; requests are checked (numbers inside the window, plain key names only).

## Stock Firefox with preferences: a ten-line recipe

This replaces the retired `marionette-lite`. It starts the **stock** Firefox (not Playwright's patched build) through Puppeteer over WebDriver BiDi and sets any preference, such as the device pixel ratio and dark mode:

```js
// npm i puppeteer     and either   npx puppeteer browsers install firefox   or pass executablePath: '/path/to/firefox'
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({
  browser: 'firefox', headless: true,
  extraPrefsFirefox: { 'layout.css.devPixelsPerPx': '2', 'ui.systemUsesDarkTheme': 1 },   // device pixel ratio 2, prefers-color-scheme: dark
});
const page = await browser.newPage(); await page.setViewport({ width: 412, height: 800 });
await page.goto('file:///tmp/game.html');
console.log(await page.evaluate(() => [innerWidth, devicePixelRatio, matchMedia('(prefers-color-scheme: dark)').matches]));
await page.screenshot({ path: '/tmp/page.png' }); await browser.close();
```
Any other preference works the same way (for example `'privacy.resistFingerprinting': true` to test strict privacy mode).

**Gaps:** WebDriver BiDi has no phone emulation (no touch or mobile viewport flags) and no CPU throttling, so `--mobile` and `--throttle` are not available in Firefox. Mozilla's own `marionette_driver` Python package is marked unsupported on PyPI, so it is not a way forward either. This recipe was not run when it was written (no browser was started for this change); try it once and fix the line that disagrees with your Puppeteer version.

## Keeping test code out of the shipped file

`tools/strip-test-hooks.js` deletes everything between `/*TEST_HOOK_START*/` and `/*TEST_HOOK_END*/` and refuses unbalanced or nested markers.

**Order matters.** Run it on the source **before** any minifier. A minifier removes ordinary comments, so if it runs first, the markers are already gone, the stripper finds nothing to remove, and the test handle (`window.__app`) ships in your game. The stripper's command line prints a warning when it finds no markers, but do not rely on that: add an after-build check.

```
node tools/fuzz-kit/tools/strip-test-hooks.js src/game.html build/game.html     # 1. strip first
npx html-minifier-terser ... build/game.html -o dist/game.html                  # 2. then minify
node tools/fuzz-kit/tools/check-shipped.js dist/game.html                       # 3. fails (exit 1) if __app or a marker is still in the file you ship
```
`check-shipped.js` looks for `__app`, `TEST_HOOK_START` and `TEST_HOOK_END`; add your own handle names with `--word NAME`. It reads plain text, so a name built from pieces at run time is not seen.

## What came from where

- **`fuzz-play`** (retired) was a Playwright robot that played a page at random for N seconds. Merged here: `--throttle`, real `page.mouse` / `page.keyboard` moves as optional operations (`--real-input`), the `NaN` / `undefined` / `[object` visible-text check (`Fuzzer.Invariants.noJunkText`, `--junk-text`), `--init`, `--mobile`, the crash / closed-page / navigated-away guard, and its zero-config click-and-key behavior (`example/generic-adapter.js`). Not carried over: its wall-clock run length (runs here are counted in operations, which is what makes a seed repeat), the "stuck for N seconds" check (liveness covers it, with nudges), and `inpage.js` (the engine already runs inside the page, seeded).
- **`marionette-lite`** (retired) drove Firefox through its Marionette port from Python. Replaced by the recipe above. Its safety problems (it deleted a folder you passed in, it could spin for ever when Firefox died) go away with it.

## How it differs from existing open source

- **[gremlins.js](https://github.com/marmelab/gremlins.js)** (marmelab, MIT) is the best-known monkey-testing library for web pages: it unleashes "gremlins" that click, type and scroll at random and reports console errors. It needs no knowledge of your app, which is a real strength; this kit instead asks you to describe operations and invariants for your app, which is more work and catches *logic* bugs (wrong numbers, stuck states) rather than only crashes. Use gremlins.js (or `example/generic-adapter.js`) for a quick smoke test of an ordinary website; use this for a stateful game or tool where "no console error" is far from "correct".
- **Property-based and stateful testing libraries** such as [fast-check](https://github.com/dubzzz/fast-check) (model-based testing with commands) have the same idea with a much more capable shrinker (they also shrink the values inside each command); this kit's `Fuzzer.shrink` only removes whole operations. They are better when your logic runs in Node; this kit's contribution is the browser-page workflow: injecting into a live page, a steppable clock, fresh contexts per seed, and runners for Chromium and Firefox.
- **Playwright and Puppeteer** are the drivers; this kit is a layer above them.

I confirmed that these projects exist, but I did not install or benchmark gremlins.js or fast-check for this comparison. The ideas here (seeded random testing with invariants, test hooks stripped at build time, delta debugging from Zeller and Hildebrandt) are well known; the value is a small, readable, tested version that works in single-file pages.

## Limits and gotchas

- **Reproducibility depends on your app.** The same seed repeats only if the app has no hidden randomness or real-time dependence while fuzzing. Stop the real-time loop, seed the app's own random generator from the fuzz seed, and drive time with a `step` function. `example/generic-adapter.js` waits in real time, so it repeats the moves but not the exact game.
- **Only whole operations are shrunk,** not the values inside them. Each shrink try calls your adapter's `__fuzzConfig(seed)` again in the same page, so that function must reset the app; timers or saved data left over from an earlier try are not cleaned up for you.
- **The adapter is the work.** Good invariants are what find real bugs. Start with: numbers are finite, state is one of the known states, counters never go negative or backwards, a saved-and-reloaded save equals itself, and liveness.
- **Fuzzing runs your page.** Skip controls that download files, open file pickers or navigate away (`Fuzzer.Input.clickables(selector, skip)` has a skip callback; links are left out by default).
- **Browser status, plainly.**
  - The engine, the input helpers, the driver and the Puppeteer runner's logic are checked in Node against fakes. The Playwright runner's logic is checked against a fake page in Python. `test/browser.py` runs the example app in Chromium through Playwright for Python.
  - **The Puppeteer runner and Firefox are manual runs.** No automatic test starts Puppeteer or Firefox. Earlier notes say the demo gave the same findings in Chromium and in Firefox through Puppeteer; that was a hand run, not a test you can repeat with one command.
  - The runner features added on 2026-10-15 (`--shrink`, the hang guard, `--bundle`, `--real-input`, `--throttle`, `--init`, `--mobile` and the dead-page guard) were checked against fake pages only when they were written. The extra checks in `test/browser.py` for `--shrink`, `--bundle` and `--junk-text` were written but not run at that time. The real-input path in a real browser, the hang guard on a really frozen page and the touch/mobile flags are the least certain parts; run `test/browser.py` and a hand run in Firefox before trusting them.
  - Playwright drives its own patched Firefox, not stock Firefox; stock Firefox goes through Puppeteer over WebDriver BiDi. Nothing here has been run on a phone.
- **`--throttle` is Chromium only.** `--mobile` is not available in Firefox through Puppeteer.

## For AI agents

- Keep the engine free of app knowledge. App-specific code belongs in an adapter.
- Never use `Math.random()` in operations; always `c.rand()`, `c.int()`, `c.pick()`, `c.chance()`.
- When you add an invariant, first make sure it can fail: break the app on purpose (as `example/app.html#bug` does) and confirm the finding names the rule.
- When a finding appears, reproduce it with the same seed before fixing, then add a fixed scripted check so the bug cannot return. `--shrink` gives the shortest replay.
- Library files (`src/fuzz-core.js`, `runner/page-driver.js`, `tools/*.js`) stay ES5 with the UMD wrapper; `test/run.js` checks this. The one runtime need beyond ES5 syntax is `Promise`.
- The runners inject scripts as strings: end an injected script with `;0`, because Playwright *calls* a string expression that evaluates to a function. In Puppeteer pass a real function to `page.evaluate`, not a string that holds a function.
- Run all three test files after any change.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Fancy, the Banana](https://github.com/JNFoo/fancy-banana)
