# frame-kit

Test everything (Node only, offline, about a second): `node modules/frame-kit/test/run.js` (run from the repository root; it exits non-zero on any failure).
Browser check of the example (Playwright for Python, Chromium already installed): `python3 modules/frame-kit/test/check-example.py`.

## What it is

Four tiny, independent helpers for browser games and other `requestAnimationFrame` loops. Each is one file with no dependencies; use any one without the others.

| Helper | File | One line |
| --- | --- | --- |
| `EvenDt` | `even-dt.js` | Smooths the uneven frame gaps a browser reports by snapping them to the screen's learned refresh period. |
| `QualityGovernor` | `quality-governor.js` | Steps a quality level down or up from how long frames really take, with hysteresis. |
| `JobPump` | `job-pump.js` | Runs queued build steps for about N milliseconds per frame, so a big pre-render never hitches a frame. |
| `FrameMeter` | `frame-meter.js` | A speed meter: frames a second, the slowest frame, hitches with a plain-words cause (game or device) and the delay from a tap to the next frame. |

## Why it exists

- Browsers report frame gaps that wobble by a millisecond or two even when every frame is presented on time. A game that moves by the raw gap shows that wobble as a faint shiver in scrolling scenery. `EvenDt` removes most of it.
- Screens differ: a game that is fine at full quality on one machine needs fewer particles or a lower canvas resolution on another. `QualityGovernor` decides when to change level; you decide what a level means.
- Procedural art, texture atlases and other bakes can take hundreds of milliseconds. Done in one go they freeze the page. `JobPump` lets you write the bake as a function or a generator and spreads it over frames.

They were extracted from a real, shipped single-file browser game and rewritten to stand alone.

## Quick start

Open `demo.html` by double-click to see all four working (sections 2 and 4 each have a one-button automatic check that reports in plain words). To use them, copy the files you want:

```html
<script src="even-dt.js"></script>
<script src="quality-governor.js"></script>
<script src="job-pump.js"></script>
<script src="frame-meter.js"></script>        <!-- optional: see the FrameMeter section below -->
<script>
  const even = new EvenDt();
  const pump = new JobPump();
  const gov = new QualityGovernor({
    levels: 3,                                   // levels 0 (full), 1, 2 (lightest)
    onChange: (level) => console.log('quality level is now', level)
  });

  // A big bake written as a generator: one slice per yield.
  const texture = document.createElement('canvas');
  texture.width = texture.height = 1024;
  pump.add(function* () {
    const g = texture.getContext('2d');
    for (let y = 0; y < 1024; y += 32) {
      g.fillStyle = 'hsl(' + (y / 4) + ',60%,50%)';
      g.fillRect(0, y, 1024, 32);
      yield;                                     // give the frame back
    }
  });

  let last = 0;
  function frame(now) {
    if (last) {
      const gap = now - last;
      const dtMs = even.next(gap);               // smoothed gap for movement
      gov.frame(gap, now);                       // real gap for the governor
      pump.run(4);                               // about 4 ms of build work per frame
      // ... move things by dtMs / 1000 seconds, then draw ...
    }
    last = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
</script>
```

In Node (for tests): `const EvenDt = require('./even-dt.js');`. Each file works both ways (browser global and `module.exports`, through the usual UMD wrapper at the top of the file).

Pasting a file into a single-file game is fine: its `'use strict'` is inside the wrapper, so it does not make the rest of your script strict.

## API

All options are optional. Defaults are the values from the original game.

### `new EvenDt(opts)`

| Member | Meaning |
| --- | --- |
| `.next(gapMs)` | Returns the smoothed gap in ms. A value that is not a positive finite number returns `0`. |
| `.period` | The learned screen period in ms (median of the recent gaps), `0` while warming up. |
| `.drift` | Milliseconds currently owed, for debugging. |
| `.reset()` | Forget everything (use after a long pause or when the window moves to another screen). |

How `next()` works: gaps of `minGap` or less and `maxGap` or more are returned unchanged and not learned from. Otherwise the gap goes into a window of the last `window` gaps. After `warmup` gaps the period is the median of the window (recomputed every `refreshEvery` gaps). A gap is rounded to the nearest whole multiple of the period (1 to `maxMultiple`); if it is within `tolerance` of the period from that multiple it becomes the multiple plus a small pay-back, otherwise it is returned unchanged and the owed drift is dropped. The difference between the raw gap and the multiple is added to a drift account, of which `payback` is paid out each frame.

