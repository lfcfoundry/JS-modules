# stage-curtains

Velvet stage curtains that slide shut over a page, then fly open. A scene-change transition for games and shows. About 29 KB, no images (the velvet is painted with canvas).

## Quick start
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

## API
`StageCurtains.create(options)` returns `{ prepare, close, open, destroy, isReady, isClosed, element }`. None of the methods rejects.

| Option | Default | What it does |
|---|---|---|
| `container` | `document.body` | The element the curtain covers. |
| `color` | `#b3202a` | Cloth color. See "Colors" below. |
| `seed` | 11 | Changes the folds. |
| `closeMs` / `openMs` | 760 / 1300 | Length of the slide shut and of the fly-open. |
| `stepped` | false | Chunky low-resolution look (painted at one third size and shown with `image-rendering: pixelated`). |
| `zIndex` | 2147483000 | Stacking order of the curtain. |
| `width` / `height` | container size | Size to paint, in CSS pixels. |
| `maxPixelRatio` | 1.25 | Cap on canvas pixels per CSS pixel. |
| `reducedMotion` | follows the system | `true` forces calm mode, `false` forces the full motion. |
| `lockPage` | calm mode only | `true` always makes the page behind inert while closed; `false` never does. |

- `prepare(opts)` paints the velvet in slices (`sliceMs` 2.5, `restMs` 45) during idle time. `prepare({ hurry: true })` paints at once. `close()` always hurries, so calling it without `prepare()` still works.
- `close()` slides the curtain shut and resolves when both halves are in place. Calling it again while it runs gives the same promise, which resolves at the same moment.
- `open({ flythrough: false })` parts the halves; by default the whole curtain also grows and fades, as if the camera flew through. It may be called while the curtain is still closing: the halves turn around from where they are, with no jump. A second `open()` returns the running one.
- `destroy()` removes the curtain at once; a running `prepare()`, `close()` or `open()` still resolves.

**If the curtain cannot be painted** (no canvas 2D, out of memory, an error while painting) `prepare()`, `close()` and `open()` still resolve and no curtain is shown, so a scene change is never blocked. Check `isReady` if you need to know.

### Calm mode
When the system asks for reduced motion, the curtain fades in and out in about a third of a second instead of sliding shut and zooming open. While it is closed, the curtain has `aria-hidden="true"` (it has that in every mode) and, in calm mode, every element that was in the container when it closed gets the `inert` attribute (no clicks, no Tab, hidden from screen readers), removed again when the curtain is gone or destroyed. Elements you add behind the curtain during the scene change are not made inert. Set `lockPage: true` to get the inert page in normal mode too; it is off by default there because it would stop clicks on your own buttons while the curtain slides. Focus inside an element that becomes inert is lost.

### Colors
`color` accepts `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (alpha ignored), `rgb()` and `rgba()` with numbers or percentages. Other forms (names such as `red`, `hsl(...)`) are turned into a color by the browser's canvas when one is available. CSS variables like `var(--x)` are not resolved: pass the value. Anything that cannot be understood falls back to the default red. The velvet is shaded from this color, so very dark, orange, yellow and pale colors are adjusted a little to still look like cloth.

## The bug it fixes
On Android Chrome one curtain half once stayed at its starting position while the other closed (Web Animations `fill: 'forwards'` can stall). Every slide here **writes its end position into the element itself** and has a timer as a safety net, so a stalled animation cannot leave a half out of place. The finished animation is **not cancelled** afterward: cancelling it made the right half jump a hair on a phone (measured in a game in Chromium; phone confirmation pending). The browser test suite cancels an animation mid-way and checks both halves still end closed.

## Limits
- Needs canvas 2D, Promise and `Element.animate` (any browser since about 2020). One curtain per container.
- **Size is measured at `prepare()`.** If the window is rotated or resized before `close()`, there can be a gap or overlap in the middle. Call `prepare()` again on a new `create()` after a resize, and prepare late enough that the size is final.
- **Only the first screen of a scrolled page is covered.** The curtain is `position: absolute` inside the container, so with `document.body` as the container and a scrolled page it sits at the top of the page, not on the current view. It suits games and apps that do not scroll. For a scrolling page, give it a fixed-size container.
- The page behind keeps running; pause your own game logic while closed if you need to.
- Painting is cut into small slices, but the last step of each half and the mirror copy run in one go, so "never drops a frame" is a goal, not a measurement.
- Each scene change repaints the velvet from scratch (the finished canvases are kept until the next `prepare()` or `destroy()`).
- Without `requestIdleCallback` (Safari ships it switched off) a timer stands in and painting takes somewhat longer in total; it still happens in short slices.
- Tested with a fake DOM in Node (`test/run.js`) and in Chromium with the demo. Firefox and phones are not covered by the Node checks.

## Prior art
- **View Transitions API** (built in; Chrome 111+, Firefox 144+): the browser snapshots the page and animates old to new. A curtain wipe can be made with its pseudo-elements, but the page waits while your update callback runs, which is awkward for a game still ticking behind. This module paints a themed curtain and leaves the page running.
- **Motion `curtains()`** ([motion.dev](https://motion.dev/docs/curtains)): wipe, iris, blinds and fade transitions; not a theater look, and it is part of the paid Motion+ membership.
- [GSAP](https://gsap.com/community/standard-license/) is a general timeline engine under its own license (free, not open source); you would still have to draw the velvet.
- [curtains.js](https://github.com/martinlaxenaire/curtainsjs) (MIT) is WebGL image planes: the same name, an unrelated purpose. CSS-only theater curtain demos exist but only open on hover and have no scene-change logic.
I found no open-source, ready, tested "theater curtain scene change" with fallbacks for stalled animations.

## For AI agents
- Copy `stage-curtains.js` (keep the MIT header). No dependencies. It can be `require`d in Node; nothing touches `document` until `create()` and `prepare()` run.
- Call `prepare()` early (at load or when a level starts), then `close()`, change the scene, `open()`, `destroy()`. Always chain with `.then`; nothing rejects.
- Do not add your own reduced-motion check; the module has one (override with `reducedMotion`). Do not wrap it in a timer; the safety timers are inside.
- Do not call `animation.cancel()` on the curtain elements yourself, and do not remove `style.transform` from them: the module writes the end positions there.
- Node checks: `node modules/stage-curtains/test/run.js`. Browser checks for this module are in `tests/run.js`. The demo is `demo.html`.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
