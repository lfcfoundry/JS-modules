# speed-lab

**Version 1.1.0 · API 1**

**Tested in:** Node checks; Firefox 158.0 (reports 158.0b5), ungoogled Chromium 155.0.8059.39-1, WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, one at a time, in a real browser (tests/pieces-browser.js speed-lab, 2026-10-17; each passed on the final files here; WebKitGTK and GNOME Web through tools/webkit-driver). Not run: a phone, Safari

A one-button speed test for a page, run on the device that has the problem. You describe the comparison as data: steps, each measured for a few seconds (nothing moving, everything moving, everything moving with one part switched off). It runs them one after another, keeps the thing you are measuring in view and uncovered, redoes a step that was disturbed, and says the answer in plain sentences with a table you can copy and paste into a message. 21.1 KB (7.7 KB gzipped), no dependencies. Cut from Apple Press's phone speed test, with the game's own steps taken out.

**Test it:** `node tools/speed-lab/test/run.js` (12 checks on the numbers and the answer) and `node tests/pieces-browser.js` (a real run in Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6: five steps, a covering card closed and reported, an unclosable card marking steps disturbed, a page that draws no frames, a hidden page, a slow first baseline and a one-off slow load measured again). **Try it:** `demo.html` (about 20 seconds; add `#fast` to the address for 4 seconds).

## Use
```js
SpeedLab.panel({
  scene: "#play",                  // the part you are measuring (selector, element or function)
  bar: "#stickyBar",               // a bar that covers the top of the page, so its height is not counted as visible
  covers: [{ name: "the help panel", test: function () { return !help.hidden; }, close: function () { closeHelp(); } }],
  steps: [
    { id: "A", role: "baseline", label: "Nothing moving", css: "#play *{animation-play-state:paused!important}" },
    { id: "B", role: "load",     label: "Everything moving" },
    { id: "C", role: "variant",  label: "Everything moving, glow not drawn", css: ".glow{visibility:hidden!important}" },
    { id: "Z", role: "heat",     label: "Nothing moving again", css: "#play *{animation-play-state:paused!important}" }
  ]
});   // a panel at the bottom of the page: Start, progress, the answer, Run again, Copy results
```
- **Steps are data:** `id`, `label`, `role` (`baseline`: nothing going on; `load`: the thing under test; `variant`: the load with something turned off; `heat`: the baseline again at the end), `css` (added to the page for the step) and `setup(ctx)` (runs at the start of the step; may return a function, or a promise of one, that undoes it, for example to stop a flying object).
- **Each step** drops the first 1.1 s (warm-up), then records every drawn frame for 2.5 s (`warmMs`, `stepMs`; it was 4.5 s, and a slowdown of 17 ms or more per frame is caught just as often at 2.5 s). The warm-up stays long because WebKitGTK draws slowly for 1 to 2.5 s after the page's styles change. It reports frames per second, the usual frame time, the average of the slowest 5% of frames, the worst frame, **time lost** (the share of time spent on frames later than 1.5 times the usual), late frames, big stutters (over 50 ms and over 3 times the usual), the page's own long busy moments (Long Animation Frames; Chromium only, zero elsewhere) and how much of the scene was showing.
- **Safeguards, each from a bad run:** it scrolls so about half the scene (`showFraction`) shows below the sticky bar; anything in `covers` is closed before each step; a step where less than 30% of the scene showed, or a cover was on screen, is marked disturbed and redone, up to 3 tries (`tries`); `setup` undoes happen after each step; the injected style is removed at the end; a step where the page was hidden, or drew fewer than 5 frames, is marked disturbed and redone too, and a stalled page can no longer hang the run (each step gives up 1.5 s after it should have ended).
- **Two second looks, each only when needed:** if the first baseline is clearly slower than the final one it is measured again (a cold start), and if the load looks slow it is measured once more before it is blamed, so a one-off slowdown is not reported as the load's fault. The answer says when either happened (`again`, and `first` on the load step).
- **The answer** compares the load with the baseline (hurt means under 88% of the baseline's fps, or 4 points more time lost, or more than 2 extra big stutters), says which variants helped and which helped most, warns about heat (the final baseline 15% slower), a device held near 30 frames per second with nothing going on (Low Power Mode or battery saver), disturbed steps and covers it had to close, refuses to compare when a step drew almost no frames, and says plainly when the load did **not** hurt that the cost may be in the graphics chip, which frame timing cannot see. Extra warnings come from `notes` (for example "this browser rounds the clock").
- **Pieces:** `SpeedLab.run(opts)` (no panel; resolves with `{ steps, verdict, text, closed }`), `SpeedLab.stat(frameGaps)`, `SpeedLab.verdict(steps)`, `SpeedLab.report(result)`. `panel` also takes `title`, `intro`, `container` and `onDone`.
- **Keep it away from real saves:** a speed-test page is usually the game with a panel added. Put [test-isolation](../test-isolation/README.md) first on the page so the test never touches the player's saved game.

## Why
"It feels choppy on my phone" cannot be fixed by guessing. Running the same scene with parts switched off, on the phone itself, shows which part costs the frames, and the answer is a sentence a non-programmer can read. The safeguards exist because the first Apple Press run was invalid: the play area sat behind the sticky bar, so it measured something nobody could see.

## Limits
- It measures frame timing only. A page can be slow because the graphics chip is busy while every frame still arrives on time; the answer says so when it finds no stutter.
- A browser that rounds its clock for privacy (Firefox's resist-fingerprinting mode) holds frames at 60 and hides small stutters; pass a `notes` function that says so.
- Frames per second cannot go above the screen's refresh rate, and a 120 Hz phone reports 120 only when the browser lets the page draw that often.
- `css` can switch things off by hiding them or pausing animations; it cannot stop JavaScript. Use `setup` to stop work that scripts do.
- Results vary run to run (heat, other apps); the heat step is there to show it. Run it twice before trusting a small difference.
- The scene must be on the page and in the document flow so it can be scrolled into view.

## Prior art
- FPS meters such as [fps-m](https://www.npmjs.com/package/fps-m) (BSD-3-Clause, 1.1.3, 10.9 KB unpacked, "efficient and accurate FPS meter, with minimalistic UI") show a live number while you play; they do not run a comparison or give an answer.
- Browser benchmarks such as MotionMark rate the browser on fixed scenes, not your page with parts switched off.
- I found no small library that runs a page's own A/B comparison on the device and writes a verdict (one search, not exhaustive). Chrome DevTools and Firefox Profiler do far more, but need a computer attached to the phone.

## For AI agents
Define the baseline, the load and one variant per suspect part; keep each `css` to a single switch so the answer names one cause. Close or list every pop-up in `covers`. Ask the user to run it twice, leave the screen alone, and paste the copied text. Do not claim a fix from one run. Never point the page at the real saved game: use test-isolation.
