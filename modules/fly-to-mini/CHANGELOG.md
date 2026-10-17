# fly-to-mini changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-16
New opt-in options: pass the sticky bar as an element (it follows the bar's size), a visible-amount callback, hysteresis so scrolling at the edge stops flip-flopping, keyboard focus follows the visible button, a short fade under reduced motion, and a blink method for the mini. The flying copy no longer has duplicate ids and now shows canvas pictures. destroy() clears all timers.

## 1.1.0 · API 1 · 2026-10-16
New optional `engine: 'transition'` uses the browser's View Transitions API for the move (with the same arc, tilt and squash). The flight is still the default, and browsers without the API use it automatically. Nothing existing changes. Not yet judged by eye on a phone or in Firefox.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- Early October 2026: First version: a copy of the small stand-in flies from the big element to the sticky mini and back.
- 2026-10-15: The mini can now be hidden with `display:none` and still get a flight; a frame that throws no longer leaves the big art invisible.
- 2026-10-15: README: removed the link to the source game.
