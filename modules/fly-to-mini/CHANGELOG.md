# fly-to-mini changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-16
New opt-in options, all off by default so nothing you use changes: `bar` takes the sticky bar as an element and follows its size; `onVisible(ratio)` is called with how much of the big element shows (0 to 1) so you can pause effects when little shows; `hysteresis` (for example 0.1) makes the element leave "away" at under 50 percent visible but come back only above 60 percent, so scrolling that stops right at the edge no longer starts flights back and forth; `keepFocus` moves keyboard focus to the button that is showing when the one with focus hides; `reducedFade` fades the arriving element in over 150 ms where the flight is skipped for reduced motion, instead of nothing; and `alert()` blinks the mini (at most once per 3.5 seconds, for 1.8 seconds). Fixed: the flying copy carried duplicate ids, and now shows canvas pictures; `destroy()` clears all timers.

## 1.1.0 · API 1 · 2026-10-16
New optional `engine: 'transition'` moves the element with the browser's View Transitions API (the same 440 ms arc, tilt and squash) and lets the browser draw it, instead of the module animating a copy every frame. The flight stays the default, and browsers without the API use it automatically; nothing existing changes. Checked in Chromium 141 (names set and cleared, the 440 ms move, the zigzag case); not yet judged by eye on a phone or in Firefox.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- Early October 2026: First version: a copy of the small stand-in flies from the big element to the sticky mini and back.
- 2026-10-15: The mini can now be hidden with `display:none` and still get a flight; a frame that throws no longer leaves the big art invisible.
- 2026-10-15: README: removed the link to the source game.
