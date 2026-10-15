# stage-curtains

Velvet stage curtains that slide shut over a page, then fly open. A scene-change transition for games and shows. About 19 KB, no images (the velvet is painted with canvas).

## Use
```html
<script src="stage-curtains.js"></script>
<script>
var curtains = StageCurtains.create({ container: document.body, color: '#b3202a' });
curtains.prepare()                    // paints the velvet in small slices of idle time: call early
  .then(function () { return curtains.close(); })    // resolves when both halves are in place
  .then(function () { /* change the scene behind the curtains */ return curtains.open(); })
  .then(function () { curtains.destroy(); });
</script>
```
Options: `container`, `color`, `seed` (changes the folds), `closeMs` (760), `openMs` (1300), `stepped` (chunky low-resolution look), `zIndex`, `width`/`height`, `maxPixelRatio` (1.25). `prepare({ hurry: true })` skips the idle waiting. Properties: `isReady`, `isClosed`, `element`.

## Why it exists
Existing curtain/transition libraries are WebGL or CSS-class based and general purpose. This one is a finished, themed transition that stays cheap on phones: painting is cut into 2.5 ms slices so it never drops a frame, and the canvases are capped at 1.25x pixel ratio.

## The bug it fixes
On Android Chrome one curtain half once stayed at its starting position while the other closed (Web Animations `fill: 'forwards'` can stall). Every slide here **writes its end position into the element itself** and has a timer as a safety net, so a stalled animation cannot leave a half out of place. The test suite cancels the animation mid-way and checks both halves still end closed.

## Limits
Needs canvas 2D, Promise and `Element.animate` (any browser since about 2020). One curtain per container. The page behind keeps running; pause your own game logic while closed if you need to.

## Prior art
Libraries such as [curtains.js](https://www.curtainsjs.com/) (WebGL planes) and general animation libraries cover effects; none that I found ship a ready, tested, hardened "theater curtain scene change".

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Apple Press](https://github.com/JNFoo/apple-press)
