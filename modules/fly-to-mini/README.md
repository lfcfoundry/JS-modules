# fly-to-mini

When a big element scrolls away, a copy of its small stand-in **flies** from it to the sticky mini version, and back again when you scroll up. A shared-element transition for scrolling, with an arc, a tilt and a squash. About 5 KB.

```js
var fly = FlyToMini.create({
  big: document.querySelector('#apple'),         // watched with IntersectionObserver
  mini: document.querySelector('#miniButton'),   // small sticky version, hidden until `on`
  onChange: function (on) { bar.classList.toggle('mini-on', on); }
});
```
Options: `art` (element to measure, default `big`), `host` (where the flying copy lives), `canAnimate()` (return false for reduced motion), `downMs` (440), `upMs` (400), `arc` (18 px).

## Details that took real bugs to find
- The flying copy is drawn in a **fixed layer on the page**, not inside a section the browser may skip (`content-visibility`, hidden tabs); the first version was invisible on the way down.
- A flight cut short by scrolling back starts the next one where the last one stopped.
- If the window becomes wide and the mini disappears, the flight ends at once.

## Limits
One pair of elements per instance. The mini's first child is cloned for the flight, so give it a self-contained look.

## Prior art
FLIP and View Transitions API cover element-to-element moves on state change; neither is driven by scroll position or handles a sticky target that appears and disappears.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Apple Press](https://github.com/JNFoo/apple-press)
