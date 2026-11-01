# fx-governor

**Version 1.1.1 · API 1**

**Tested in:** Node: 16 checks pass; no code change (a label word in the demo and README prose); the demo page was not opened in the three test browsers this time

## What it is and how it works

Steps visual effects down when a device cannot keep up, and never steps back up behind the player's back. About 6.4 KB with comments.

- It measures average FPS over 3-second windows.
- Two slow windows in a row move one level down (one very slow window counts as both).
- Pauses such as a hidden tab restart the count instead of being blamed on the device.

## Why it exists

Many adaptive-quality snippets react to one slow frame, so a single hiccup gets blamed on the device. Frame timing is the only signal every browser shares, so this reads it carefully and leaves going back up to the player.

**Where it helps**

- Games with optional particles, glow or shadows.
- Pages that must stay smooth on low-end phones.
- Keeping the look stable once it settles.

**Not for:** memory or battery limits; it measures frame rate only.

## Use
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
| `expectedPeriod` | none | Milliseconds per frame on this screen (16.67 for 60 Hz, 33.3 for 30 Hz). The line then becomes about 60 percent of that rate (36 FPS at 60 Hz, 18 FPS at 30 Hz). `minFps` wins if you give both. |
| `gapMs` | 250 | A gap between frames longer than this restarts counting. |
| `startAfterMs` | 0 | Ignore this many ms of frames after counting could begin (first frame, or `ready()`). |
| `waitForReady` | false | Do not count anything until you call `gov.ready()`. |
| `maxAuto` | `levels.length - 2` | Lowest level index it may reach by itself. The default **keeps the last level for the player** (`choose('calm')`), so with three levels it only goes `full` to `lite`, and with two levels it never moves. Pass `levels.length - 1` to let it reach the last level. |
| `longGaps` | 3 | This many gaps over `gapMs` in a row are a device that is always that slow (under 4 FPS), not a pause, so they are counted. One or two stray pauses still change nothing. Before 1.1.0 such a device was never helped. |
| `severe` | 0.5 | A window under this share of the line (under 18 FPS by default) counts as all the strikes at once, so a very slow device steps down after one window (about 3 s) instead of two. `0` restores the old timing. |
| `onSample(fps)`, `onChange(level, fps)` | none | Callbacks. A callback that throws is ignored and never stops adaptation. |

Methods: `start()`, `stop()`, `frame(t)`, `choose(level)` (an unknown name is ignored), `release([level])` (with a level it also sets it, for example `release('full')`), `ready()`; read-only `level`, `minFps`, `resting`.

**Let the player try again.** The governor never steps up by itself, so one bad patch (a phone busy updating, heat) can leave a game on `lite` all session. Offer a button "Try full effects again" that runs `gov.choose('full'); gov.release();` (or just `gov.release('full')`). It measures again and steps down again if the device still cannot keep up.

**Remember the level between visits.** Save `gov.level` when it changes (in `onChange`) and start the next visit with `FxGovernor.create({ start: savedLevel })`, so a slow phone does not repeat the first seconds of jank every launch.

**Loading is not slowness.** Games that decode or bake art at start: use `waitForReady: true` and call `gov.ready()` when the art is ready, or set `startAfterMs`.

**It rests when it has nothing to decide.** Once the player has chosen a level or the limit (`maxAuto`) is reached, its own loop stops asking for frames. `release()` wakes it up again (unless the limit was reached). If you drive it with `gov.frame(t)` yourself, `frame` simply returns early in those cases.

## How it compares
Works without any framework (drei's and Babylon.js's need their own framework), and it never steps back up behind the player's back; slower to react on purpose. Its speed in browsers is not measured.

