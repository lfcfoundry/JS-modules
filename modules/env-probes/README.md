# env-probes

Tiny checks for browsers that quietly change what your page can do. About 4 KB. Never throws; results are cached.

```js
EnvProbes.timerRounded();      // true: performance.now() is rounded to 100 ms (Firefox "resist fingerprinting"/strict privacy)
EnvProbes.canvasReadbackOk();  // false: getImageData is scrambled or blocked by a privacy mode
EnvProbes.storageWorks();      // false: localStorage cannot be written (private window, blocked site data)
EnvProbes.reducedMotion(cb);   // true when the OS asks for less motion; cb(bool) on change
EnvProbes.coarsePointer();     // true on touch-first devices
EnvProbes.report();            // all of the above in one object, handy in bug reports
```

## Why it matters
With a rounded clock, frame-time meters and adaptive-quality code measure nothing and wrongly "downgrade" the game. With scrambled canvas read-back, anything that analyzes pixels turns into noise (Firefox may also show a permission prompt). Run these first and skip the code that cannot work. `fx-governor` uses `timerRounded`.

## Limits
Detection is by behavior, so a future browser could round differently. `canvasReadbackOk` draws and reads one tiny canvas once.

## Prior art
Fingerprinting libraries detect these modes to identify users; this does the opposite: it detects them to keep your game working.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Apple Press](https://github.com/JNFoo/apple-press)
