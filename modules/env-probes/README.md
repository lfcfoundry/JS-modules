# env-probes

**Version 1.0.0 · API 1**

Tiny checks for browsers that quietly change what your page can do. About 12 KB with comments, no dependencies. Never throws, in a page, a Worker or Node.

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
EnvProbes.report();            // all of the above in one object, handy in bug reports
EnvProbes.explain();           // short plain-words sentences, e.g. "This browser rounds its clock, so frame meters should be switched off..."
```

## Why it matters
With a rounded clock, per-frame meters measure nothing. With scrambled canvas read-back, anything that analyzes pixels turns into noise (Firefox may also show a permission prompt). Run these first and skip the code that cannot work.

## How each probe works
- **Clock:** reads `performance.now()` in a bounded loop (at most 30,000 reads, usually a few hundred microseconds) and keeps the smallest step it sees. No step at all, or a smallest step above about 8 ms, means "rounded". It never waits on `Date.now`, so it cannot stall the page. If `performance.now` is missing, the clock counts as rounded.
- **Canvas:** draws a 16x16 patch where every drawn pixel has its own color, reads it back, and checks all 256 pixels (drawn ones exactly, never-drawn ones fully transparent). Any difference is `'noisy'`. An error, a missing canvas, or a blanked image is `'blocked'`. When the clock is rounded the test is skipped and the answer is `'blocked'`, because that privacy mode can ask the player for permission on read-back. `canvasReadbackOk()` keeps its old meaning: true only for `'ok'`.
- **Storage:** writes, reads and removes one small key. A quota error while other data is already stored is `'full'` (storage works, it just has no room); any other failure is `'blocked'`. `storageWorks()` keeps its old meaning: true only for `'ok'`.
- **Motion:** `reducedMotion(cb)` shares one listener for all callbacks, ignores the same callback added twice, and returns an unsubscribe function (it also has a `.matches` field with the current answer). Without a callback it still returns true or false.

## Caching
`timerStepMs`, `timerRounded`, `canvasReadback(Ok)` and `storageState`/`storageWorks` are cached after the first call. `reducedMotion`, `coarsePointer`, `anyCoarsePointer` and `contrastPreference` ask the browser each time, so they follow live changes. `report()` and `explain()` use both kinds.

## Limits
Detection is by behavior, so a future browser could round differently or add noise differently. The clock check cannot tell a rounded clock from a very slow device that never saw a step in 30,000 reads (both count as rounded, which is the safe answer). Noise detection depends on the browser changing the pixels this module draws; a browser that only noises very large canvases could pass. Contrast and reduced-motion answers are only as good as the browser's media-query support (`prefers-contrast` works in all three engines). `fx-governor` does not use `timerRounded`: it averages frames over seconds, which a rounded clock barely disturbs.

## Prior art
Fingerprinting libraries ([CreepJS](https://github.com/abrahamjuliot/creepjs), [detectIncognito](https://github.com/Joe12387/detectIncognito)) detect these modes to identify users or guess private windows; this does the opposite: it detects the effect (not the mode) to keep your game working. [detect-gpu](https://github.com/pmndrs/detect-gpu) rates the graphics chip, a different question. The storage check follows MDN's `storageAvailable` pattern. I found no library that does this exact job.

## For AI agents
- Load `env-probes.js` (UMD: `EnvProbes` global or `require`). Call `EnvProbes.explain()` to get sentences you can show in a help screen, or `EnvProbes.report()` for raw values.
- Do not run pixel-analysis code unless `canvasReadback() === 'ok'`. Do not trust sub-frame timings when `timerRounded()` is true.
- Keep old calls working: `timerRounded`, `canvasReadbackOk`, `storageWorks`, `reducedMotion`, `coarsePointer`, `report` return the same types as before.
- Tests: `node modules/env-probes/test/run.js` (fake window, document, navigator, performance and storage). `_env(fakes)` and `_reset()` exist for tests only.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
