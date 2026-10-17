# fx-governor

**Version 1.1.0 · API 1**

**Tested in:** Node checks and a simulated 3 frames-a-second device; browser versions for this release: not recorded. Not run: a real slow phone.

Steps visual effects down by itself when the device cannot keep up, and **never steps back up behind the player's back**. About 6.4 KB with comments.

```js
var gov = FxGovernor.create({ levels: ['full', 'lite', 'calm'],
  onChange: function (level) { document.body.dataset.fx = level; } });
gov.start();                 // own requestAnimationFrame loop, or call gov.frame(t) from yours
gov.choose('full');          // the player picked a level: the governor stops adjusting and its loop rests
gov.release();               // hand control back; the loop wakes up again
```

## Options
| Option | Default | Meaning |
| --- | --- | --- |
| `levels` | `['full','lite','calm']` | Names of the levels, best first. |
| `start` | first level | Level to begin at. |
| `windowMs` | 3000 | Length of one measuring window. |
| `strikes` | 2 | Slow windows in a row before one step down. A value below 1 acts like 1. |
| `minFps` | 36 | Under this average the window is slow. An explicit `0` means "never slow". |
| `expectedPeriod` | none | Milliseconds per frame on this screen (16.67 for 60 Hz, 33.3 for 30 Hz). The line then becomes about 60 percent of that rate (36 fps at 60 Hz, 18 fps at 30 Hz). `minFps` wins if you give both. |
| `gapMs` | 250 | A gap between frames longer than this restarts counting. |
| `startAfterMs` | 0 | Ignore this many ms of frames after counting could begin (first frame, or `ready()`). |
| `waitForReady` | false | Do not count anything until you call `gov.ready()`. |
| `maxAuto` | `levels.length - 2` | Lowest level index it may reach by itself. The default **keeps the last level for the player** (`choose('calm')`), so with three levels it only goes `full` to `lite`, and with two levels it never moves. Pass `levels.length - 1` to let it reach the last level. |
| `longGaps` | 3 | This many gaps over `gapMs` in a row are a device that is always that slow (under 4 frames a second), not a pause, so they are counted. One or two stray pauses still change nothing. Before 1.1.0 such a device was never helped. |
| `severe` | 0.5 | A window under this share of the line (under 18 fps by default) counts as all the strikes at once, so a very slow device steps down after one window (about 3 s) instead of two. `0` restores the old timing. |
| `onSample(fps)`, `onChange(level, fps)` | none | Callbacks. A callback that throws is ignored and never stops adaptation. |

Methods: `start()`, `stop()`, `frame(t)`, `choose(level)` (an unknown name is ignored), `release([level])` (with a level it also sets it, for example `release('full')`), `ready()`; read-only `level`, `minFps`, `resting`.

**Let the player try again.** The governor never steps up by itself, so one bad patch (a phone busy updating, heat) can leave a game on `lite` all session. Offer a button "Try full effects again" that runs `gov.choose('full'); gov.release();` (or just `gov.release('full')`). It measures again and steps down again if the device still cannot keep up.

**Remember the level between visits.** Save `gov.level` when it changes (in `onChange`) and start the next visit with `FxGovernor.create({ start: savedLevel })`, so a slow phone does not repeat the first seconds of jank every launch.

**Loading is not slowness.** Games that decode or bake art at start: use `waitForReady: true` and call `gov.ready()` when the art is ready, or set `startAfterMs`.

**It rests when it has nothing to decide.** Once the player has chosen a level or the limit (`maxAuto`) is reached, its own loop stops asking for frames. `release()` wakes it up again (unless the limit was reached). If you drive it with `gov.frame(t)` yourself, `frame` simply returns early in those cases.

## How it differs
Many "adaptive quality" snippets react to a single slow frame. This one averages over a window, needs repeated misses, and **ignores pauses**: a hidden tab or a gap longer than `gapMs` restarts counting, so switching apps is never blamed on the device. It does not look at the timer, so it does not skip itself when timers are rounded; averaging frames over seconds barely feels a rounded clock (see `env-probes` if you want to check the clock yourself).

## Limits
Measures frame rate only, not memory or battery. You decide what each level means in CSS or code. `expectedPeriod` only helps if you know the screen's normal rate (for example from frame-kit's `EvenDt`); a game that truly runs at 30 fps on a 60 Hz screen looks the same as a 30 Hz screen when you pass the wrong period. No browser API says "this device cannot keep up", so frame timing is the only shared signal.

## Prior art
[drei PerformanceMonitor](https://drei.docs.pmnd.rs/performances/performance-monitor) (MIT, React Three Fiber only) measures in short windows, sets its limits relative to the display's refresh rate, and gives up after a number of flip-flops. [Babylon.js SceneOptimizer](https://doc.babylonjs.com/features/featuresDeepDive/scene/sceneOptimizer) steps through ranked cuts until a target rate is hit. [detect-gpu](https://github.com/pmndrs/detect-gpu) decides before play from the graphics chip's name and complements this. This module is tiny, framework-free, ignores pauses, and has a player override (`choose`).

## For AI agents
- Copy `fx-governor.js` (UMD: `FxGovernor` global or `require`). Create it, call `start()`, and map `onChange(level)` to CSS or code.
- Never step quality up automatically; only the player's `choose`/`release` changes control.
- Pass `expectedPeriod` when the screen may run at 30 Hz; pass `waitForReady` or `startAfterMs` when the page loads art.
- frame-kit's `QualityGovernor` now also has `stepUp: false` and `lock()`, but it measures differently (a smoothed gap over a number of frames, not windows of seconds), so this module stays a separate file with its own timing.
- Tests: `node modules/fx-governor/test/run.js` (fake `requestAnimationFrame`).

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
