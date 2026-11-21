# guess-gate

**Version 1.0.1 · API 1**

**Tested in:** node tests (7 checks, fake clock); import timing in ungoogled Chromium 156, Firefox 158, WebKitGTK 2.52.

Part of [JS-modules](../../README.md). MIT License, Copyright (c) 2026 LFC Foundry.

## What it is and how it works

A small timer for apps that show a first guess while data is still arriving. You tell it when a guess would be drawn, and it says yes only when the guesses so far, plus this one, would use no more than a set share of the import time. The import stays about as fast as with no guesses at all, and the page still shows something early. No dependencies, one file.

## Why it exists

Showing a first guess while data is still arriving (a layout of the rows read so far) feels fast, but a guess after every chunk made a simulated Sankey import 5 to 6 times slower. This keeps the guesses to a share of the time.

**Where it helps**

- A progressive import that draws something early and the final picture later.
- Any optional work that must never cost more than a set share of a longer job.

**Not for:** work that must always run, or a page that needs a picture on every chunk.

## Use

```js
var gate = GuessGate.create({ share: 0.05 });  // guesses may use up to 5% of the time so far (the default)
gate.start();                                  // the import begins
// after each piece of data (a block, a file, a chunk of rows):
gate.run(function () { drawFirstGuess(partialData); });   // true when it ran, false when it was skipped
// when everything has arrived, draw the final picture yourself, then:
var s = gate.finish();                         // { elapsed, spent, guesses, skipped, share }
```

- `GuessGate.create({ share, minMs, now })`: `share` is the largest part of the elapsed time that guesses may use (more than 0, at most 1; default 0.05). `minMs` is how long the import runs before the first guess (default 40). `now` is a clock function in ms (default `performance.now`), for tests.
- `gate.start()`: starts the clock and clears the counts; returns the gate.
- `gate.run(fn, estimateMs)`: runs `fn` only when allowed, times it, and returns `true` when it ran. `estimateMs` is what this guess will cost; it defaults to what the last guess cost (0 before the first).
- `gate.allowed(estimateMs)`: the same test without running anything.
- `gate.nextIn(estimateMs)`: milliseconds until a guess is allowed (0 when allowed now), for a timer that wakes the page.
- `gate.stats()` and `gate.finish()`: `{ elapsed, spent, guesses, skipped, share }`; `finish()` also stops further guesses.

## How it compares

Simulated progressive import of a Sankey (40 chunks of 4 ms parsing, then the final layout), total time from start to final picture, median of 5 pages (9 in Firefox) with the same page for every way, in Chromium 156, Firefox 158 and WebKitGTK 2.52.6: with no guesses 267.3, 270 and 249 ms; guessing after every chunk 1358.7, 1456.4 and 1607 ms (5 to 6 times slower); with `GuessGate` at its default 5% 254.2, 258.4 and 255 ms (within the noise of the same page against itself, about 10%). A 10% share cost WebKitGTK 8 to 12% more than no guesses, which is why the default is 5%. Details: [numbers](index.html).

## Prior art and credits

The idea of a time budget for optional work is old (frame budgets in game loops, `requestIdleCallback` deadlines); this code is LFC Foundry's own and takes no code from other projects.

## For AI agents

One file, global `GuessGate` (also `module.exports`), no dependencies. Tests: `node modules/guess-gate/test/run.js` (7 checks, fake clock).