| Alternative | Size (smaller is better) | Speed (faster is better) | Features | Where it wins / loses |
| --- | --- | --- | --- | --- |
| **fx-governor 1.1.1** (this module, MIT) | 6.4 KB with comments, 2.6 KB gzipped. Version 1.0.0 was 1,602 B minified (847 B gzipped); 1.1.x not re-measured | Speed in browsers: not measured | Averages over 3 s windows, needs repeated misses, ignores pauses, player can lock a level, never steps up | No framework; ignores pauses and a rounded clock. Loses: needs 3 to 6 s to react, frame rate only |
| [drei PerformanceMonitor](https://drei.docs.pmnd.rs/performances/performance-monitor) (MIT, version not recorded) | Not measured | Not measured | Short windows, limits set from the display's refresh rate, gives up after a number of flip-flops | Wins inside React Three Fiber, where it is built in. Loses: needs React Three Fiber |
| [Babylon.js SceneOptimizer](https://doc.babylonjs.com/features/featuresDeepDive/scene/sceneOptimizer) (Apache-2.0, version not recorded) | Not measured (part of Babylon.js) | Not measured | Steps through ranked cuts until a target rate is hit | Wins inside Babylon.js, which knows what to cut. Loses: Babylon.js scenes only |
| [detect-gpu](https://github.com/pmndrs/detect-gpu) (MIT, version not recorded) | Not measured | Not measured | Rates the device before play from the graphics chip's name | Wins: answers before the first frame. Loses: judges the chip name, not how the device is doing now; it complements this module |
| frame-kit `QualityGovernor` (this repository, MIT) | 3,688 B minified (1,240 B gzipped) | Not measured in browsers | Smoothed gap over a number of frames; can step up; `stepUp: false` and `lock()` | Wins: also steps up and has more options. Loses: bigger, different timing (see "For AI agents") |
| A hand-written "one slow frame" snippet | A few lines | Not measured | Reacts to a single slow frame | Wins: tiny. Loses: one hiccup is blamed on the device |

Reaction time, in a simulation with fake frame times (not a real phone; lower is faster): a 10 FPS device steps down after 3.0 s, a 3 FPS device after 3.6 s, a 1 FPS device after 5.0 s. A borderline 25 FPS device takes two windows (6.0 s).

**Where it loses**
- Measures frame rate only, not memory or battery, and you decide what each level means.
- Slow to react: at least one 3 s window, usually two.
- Never steps up by itself, so one bad patch can leave a game on `lite` until the player asks to try again (see the button recipe above).
- Not tried on a real slow phone. The default numbers (36 FPS line, 3 s windows, `severe` 0.5, 3 long gaps) are reasonable guesses, not tuned from phone data.
- Alternatives' sizes and speeds: not measured.

Many "adaptive quality" snippets react to a single slow frame. This one averages over a window, needs repeated misses, and **ignores pauses**: a hidden tab or a gap longer than `gapMs` restarts counting, so switching apps is never blamed on the device. It does not look at the timer, so it does not skip itself when timers are rounded; averaging frames over seconds barely feels a rounded clock (see `env-probes` if you want to check the clock yourself).

## Limits
Measures frame rate only, not memory or battery. You decide what each level means in CSS or code. `expectedPeriod` only helps if you know the screen's normal rate (for example from frame-kit's `EvenDt`); a game that truly runs at 30 FPS on a 60 Hz screen looks the same as a 30 Hz screen when you pass the wrong period. No browser API says "this device cannot keep up", so frame timing is the only shared signal.

## See it in action

Used right now in [Fancy, the Banana](https://lfcfoundry.github.io/fancy-banana/play/), [Pineapple Defense](https://lfcfoundry.github.io/pineapple-defense/play/). Checked in each app's shipped file on its main branch on 2026.10.29. The module's own page is `demo.html` in this folder.

## Prior art and credits
- [drei PerformanceMonitor](https://drei.docs.pmnd.rs/performances/performance-monitor) (MIT, React Three Fiber only): read as prior art for measuring in short windows and setting limits relative to the display's refresh rate. Idea only, no code.
- [Babylon.js SceneOptimizer](https://doc.babylonjs.com/features/featuresDeepDive/scene/sceneOptimizer) (Apache-2.0): read as prior art for stepping through ranked cuts until a target rate is hit. Idea only, no code.
- [detect-gpu](https://github.com/pmndrs/detect-gpu) (MIT): decides before play from the graphics chip's name and complements this. Nothing taken.
- Motion, ["When browsers throttle requestAnimationFrame"](https://motion.dev/magazine/when-browsers-throttle-requestanimationframe): the facts that iOS Low Power Mode drops Safari to about 30 FPS and that Firefox's privacy mode rounds timestamps; they are why `expectedPeriod` exists and why the module averages over seconds. Facts only, no code.
- The "Try full effects again" button and "remember the level" tips come from an internal review of this module (2026-10-17), not from outside code.

No code from others; the ideas above are theirs.

## For AI agents
- Copy `fx-governor.js` (UMD: `FxGovernor` global or `require`). Create it, call `start()`, and map `onChange(level)` to CSS or code.
- Never step quality up automatically; only the player's `choose`/`release` changes control.
- Pass `expectedPeriod` when the screen may run at 30 Hz; pass `waitForReady` or `startAfterMs` when the page loads art.
- frame-kit's `QualityGovernor` now also has `stepUp: false` and `lock()`, but it measures differently (a smoothed gap over a number of frames, not windows of seconds), so this module stays a separate file with its own timing.
- Tests: `node modules/fx-governor/test/run.js` (fake `requestAnimationFrame`).

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
