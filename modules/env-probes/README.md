# env-probes

**Version 1.1.0 · API 1**

**Tested in:** Node checks; the speed figures were measured in Chromium (version not recorded). Firefox for this release: not recorded (Firefox 157 ran `tests/firefox.js` on 2026-10-17: 5 passed). Not run: Firefox privacy-profile test, WebKitGTK, a phone.

Tiny checks for browsers that quietly change what your page can do. About 8 KB minified (about 3.2 KB gzipped), no dependencies. Open `demo.html` for the one-button device check page. Never throws, in a page, a Worker or Node.

```js
EnvProbes.timerRounded();      // true: the clock is rounded (Firefox "resist fingerprinting" ~16.67 ms, Tor-style 100 ms)
EnvProbes.timerStepMs();       // the smallest step performance.now() took, in ms (0 = it never moved)
EnvProbes.canvasReadbackOk();  // false: getImageData is scrambled or blocked by a privacy mode
EnvProbes.canvasReadback();    // 'ok' | 'noisy' | 'blocked'
EnvProbes.storageWorks();      // false: localStorage cannot be written (private window, blocked site data, full)
EnvProbes.storageState();      // 'ok' | 'full' | 'blocked'
var stop = EnvProbes.reducedMotion(function (reduce) { /* ... */ });  // calls back on change; stop() unsubscribes
EnvProbes.reducedMotion();     // no callback: just true/false
EnvProbes.coarsePointer();     // true when the main input is touch
EnvProbes.anyCoarsePointer();  // true when any input is touch (touch laptops)
EnvProbes.contrastPreference();// 'more' | 'less' | 'custom' | 'none'
EnvProbes.canvasNoise();       // { maxDelta, share } how big the noise was (0-255 levels, share of pixels), null if nothing was read
EnvProbes.prefersReducedTransparency(); // true: the device asks for less see-through or blurred glass
EnvProbes.hover();             // true when the main input can hover (mouse); EnvProbes.anyHover() for any input
EnvProbes.framed();            // 'none' | 'same-origin' | 'cross-origin': is the page inside another page (itch.io style)?
EnvProbes.capabilities();      // { webLocks, wakeLock, closeWatcher, gamepad, compressionStream, idleCallback, webAnimations, viewTransitions }
EnvProbes.report();            // all of the above in one object, handy in bug reports
EnvProbes.explain();           // short plain-words sentences, e.g. "This browser rounds its clock, so frame meters should be switched off..."
```

## Why it matters
With a rounded clock, per-frame meters measure nothing. With scrambled canvas read-back, anything that analyzes pixels turns into noise. Tor Browser also shows a permission prompt on read-back, which is why the canvas test is not tried when the clock is rounded. Run these first and skip the code that cannot work.

## How each probe works
- **Clock:** reads `performance.now()` in a bounded loop (at most 30,000 reads, usually under a millisecond) until it has seen three steps, and keeps the smallest. A rounded clock shows 16 ms or more on every step, so three are enough. No step at all, or a smallest step above about 8 ms, means "rounded". It never waits on `Date.now`, so it cannot stall the page. If `performance.now` is missing, the clock counts as rounded.
- **Canvas:** writes a 16x16 patch where every drawn pixel has its own color (one `putImageData` call), reads it back, and checks all 256 pixels (drawn ones exactly, never-drawn ones fully transparent). Any difference is `'noisy'`, and `canvasNoise()` says how big the biggest error was and what share of pixels differed, so a game can tell a tiny wobble from a scrambled image. An error, a missing canvas, or a blanked image is `'blocked'`. When the clock is rounded the test is skipped and the answer is `'blocked'`, because Tor Browser asks the player for permission on read-back and Firefox's own privacy mode returns random noise. `report().canvasSkipped` tells "not tried" apart from "tried and blocked". Whether stock Firefox also shows a prompt is not confirmed; it needs a live privacy profile to settle. `canvasReadbackOk()` keeps its old meaning: true only for `'ok'`.
- **Storage:** writes, reads and removes one small key. A quota error while other data is already stored is `'full'` (storage works, it just has no room); any other failure is `'blocked'`. The write and remove fire two `storage` events in other open copies of the same page (harmless unless you listen for them). Inside another site's frame Safari blocks or limits storage, so `explain()` says so when `framed()` is not `'none'`. `storageWorks()` keeps its old meaning: true only for `'ok'`.
- **Motion:** `reducedMotion(cb)` shares one listener for all callbacks, ignores the same callback added twice, and returns an unsubscribe function (it also has a `.matches` field with the current answer). Without a callback it still returns true or false.
- **Capabilities:** plain yes/no feature checks for what this repository's own modules lean on. They look for the feature, not for a browser name.

## Who uses it
No other module here calls it; it exists for the games and apps built from these modules (`fx-governor` only mentions it in a comment).

## Caching
`timerStepMs`, `timerRounded`, `canvasReadback(Ok)`, `canvasNoise`, `framed` and `storageState`/`storageWorks` are cached after the first call. `reducedMotion`, `coarsePointer`, `anyCoarsePointer`, `contrastPreference`, `prefersReducedTransparency`, `hover`, `anyHover` and `capabilities` ask the browser each time, so they follow live changes. `report()` and `explain()` use both kinds.

## Limits
Detection is by behavior, so a future browser could round differently or add noise differently. The clock check cannot tell a rounded clock from a very slow device that never saw a step in 30,000 reads (both count as rounded, which is the safe answer). Noise detection depends on the browser changing the pixels this module draws; a browser that only noises very large canvases could pass. Contrast and reduced-motion answers are only as good as the browser's media-query support (`prefers-contrast` works in all three engines; `prefers-reduced-transparency` is Chrome and Edge 118+ only so far, and the answer is `false` elsewhere). The Safari 26 claim that canvas read-back always carries noise comes from a secondary source and has not been tested on a real iPhone. `fx-governor` does not use `timerRounded`: it averages frames over seconds, which a rounded clock barely disturbs.

## Quick start
Open `demo.html` (the device check page), press the button, and copy the report. In code: `var r = EnvProbes.report(); if (r.canvasReadback !== 'ok') skipPixelAnalysis();`.

## Prior art
Fingerprinting libraries ([CreepJS](https://github.com/abrahamjuliot/creepjs), [detectIncognito](https://github.com/Joe12387/detectIncognito)) detect these modes to identify users or guess private windows; this does the opposite: it detects the effect (not the mode) to keep your game working. [detect-gpu](https://github.com/pmndrs/detect-gpu) rates the graphics chip, a different question. The storage check follows MDN's `storageAvailable` pattern. I found no library that does this exact job.

## For AI agents
- Load `env-probes.js` (UMD: `EnvProbes` global or `require`). Call `EnvProbes.explain()` to get sentences you can show in a help screen, or `EnvProbes.report()` for raw values.
- Do not run pixel-analysis code unless `canvasReadback() === 'ok'`. Do not trust sub-frame timings when `timerRounded()` is true.
- Keep old calls working: `timerRounded`, `canvasReadbackOk`, `storageWorks`, `reducedMotion`, `coarsePointer`, `report` return the same types as before.
- Tests: `node modules/env-probes/test/run.js` (fake window, document, navigator, performance and storage). `_env(fakes)` and `_reset()` exist for tests only.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