| Option | Default | Meaning |
| --- | --- | --- |
| `minGap` | `2` | Ignore gaps at or below this (ms). On a screen near 480 Hz or faster pass `0.5` (see the limits below). |
| `maxGap` | `60` | Ignore gaps at or above this (ms): tab switches, long stalls. |
| `window` | `40` | How many recent gaps the median covers. |
| `warmup` | `12` | Gaps needed before snapping starts. |
| `refreshEvery` | `8` | Recompute the median every this many gaps. |
| `maxMultiple` | `3` | Largest multiple of the period to snap to (2 is a dropped frame). |
| `tolerance` | `0.3` | A gap snaps only within this fraction of the period from a multiple. |
| `payback` | `0.04` | Fraction of the owed drift paid back per frame. |

### `new QualityGovernor(opts)`

| Member | Meaning |
| --- | --- |
| `.frame(gapMs, nowMs)` | Feed every frame: the real gap and the current time from any steady clock. |
| `.level` | Current level, `0` (full quality) to `levels - 1` (lightest). |
| `.average` | The smoothed frame gap in ms, for a debug overlay. |
| `.force(n)` | Jump to level `n` (clamped). Restarts the streaks, the delay clock and the flip-flop guard, and calls `onChange` if the level changed. |
| `.hold()` | Drop the current slow and fast streaks. Call it while frames are not representative (menu open, tab hidden). |
| `.flips` | How many quick reversals (a step up, then a step down soon after) the flip-flop guard has seen. |
| `.gaveUp` | `true` once the guard has given up on a level: the governor stays below it. |
| `.resetGuard()` | Forget the reversals and the give-ups, so every level may be tried again. |
| `.lastError` | The last error thrown by `onChange`, or `null`. |
| `.enabled` | Set to `false` to freeze the governor. |

The rule: an exponential moving average of the gap (`smoothing`) is compared with `slowAbove` and `fastBelow`. It must stay above `slowAbove` for `slowFrames` frames in a row, and `downDelay` ms must have passed since the last change, to step down one level (the average then restarts from `expectedPeriod`). It must stay below `fastBelow` for `fastMs` of real time in a row, and `upDelay` ms must have passed since the last change, to step up one level. Between the two lines nothing happens, which is the hysteresis. Gaps over `maxGap`, or not positive, are not measured and break the slow streak; a gap over `maxGap` (or a jump of the clock over `maxGap` between two calls), for example a hidden tab coming back, also ends the fast streak, so "10 seconds fast in a row" never includes a stall.

The flip-flop guard: hysteresis stops quick flapping, but not a slow loop (the lighter level is fine, the heavier one is too much, so the level climbs after ten calm seconds and drops again a few seconds later, for ever, and each cycle may cost a visible hitch when a level rebuilds art). The guard counts a *reversal* when a step down to a level comes within `flipWindow` ms of the step up to it. Each reversal doubles both waits (`fastMs` and `upDelay`) before that level is tried again; after `flipLimit` reversals the governor gives up on that level and stays below it (`gaveUp` is `true`) until `force()` or `resetGuard()`. It is off by default (`flipLimit: 0`, the plain behavior); turn it on with `flipLimit: 3`. With the suggested 3 reversals and the default 30 seconds, so a device that is borderline for a level makes at most seven level changes (about 90 seconds in the test) and then stays put, instead of one change every 7 seconds for ever.

| Option | Default | Meaning |
| --- | --- | --- |
| `levels` | `5` | Number of levels (`0` to `levels - 1`). |
| `onChange` | none | `onChange(level, previousLevel)` after every change, including `force()`. The state is already final when it runs. An error it throws never stops the governor: it goes to `onError`, or (without one) is rethrown from a timer so it still shows in the console. |
| `onError` | none | `onError(error)` when `onChange` throws. |
| `expectedPeriod` | `16.7` | Normal frame gap (ms) of this screen; sets the starting average and scales the two thresholds. |
| `slowAbove` | `expectedPeriod * 22 / 16.7` (22 ms) | Average above this counts as slow. |
| `fastBelow` | `expectedPeriod * 18.5 / 16.7` (18.5 ms) | Average below this counts as fast. |
| `smoothing` | `0.06` | Weight of each new gap in the average. |
| `slowFrames` | `100` | Slow frames in a row needed to step down. |
| `downDelay` | `3000` | Minimum ms since the last change before stepping down. |
| `fastMs` | `10000` | Fast time in a row (ms) needed to step up. |
| `upDelay` | `10000` | Minimum ms since the last change before stepping up. |
| `maxGap` | `100` | Gaps above this (ms) are ignored, and end the fast streak. |
| `flipLimit` | `0` | Quick reversals on one level before the governor gives up on it. `0` (the default) leaves the guard off; `3` is a good value to turn it on. |
| `flipWindow` | `30000` | A step down this soon (ms) after a step up to the same level is a reversal. |
| `enabled` | `true` | Start enabled or frozen. |
| `level` | `0` | Starting level (`onChange` is not called for it). |

