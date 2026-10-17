# fly-to-mini changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-16
New options, all off unless you ask, so a 1.1.0 copy can be swapped for this one. (1) `bar`: give it your sticky bar and the module measures its height and follows it when it changes, instead of you guessing a pixel number (the old default of 130 px suited one game; the demo needed 56). (2) `onVisible` and `steps`: tells your page how much of the big element shows, from 0 to 100 percent, so a game can pause effects when little is on screen. (3) `hysteresis`: with 0.1 the mini goes away at under 50% visible but comes back only above 60%, so scrolling right at the edge no longer starts flights back and forth. (4) `keepFocus`: keyboard focus moves to whichever button is showing when the other hides (before, it was lost). (5) `reducedFade`: where the flight is skipped for reduced motion, the arriving button fades in over 0.15 seconds instead of just appearing. (6) `alert()`: makes the mini blink at most once every 3.5 seconds, for 1.8 seconds, only while it is showing. Two fixes for everyone: the flying copy no longer carries duplicate ids and now shows canvas pictures, and `destroy()` now clears the pop timers it used to leave running for 0.4 seconds. Cost: 5.2 KB to 7.4 KB minified (3.1 KB gzipped, up from 2.2 KB). Checks: 20 to 33 (all pass); the demo ran clean in Chromium 141, 153 and Firefox 157.

## 1.1.0 · API 1 · 2026-10-16
New optional `engine: 'transition'` moves the element with the browser's View Transitions API (the same 440 ms arc, tilt and squash) and lets the browser draw it, instead of the module animating a copy every frame. The flight stays the default, and browsers without the API use it automatically; nothing existing changes. Checked in Chromium 141 (names set and cleared, the 440 ms move, the zigzag case); not yet judged by eye on a phone or in Firefox.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- Early October 2026: First version: a copy of the small stand-in flies from the big element to the sticky mini and back.
- 2026-10-15: The mini can now be hidden with `display:none` and still get a flight; a frame that throws no longer leaves the big art invisible.
- 2026-10-15: README: removed the link to the source game.
