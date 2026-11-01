# env-probes

**Version 1.1.0 · API 1**

**Tested in:** Node checks; tests/pieces-browser.js env-probes (the demo page loads, report() sees a page, canvas read-back and storage work, explain() gives sentences) one browser at a time on 2026-10-17: ungoogled Chromium 155.0.8059.39-1, Firefox 158.0 (reports 158.0b5), WebKitGTK 2.52.6, all passed. Not run: Firefox privacy-profile test, a phone.

## What it is and how it works

Tiny checks for browsers that quietly change what a page can do. About 5.4 KB gzipped (4.3 KB minified and gzipped), no dependencies, never throws.

- It tests real behavior instead of reading the browser name: clock steps, canvas read-back, storage, media queries.
- Results are plain values, and `explain()` turns them into short sentences.
- Works in a page, a Worker or Node.

## Why it exists

Privacy browsers round the clock and scramble canvas pixels, so frame meters and pixel analysis turn into noise. Checking first lets a page skip code that cannot work there.

**Where it helps**

- Turning off frame meters when the clock is rounded.
- Skipping pixel analysis when canvas read-back is scrambled.
- A one-button device check page for testers.

**Not for:** browser detection by name; a future browser could round or add noise differently.

## The calls

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

## How it compares
I found no library that does this exact job. The nearest are fingerprinting libraries that look for the same browser modes for the opposite reason, so this is a small, game-focused check next to larger, broader tools.

| Alternative | Size (smaller is better) | Speed (faster is better) | Features | Where it wins / loses |
| --- | --- | --- | --- | --- |
| **env-probes 1.1.0** (this module, MIT) | 10,969 B minified, 4,387 B gzipped (terser 5.36.0) | First call of all 13 probes, lower is faster, median of 9 fresh page loads: ungoogled Chromium 155.0.8059.39-1 5.0 ms, Firefox 158.0 4.0 ms, WebKitGTK 2.52.6 3.0 ms 3.0 ms. Calling `report()` again: 0.02 to 0.07 ms (cached). Firefox and WebKit clocks show whole milliseconds, so small numbers are rough | Rounded clock, canvas read-back, storage, motion, touch, contrast, framing, feature list, plain-words `explain()` | Tells you the effect so your game keeps working. Loses: does not name the mode |
| [CreepJS](https://github.com/abrahamjuliot/creepjs) (MIT, version not recorded) | Not measured | Not measured | Browser fingerprinting; detects privacy modes to identify users | Wins: can name the mode. Loses: built to identify users, not to keep a game working |
| [detectIncognito](https://github.com/Joe12387/detectIncognito) (MIT, version not recorded) | Not measured | Not measured | Guesses whether the window is private | Wins: names the mode. Loses: a mode guess does not say what your page can still do |
| [detect-gpu](https://github.com/pmndrs/detect-gpu) (MIT, version not recorded) | Not measured | Not measured | Rates the graphics chip | A different question: it says how fast the chip is, not what the browser has switched off |
| Hand-written check (MDN `storageAvailable` pattern, `matchMedia`) | A few lines per check | Not measured | One question each, for example "can I save" | Wins: nothing to copy in for one check. Loses: you write and test every probe yourself, and clock and canvas checks are not in MDN's pattern |

**Where it loses**
- Detection is by behavior, so a future browser could round or add noise differently.
- The clock check cannot tell a rounded clock from a very slow device (both count as rounded, the safe answer).
- Noise detection depends on the browser changing the pixels this module draws; a browser that only noises very large canvases could pass.
- `prefers-reduced-transparency` is Chrome and Edge 118+ only so far; elsewhere the answer is `false`.
- The Safari 26 canvas-noise claim comes from a secondary source and is untested on a real iPhone. Not run: the Firefox privacy-profile test, a phone.
- Not measured: sizes and speeds of the alternatives; speed on a phone.

## Limits
Detection is by behavior, so a future browser could round differently or add noise differently. The clock check cannot tell a rounded clock from a very slow device that never saw a step in 30,000 reads (both count as rounded, which is the safe answer). Noise detection depends on the browser changing the pixels this module draws; a browser that only noises very large canvases could pass. Contrast and reduced-motion answers are only as good as the browser's media-query support (`prefers-contrast` works in all three engines; `prefers-reduced-transparency` is Chrome and Edge 118+ only so far, and the answer is `false` elsewhere). The Safari 26 claim that canvas read-back always carries noise comes from a secondary source and has not been tested on a real iPhone. `fx-governor` does not use `timerRounded`: it averages frames over seconds, which a rounded clock barely disturbs.

## Quick start
Open `demo.html` (the device check page), press the button, and copy the report. In code: `var r = EnvProbes.report(); if (r.canvasReadback !== 'ok') skipPixelAnalysis();`.

## See it in action

Used right now in Netflow Map (its repository is private, so there is no link). Checked in each app's shipped file on its main branch on 2026.10.29. The module's own page is `demo.html` in this folder.

## Prior art and credits
- [CreepJS](https://github.com/abrahamjuliot/creepjs) (MIT) and [detectIncognito](https://github.com/Joe12387/detectIncognito) (MIT): read as prior art for spotting these modes; this module detects the effect, not the mode. Ideas only, no code.
- [detect-gpu](https://github.com/pmndrs/detect-gpu) (MIT): rates the graphics chip, a different question. Nothing taken.
- MDN's `storageAvailable` pattern (MDN code examples are public domain, CC0): the storage check and its "quota error with data already stored means full" rule follow it. Pattern followed; the code here is written for this module.
- Browser behavior it relies on, as facts: Firefox "resist fingerprinting" rounds the clock to about 16.67 ms, Tor-style setups to 100 ms, and Tor Browser asks permission on canvas read-back. The Safari 26 canvas-noise claim comes from a secondary source that this README does not name; it is untested.
- terser 5.36.0 (BSD-2-Clause) was used only to measure the minified size; it is not part of the module.

No code from others; the ideas above are theirs.

## For AI agents
- Load `env-probes.js` (UMD: `EnvProbes` global or `require`). Call `EnvProbes.explain()` to get sentences you can show in a help screen, or `EnvProbes.report()` for raw values.
- Do not run pixel-analysis code unless `canvasReadback() === 'ok'`. Do not trust sub-frame timings when `timerRounded()` is true.
- Keep old calls working: `timerRounded`, `canvasReadbackOk`, `storageWorks`, `reducedMotion`, `coarsePointer`, `report` return the same types as before.
- Tests: `node modules/env-probes/test/run.js` (fake window, document, navigator, performance and storage). `_env(fakes)` and `_reset()` exist for tests only.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