### `new JobPump(opts)`

| Member | Meaning |
| --- | --- |
| `.add(job)` | Queue a function, a generator function, or a generator object. Returns the pump. |
| `.run(budgetMs, minSteps = 1)` | Run steps until about `budgetMs` have passed and at least `minSteps` have run. Returns `true` while work remains. `Infinity` finishes everything now. |
| `.size` | Jobs waiting (a half-finished generator counts as one). |
| `.clear()` | Drop all waiting jobs; half-finished generators are closed so their `finally` blocks run. |

A plain function is one step. For a generator, every `yield` ends one step. Jobs run strictly in the order added, and a generator is finished before the next job starts. The budget is checked after each step, so a frame can overshoot by at most one step. Options: `now` (clock function, default `performance.now`; a bare `performance.now` is accepted, and a clock that throws or does not answer with a number is replaced by the default), `onError(err)` (a throwing job is dropped; with `onError` the queue continues, without it `run()` rethrows), `clockStepMs` (the clock's smallest step if you know it, for example `16.67`), `stuckSteps` (default `8`, see "coarse clocks" below). `pump.clockStepMs` shows the smallest clock jump the pump has seen so far.

`clear()` may be called from inside a job; a job added after it (even by the same job) is kept.

### `new FrameMeter(opts)`

```js
var meter = new FrameMeter();                 // opts: everyMs 500, hitchMs 50, ratio 2, gameShare 0.6, windowMs 60000, tapKeep 20, pauseGapMs 1000, tapSlackMs 50
canvas.addEventListener('pointerdown', function (e) { meter.input(e.timeStamp); });
document.addEventListener('visibilitychange', function () { if (document.hidden) meter.pause(); });   // a hidden tab is not a slow game
var lastWork = 0;
function frame(now) {
  var t0 = performance.now();
  // The work that stretched THIS gap is the work of the frame before it, so pass last frame's time.
  var refreshed = meter.frame(now, lastWork);
  update(); draw();
  lastWork = performance.now() - t0;
  if (refreshed) badge.textContent = meter.lines(['quality ' + level]).join('\n');
  requestAnimationFrame(frame);
}
```

`frame(now, workMs, gapMs)` returns true when the numbers were refreshed (about twice a second). `workMs` is how long your own update and draw took in the frame that *caused* the gap, which is the frame before the one being reported: a frame that burns 120 ms makes the next callback arrive 120 ms later, and the meter should be told the 120. Passing the current frame's work instead (a common slip) makes slow game code read as "the device". `lines(extra)` gives `["58 fps", "worst 21 ms", ...extra, "tap 24 ms", "2 hitches: the device"]`; the tap line only appears after a tap, and the verdict is `smooth` when there were no hitches in the last minute. Also `fps`, `worstMs`, `tapMs()`, `hitches()` (`{count, game, device, unknown}`), `verdict()`, `pause()`, `pauses` (how many pauses were skipped), `tapsDropped` and `reset()`.

Pauses: a tab that was hidden and comes back, or a device that slept, shows up as one huge gap. That is not a slow game, so the meter skips it: the first gap after `pause()`, after `document.hidden` was seen (read once, guarded), or a gap longer than `pauseGapMs` (default 1000 ms) is not counted as a frame, a hitch or the worst gap, the running average and the report interval start over, and a tap waiting at that moment is forgotten. The catch: a real freeze longer than `pauseGapMs` is skipped too; raise `pauseGapMs` if you want to see those.

A hitch is a frame longer than 50 ms **and** more than twice the average of the three frames before it, so a steady 30 fps game is "smooth". It is called "the game" when your own update and draw took at least 60% of that gap, otherwise "the device" (the browser, the graphics driver or power saving).

Tap delays: a tap whose timestamp is up to `tapSlackMs` (default 50 ms) after the frame time (the event arrived during the frame) counts as 0 ms instead of being dropped, which used to nudge the median up; a larger mismatch is dropped and counted in `tapsDropped`.

## How it differs from existing open source

None of these ideas is new, and the established tools below are better in the ways stated. What is offered here is four small, readable, tested files with no framework attached. I read each source named below; where I could not read the details, it says so. I did not do an exhaustive search for vanilla-JS packages, so others may exist.

**`EvenDt`**

- [Phaser's `TimeStep`](https://docs.phaser.io/api-documentation/class/core-timestep): has delta smoothing on by default (`smoothStep`), a moving average over a history of recent deltas (`deltaHistory`, default 10 values). The page I read does not mention snapping to the refresh rate. Phaser is better if you already use it: it is built in, and used by a great many games. `EvenDt` snaps to a learned period instead of averaging, and passes real stalls through untouched, which an average would smear over the following frames.
- [Frankforce, "frame rate delta buffering"](https://frankforce.com/frame-rate-delta-buffering/): describes the same core idea. Its code sets the delta to `1 / refreshRate` and carries the leftover into a buffer added to the next frame, and its prose describes rounding to a whole number of vsync intervals. This is the prior art for snapping with pay-back. `EvenDt` differs in learning the period from the data (median) instead of being told the refresh rate, in only snapping gaps near a multiple, and in paying the debt back gradually.
- [Gaffer On Games, "Fix Your Timestep"](https://gafferongames.com/post/fix_your_timestep/): the standard reference for fixed timestep, accumulator and interpolation. It does not discuss snapping. It is the better fix for physics stability (it removes the dependence on the frame gap rather than hiding the wobble) and is complementary: you can feed `EvenDt`'s output into an accumulator.
- [Unity, "Fixing Time.deltaTime in Unity 2020.2"](https://unity.com/blog/engine-platform/fixing-time-deltatime-in-unity-2020-2-for-smoother-gameplay): fixes the wobble at the source by sampling time at a better point and later using presentation timestamps from the graphics API. That is better than any after-the-fact smoothing, but a web page cannot get those timestamps, only the `requestAnimationFrame` time. The article does not describe snapping.

**`QualityGovernor`**

- [drei's `PerformanceMonitor` and `AdaptiveDpr`](https://drei.docs.pmnd.rs/getting-started/introduction) (React Three Fiber): the monitor reports `onIncline` / `onDecline` / `onFallback` and keeps a 0 to 1 `factor`; `AdaptiveDpr` moves the pixel ratio between bounds. I could only read the drei site's sidebar and a [third-party copy of its docs](https://tessl.io/registry/tessl/npm-react-three--drei/files/docs/performance.md), which does not state the exact trigger rules, so I make no claim about them. They are better when you are already in React Three Fiber: they are integrated with the renderer and the pixel ratio. `QualityGovernor` has no framework, uses integer levels you define, and its slow/fast streak and delay rules are all documented and tested here.

**`FrameMeter`**
- Stats.js and similar panels draw frames a second and milliseconds as a graph. `FrameMeter` adds a relative hitch rule (from PerfDog's "jank" definition), a game-or-device cause from two numbers every browser can measure, and the tap-to-next-frame delay, and it returns plain text instead of drawing. It does not use the Event Timing API (from MDN compatibility data, read in the 2026-10 audit and not re-tested here: Firefox 89 and later, Safari 26.2 and later, so now in all three engines; it measures an input to the next paint, rounded to 8 ms, and by default reports only slow events, over 104 ms, with 16 ms as the lowest setting; a fast tap is not reported at all, which is why the frame-callback delay here stays) or the Long Animation Frames API (Chromium only, Chrome 123 and later, per the same data).

**`JobPump`**

- [`scheduler.yield()`](https://developer.mozilla.org/docs/Web/API/scheduler/yield) (MDN): pauses a task so the browser can handle other work and queues the continuation with priority. It is the right tool for general page responsiveness, but MDN marks it as limited availability (not Baseline), and it hands control back to the browser rather than to your frame loop with a millisecond budget.
- [`requestIdleCallback`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback) and [React's `scheduler` package](https://www.npmjs.com/package/scheduler): well-known cooperative scheduling in the browser. I did not read their documentation in detail for this README, so I make no specific claims. A reason one may still prefer an explicit per-frame budget in a game loop (my reasoning, not a measured result) is that the frame loop itself decides exactly when and how long to build.
- `JobPump` is smaller and simpler than all of these: a FIFO queue, a time budget checked after each step, generator slices. It has no priorities, no cancellation of single jobs, and no yielding to input.

## Limits and gotchas

**All four**

- Time units are milliseconds everywhere.
- None of them touches the DOM, timers or `requestAnimationFrame`; you call them.

**`EvenDt`**

- It lags rather than drifts: if the learned period is off by `e` ms (the median of a noisy window typically is by a fraction of a millisecond), the smoothed clock settles about `e / payback` ms behind real time (25 times `e` at the default). Over the test streams this was under one period. The clock does not run faster or slower in the long run.
- The owed drift is dropped whenever a gap passes through unsnapped (a real stall, or a gap further than `tolerance` from a multiple). That bounds the lag after any single event (at most `tolerance / payback`, 7.5 periods) but means the clock can slowly slip on a stream that never settles.
- Variable-refresh screens: if the rate settles for a while, it is treated like a fixed rate. After a rate change the old period is used until the median catches up (about 20 to 30 frames), and gaps within 30% of it are snapped to the old period meanwhile. On a stream that wanders continuously, gaps are nudged by up to 0.6 of a period and the clock can slip (see the test "wandering variable-rate stream"). If you need exact times on such a screen, do not use it.
- Gaps of 60 ms or more are not smoothed or learned from, so a 15 Hz or slower loop gets no smoothing.
- **Very fast screens.** Gaps of `minGap` (2 ms) or less are never learned from. At about 480 Hz (period 2.08 ms) jitter pushes many true gaps under that line, the short ones are dropped, and the learned period is too long (7% in the test with half a millisecond of jitter; about 1% at 360 Hz; none at 240 Hz and below). The 2 ms rule is kept as the default because it also throws away duplicate callbacks and rounding artifacts on normal screens; on a 360 Hz or faster screen pass `minGap: 0.5`. The jitter bias is in the learned period only; stalls still pass through untouched.
- Call `reset()` when the window may have moved to another screen.
- A snapped gap moves by at most 0.3 of a period, plus the pay-back (usually small). Fixed-step physics still needs an accumulator (see "Fix Your Timestep").

**`QualityGovernor`**

- **Known limitation: a clean 30 Hz screen looks slow.** The default thresholds assume a 60 Hz screen (16.7 ms). On a screen whose normal gap is 33.3 ms the governor steps all the way down even though nothing is wrong. Pass `expectedPeriod` (for example `1000 / 30`, or the period `EvenDt` learned) and the thresholds scale with it. The governor cannot tell a 30 Hz screen from a machine struggling at 30 fps by itself; the test file demonstrates both behaviors.
- A 120 or 144 Hz screen is treated as fast, which is correct but means it will not step down until it falls below roughly 45 fps; pass `expectedPeriod` if you want it to react at a frame rate relative to the screen.
- It sees the gap between frames, not why it is long. A throttled background tab, a power-saving cap, or a slow video decoder looks the same as a slow GPU. Call `hold()` or skip `frame()` while paused or hidden.
- Changes are slow by design: at least 100 slow frames and 3 seconds to step down, 10 seconds fast and 10 seconds since the last change to step up. The grace period at the start is counted from the first `frame()` call.
- The flip-flop guard gives up for good on a level (until `force()` or `resetGuard()`), so a device that was only temporarily busy during three quick up-and-down cycles stays one level lower than it could. Raise `flipLimit` or leave it off (`flipLimit: 0`, the default) if you prefer to keep trying. The guard needs the heavier level to cost something; it cannot tell a level that is too heavy from a device that is simply having a bad minute.
- `onChange` is where you apply a level. If applying it is expensive (resizing a canvas), the next few frames will look slow; the average restarts after a step down for that reason.

**`FrameMeter`**

- It cannot see graphics or presentation stalls: a frame can start on time and still be shown late. "The device" means "not your code", not a proven cause.
- The tap delay is to the start of the next frame callback, not to the picture reaching the screen. `event.timeStamp` and the frame timestamp must come from the same clock (they do in current Chromium and Firefox; with `privacy.resistFingerprinting` both are rounded).
- A battery-saver loop that skips frames on purpose (about 30 fps) reads as steady, not as hitches.
- **Coarse clocks.** Firefox with privacy protection (and some Tor-style setups) rounds time to 16.67 ms or more. Then `workMs` is mostly `0` or a whole tick, and the "game or device" call is not reliable; the frame rate, the worst gap and the hitch count still work to within one tick. (Those setups also pin frames to 60 Hz.)
- **Hidden tabs.** See "Pauses" above: wire `visibilitychange` to `pause()` so even a short absence is skipped; without it, only gaps over `pauseGapMs` (and the guarded `document.hidden` read) are caught.

**`JobPump`**

- **Never hold a shared scratch resource across a yield.** If every build reuses one temporary canvas, `ImageData` or typed array, fill it and use it inside one slice (before the next `yield`). Another job may run between two slices and overwrite it.
- Keep steps small, about a millisecond. The budget is checked after a step, so one big step is one big hitch.
- **Coarse clocks.** Firefox with privacy protection rounds the clock to 16.67 ms or more, so a 4 ms budget cannot be measured: the clock reads the same until a whole frame has passed. The pump remembers the smallest clock jump it has seen (or use the `clockStepMs` option) and, while such a clock stays frozen, stops after `stuckSteps` steps (default 8) instead; it lowers that number itself when the clock then jumps past the budget. This only helps if steps are small (about a millisecond or less), and the very first `run()` on a coarse clock can still use up to one tick unless you pass `clockStepMs`. It also means a pump with a frozen or broken clock does at most 8 steps per `run()` instead of draining everything in one frame.
- Jobs run in the order added, one at a time. A generator that never ends blocks everything behind it.
- A plain function must not return an iterator (it would be treated as a generator).
- `run()` called from inside a job does nothing and reports whether work remains.
- With no `onError`, an exception from a job leaves `run()` with the failed job already dropped; call `run()` again to continue.
- Closing a half-finished generator in `clear()` runs its `finally` blocks; put clean-up there.

Differences from the original game code, on purpose: `EvenDt` recomputes the median every `refreshEvery` accepted gaps (the original, by a quirk of its length check, recomputed it every frame once its window was full). `QualityGovernor` measures its start-up grace period from the first frame it sees instead of from time zero, takes its levels, thresholds and effects as options and a callback instead of changing game globals, and adds an optional flip-flop guard (off by default; `flipLimit: 3` turns it on).

## For AI agents

- Run `node modules/frame-kit/test/run.js` from the repository root after any change. It must print `0 failed` and exit with code 0. For the example, run `python3 modules/frame-kit/test/check-example.py`.
- Keep each file standalone: no imports, no dependencies, no build step, no DOM access (`FrameMeter` makes one guarded read of `document.hidden`). Each file begins with the license header line and is wrapped in the UMD wrapper from the repository `AGENTS.md` (browser global plus `module.exports`); `'use strict'` goes inside the wrapper, never at the top of the file, because the files are pasted into single-file games. A check reads each file to make sure of that. Nothing may leak to the global scope except the class name.
- Invariants to preserve:
  - The default option values are the original game's constants (listed in the API tables). A test pins the governor defaults. Do not retune them; add an option instead.
  - `EvenDt.next()` returns the input unchanged for gaps outside `(minGap, maxGap)` and for gaps not near a multiple of the period, and never returns a negative number.
  - `QualityGovernor` steps one level at a time; steps down need `slowFrames` slow frames and `downDelay`, steps up need `fastMs` and `upDelay` (doubled per quick reversal on that level when the flip-flop guard is on); the average restarts only on a step down. A stall ends the fast streak. State is final before `onChange` runs, and `onChange` errors never escape `frame()` or `force()`.
  - `FrameMeter` calls a frame a hitch only when it is over `hitchMs` and over `ratio` times the average of the three frames before it; the cause is `game` only when `workMs >= gameShare * gap`. Tests pin both. A paused, hidden or over-`pauseGapMs` gap is never a hitch. `frame()` and `input()` never throw.
  - `JobPump.run()` checks its budget after a step, runs at least `minSteps` steps, and keeps FIFO order. Do not make it round-robin without a new option. The clock is only ever called as a plain function from the pump's own closure.
- Do not weaken a test to make it pass. If a bound in a test looks wrong, read the matching sentence in "Limits and gotchas" first; those bounds are documented behavior.
- Keep American English, no personal names beyond the copyright holder, and no game art or story from the source game.

Related: [`fx-governor`](../fx-governor/README.md) in this repository also steps effects down when a device cannot keep up, but never steps back up. `QualityGovernor` here steps back up after a calm spell. Pick the one that matches the behavior you want.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
