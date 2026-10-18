# frame-kit

**Version 1.2.1 · API 1**

**Tested in:** ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, one at a time (tests/frame-kit-browser.js: the module's 67 checks inside each page plus about 1.5 s of real animation frames, 67 of 67 in all four, the badge read 60 FPS in Chromium and Firefox and 62 FPS in WebKitGTK and GNOME Web; 3 to 8 s each including start-up; Node 67 checks)

Four tiny, independent helpers for browser games and other `requestAnimationFrame` loops. **Each is one file with no dependencies; use any one without the others.** You call each from your frame loop; none touches the DOM, timers or `requestAnimationFrame` itself. Time is in milliseconds.

| Helper | File | One line |
| --- | --- | --- |
| `EvenDt` | `even-dt.js` | Smooths the uneven frame gaps a browser reports by snapping them to the screen's learned refresh period (median of recent gaps; the leftover is paid back slowly). |
| `QualityGovernor` | `quality-governor.js` | Steps a quality level down after a run of slow frames and up after a long calm stretch, with hysteresis. |
| `JobPump` | `job-pump.js` | Runs queued build steps (functions or generators) for about N milliseconds per frame, so a big pre-render never hitches a frame. |
| `FrameMeter` | `frame-meter.js` | A speed meter: FPS, the slowest frame, hitches with a plain-words cause (game or device) and the delay from a tap to the next frame. |

## Why it exists

Browsers report frame gaps that wobble by a millisecond or two even when every frame is on time, which shows as a faint shiver in scrolling scenery (`EvenDt`). A game fine at full quality on one machine needs fewer particles or a smaller canvas on another (`QualityGovernor` decides when; you decide what a level means). Procedural art and texture bakes can freeze the page for hundreds of milliseconds (`JobPump` spreads them over frames). They were extracted from a real, shipped single-file browser game and rewritten to stand alone.

## Use

Copy the files you want; `demo.html` shows all four working.

```html
<script src="even-dt.js"></script>
<script src="quality-governor.js"></script>
<script src="job-pump.js"></script>
<script>
  const even = new EvenDt(), pump = new JobPump();
  const gov = new QualityGovernor({ levels: 3, onChange: (level) => console.log('quality level', level) });
  pump.add(function* () {                 // a big bake as a generator: one slice per yield
    for (let y = 0; y < 1024; y += 32) { /* draw one band */ yield; }
  });
  let last = 0;
  function frame(now) {
    if (last) {
      const gap = now - last;
      const dtMs = even.next(gap);        // smoothed gap, for movement
      gov.frame(gap, now);                // real gap, for the governor
      pump.run(4);                        // about 4 ms of build work per frame
      // ... move things by dtMs / 1000 seconds, then draw ...
    }
    last = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
</script>
```

Each file also loads in Node with `require('./even-dt.js')` (browser global plus `module.exports`); pasting one into a single-file game is fine, since its `'use strict'` is inside the wrapper. Tests (Node, offline, about a second): `node modules/frame-kit/test/run.js` from the repository root. Browser check of the example: `python3 modules/frame-kit/test/check-example.py` (Playwright for Python, Chromium installed).

## API

All options are optional; defaults are the original game's values.

**`EvenDt`**: `.next(gapMs)` returns the smoothed gap (`0` for a value that is not a positive finite number); `.period` (`0` while warming up); `.drift`; `.reset()` (after a long pause or a move to another screen). Gaps outside `minGap`..`maxGap` pass through unlearned; a gap within `tolerance` of a whole multiple of the period snaps to it. Options: `minGap` 2 ms (pass `0.5` on 360 Hz or faster screens), `maxGap` 60, `window` 40, `warmup` 12, `refreshEvery` 8, `maxMultiple` 3, `tolerance` 0.3, `payback` 0.04.

**`QualityGovernor`**: `.frame(gapMs, nowMs)` every frame; `.level` (`0` full to `levels - 1` lightest); `.average`; `.force(n)`; `.lock()` / `.unlock()`; `.hold()` (drop streaks while frames are not representative: menu open, tab hidden); `.enabled`; `.flips`, `.gaveUp`, `.resetGuard()`; `.lastError`. It steps down one level when the smoothed gap stays above `slowAbove` for `slowFrames` frames and `downDelay` ms have passed since the last change, and up when it stays below `fastBelow` for `fastMs` and `upDelay` ms have passed; between the lines nothing happens. Options: `levels` 5; `onChange(level, previous)` and `onError(err)` (an error in `onChange` never stops the governor); `expectedPeriod` 16.7 ms (scales both thresholds); `slowAbove` 22 and `fastBelow` 18.5 ms; `smoothing` 0.06; `slowFrames` 100; `downDelay` 3000; `fastMs` 10000; `upDelay` 10000; `maxGap` 100 (larger gaps are ignored and end the fast streak, unless `stallRun`, default 4, come in a row: a device always that slow); `stepUp` true (`false` = never steps back up); `flipLimit` 0 and `flipWindow` 30000 (flip-flop guard, off at 0, `3` is good: each quick up-then-down reversal doubles the wait for that level, and after `flipLimit` the governor stays below it, so a borderline device makes at most seven level changes, about 90 seconds in the test); `enabled` true; `level` 0.

**`JobPump`**: `.add(job)` queues a function, generator function or generator object; `.run(budgetMs, minSteps = 1)` runs steps until about `budgetMs` have passed (returns `true` while work remains; `Infinity` finishes everything); `.size`; `.clear()` (closes half-finished generators so `finally` blocks run). A plain function is one step; each `yield` ends one. Jobs run in the order added. Options: `now` (clock, default `performance.now`), `onError(err)` (a throwing job is dropped; without it `run()` rethrows), `clockStepMs`, `stuckSteps` 8.

**`FrameMeter`**: `meter.frame(now, workMs, gapMs)` returns `true` when the numbers refreshed (about twice a second). Pass the work time of the frame *before* the one reported (the one that caused the gap), or slow game code reads as "the device". `meter.input(e.timeStamp)` on a tap; `meter.pause()` on a hidden tab (a gap after a pause or over `pauseGapMs` is skipped). `lines(extra)` gives text such as `["58 FPS", "worst 21 ms", "tap 24 ms", "2 hitches: the device"]`. Also `fps`, `worstMs`, `tapMs()`, `hitches()`, `verdict()`, `pauses`, `tapsDropped`, `reset()`. Options: `everyMs` 500, `hitchMs` 50, `ratio` 2, `gameShare` 0.6, `windowMs` 60000, `tapKeep` 20, `pauseGapMs` 1000, `tapSlackMs` 50. A hitch is a frame over 50 ms and over twice the average of the three before it (a steady 30 FPS game is "smooth"); it is "the game" when your own update and draw took at least 60% of the gap, else "the device".

## Lean builds of EvenDt and QualityGovernor (new in 1.2.0)

The two files stay whole; `lean.py` writes copies without parts you do not use, for example `python3 modules/frame-kit/lean.py --file even-dt --without options,stats,refreshRule --no-comments -o even-dt.js` (`--list` names the parts, `--sizes` prints bytes). Three parts (`refreshRule`, `stallRules`, `graceStart`) swap in Fancy Banana's rule instead of removing code, so the lean builds give Fancy's exact answers; the full files do not (on the 26 series of `test/series.js`, 50,011 frames, the full EvenDt differs on 42,604 frames, median difference 0.026 ms, largest 8.8 ms, and the full QualityGovernor changes level differently in 9 of 78 runs). Feed a lean governor `gov.frame(0, t)` for a hidden frame.

Fancy Banana's set, minified (gzipped), lower is smaller: EvenDt 985 B (506) against 1,536 B (662) for the whole file, 36% and 24% smaller; QualityGovernor 1,342 B (575) against 3,688 B (1,240), 64% and 54% smaller; together 2,327 B against 5,224 B. Fancy's own inline code is about 378 and 630 bytes. `node modules/frame-kit/test/lean.js` (about 2.5 s) checks every cut against a verbatim copy of Fancy's code (`test/reference-frame.js`): 0 different frame steps and 0 different level changes; `node tests/small-lean-browser.js` repeats it in a real browser.

## How it compares

Established tools are better when you already use their engine or framework. Speed in browsers: not measured for any of the four.

| Alternative | Size (smaller is better) | Where it wins / loses |
| --- | --- | --- |
| [Phaser `TimeStep`](https://docs.phaser.io/api-documentation/class/core-timestep) (MIT) vs `EvenDt` | `EvenDt`: 1,536 B minified (662 B gzipped). Phaser's: not measured | Phaser averages the last 10 deltas and wins if you already use it. `EvenDt` snaps to a learned period and passes real stalls through. |
| [drei `PerformanceMonitor`](https://drei.docs.pmnd.rs/getting-started/introduction) (MIT) vs `QualityGovernor` | `QualityGovernor`: 3,688 B minified (1,240 B gzipped). drei's: not measured | drei wins inside React Three Fiber. `QualityGovernor` needs no framework but changes level slowly by design. |
| [Stats.js](https://github.com/mrdoob/stats.js) and similar panels (MIT) vs `FrameMeter` | `FrameMeter`: 8.8 KB readable (3.3 KB gzipped); minified not measured. Stats.js: not measured | Stats.js wins on a drawn graph. `FrameMeter` returns plain text with a game-or-device cause and the tap delay. |
| [`scheduler.yield()`](https://developer.mozilla.org/docs/Web/API/scheduler/yield) and [`requestIdleCallback`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback) vs `JobPump` | `JobPump`: 10.1 KB readable (3.8 KB gzipped); minified not measured. Browser features cost no bytes | Browser features win for general responsiveness. `JobPump` has a per-frame millisecond budget and generator slices, but no priorities, no cancelling one job, no yielding to input. |

Where it loses: `EvenDt` gives no smoothing to a 15 Hz or slower loop (gaps of 60 ms or more). `QualityGovernor` reacts slowly (at least 100 slow frames and 3 s to step down, 10 s to step up) and cannot tell why frames are slow. `FrameMeter` does not use the Event Timing API (Firefox 89 and later, Safari 26.2 and later; by default it reports only slow events, over 104 ms) or the Long Animation Frames API (Chromium only, Chrome 123 and later), and "the device" only means "not your code"; support facts are from MDN compatibility data (2026-10 audit), not re-tested. Not measured: the speed of every helper in browsers, and the sizes and speeds of the alternatives. No exhaustive search for vanilla-JS packages was done; others may exist.

## What it is not

- **`EvenDt`** lags rather than drifts: if the learned period is off by `e` ms the clock settles about `e / payback` ms behind (25 times `e`; under one period in the tests). On a screen whose rate keeps changing, gaps are nudged by up to 0.6 of a period and the clock can slip; do not use it where you need exact times. It does not replace a fixed-step accumulator for physics. At about 480 Hz the learned period came out 7% too long in the test (about 1% at 360 Hz, none at 240 Hz and below); pass `minGap: 0.5` there. Call `reset()` after a move to another screen.
- **`QualityGovernor`** assumes a 60 Hz screen: on a clean 30 Hz screen it steps all the way down unless you pass `expectedPeriod` (for example `1000 / 30`); a 120 or 144 Hz screen will not step down until roughly 45 FPS without it. A hidden or throttled tab looks like a slow GPU; call `hold()` then. The flip-flop guard gives up on a level until `force()` or `resetGuard()`.
- **`FrameMeter`** cannot see graphics stalls; the tap delay is to the next frame callback, not to the picture on screen. A battery-saver loop skipping frames on purpose (about 30 FPS) reads as steady. Wire `visibilitychange` to `pause()`.
- **`JobPump`**: never hold a shared scratch canvas or typed array across a `yield`. Keep steps near a millisecond (the budget is checked after a step). A generator that never ends blocks everything behind it.
- **Coarse clocks** (Firefox with privacy protection rounds time to 16.67 ms or more): `FrameMeter`'s game-or-device call becomes unreliable (FPS, worst gap and hitch count still work to within one tick), and `JobPump` stops after `stuckSteps` steps while the clock stays frozen; pass `clockStepMs` to avoid one full tick on the first `run()`.

## For AI agents

- Run `node modules/frame-kit/test/run.js` from the repository root after any change; it must print `0 failed`. Do not weaken a test.
- Keep each file standalone: no imports, dependencies, build step or DOM access (`FrameMeter` makes one guarded read of `document.hidden`), the license header, and the UMD wrapper with `'use strict'` inside it.
- Do not retune defaults (a test pins the governor's); add an option instead. `EvenDt.next()` never returns a negative number. `QualityGovernor` steps one level at a time and `onChange` errors never escape. `FrameMeter` never throws. `JobPump.run()` keeps first-in first-out order.
- American English, no personal names beyond the copyright holder, no game art or story from the source game.

Related: [`fx-governor`](../fx-governor/README.md) also steps effects down when a device cannot keep up, but never steps back up and judges whole windows of seconds instead of a smoothed gap. `QualityGovernor` with `stepUp: false` and `lock()` gives the same never-back-up behavior.

## Prior art and credits

- [Phaser `TimeStep`](https://docs.phaser.io/api-documentation/class/core-timestep) (MIT): prior art for delta smoothing. Idea only, no code.
- [Frankforce, "frame rate delta buffering"](https://frankforce.com/frame-rate-delta-buffering/): the same core idea as `EvenDt` (a whole number of vsync intervals, leftover carried forward). `EvenDt` learns the period from the data and only snaps gaps near a multiple. Idea only, no code.
- [Gaffer On Games, "Fix Your Timestep"](https://gafferongames.com/post/fix_your_timestep/): the standard reference for fixed timestep with an accumulator and the better fix for physics. Idea only, no code.
- [Unity, "Fixing Time.deltaTime in Unity 2020.2"](https://unity.com/blog/engine-platform/fixing-time-deltatime-in-unity-2020-2-for-smoother-gameplay): read for comparison. Nothing taken.
- [drei `PerformanceMonitor` and `AdaptiveDpr`](https://drei.docs.pmnd.rs/getting-started/introduction) (MIT): read for comparison (only the site's sidebar and a [third-party copy of its docs](https://tessl.io/registry/tessl/npm-react-three--drei/files/docs/performance.md) were readable, so no claim about its trigger rules). Nothing taken.
- PerfDog's "jank" rule: the idea of a relative hitch rule in `FrameMeter`. Idea only, no code. Stats.js and similar panels: read for comparison, nothing taken.
- MDN pages on `scheduler.yield()`, `requestIdleCallback`, Event Timing and Long Animation Frames: facts only, no code. [React's `scheduler` package](https://www.npmjs.com/package/scheduler): named, not read in detail.
- `EvenDt` and `QualityGovernor` were extracted from a real, shipped single-file browser game of LFC Foundry and rewritten to stand alone, so that code is the project's own. `FrameMeter` and the lean builds were written for the project's own games; the lean builds are checked against a verbatim copy of Fancy, the Banana's inline code.

No code from others; the ideas above are theirs.

## Full research notes

The long version of this page (the longer comparison with each alternative, every default and rule written out step by step, and the on-purpose differences from the original game code) is kept in the project's private knowledge base.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
