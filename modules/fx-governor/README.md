# fx-governor

Steps visual effects down by itself when the device cannot keep up, and **never steps back up behind the player's back**. About 3 KB.

```js
var gov = FxGovernor.create({ levels: ['full', 'lite', 'calm'],
  onChange: function (level) { document.body.dataset.fx = level; } });
gov.start();                 // own requestAnimationFrame loop, or call gov.frame(t) from yours
gov.choose('full');          // the player picked a level: the governor stops adjusting
```
Options: `windowMs` (3000), `minFps` (36), `strikes` (2 windows in a row), `gapMs` (250), `start`, `maxAuto` (lowest level it may reach by itself; the last level is left for the player).

## How it differs
Many "adaptive quality" snippets react to a single slow frame. This one averages over a window, needs repeated misses, and **ignores pauses**: a hidden tab or a gap longer than `gapMs` restarts counting, so switching apps is never blamed on the device. It stays out of the way when the browser rounds timers (see `env-probes`).

## Limits
Measures frame rate only, not memory or battery. You decide what each level means in CSS or code.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Apple Press](https://github.com/JNFoo/apple-press)
