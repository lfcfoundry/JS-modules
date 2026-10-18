# stage-curtains

**Version 1.1.0 · API 1**

**Tested in:** Node checks with a fake DOM (26, 5 of them new; the 3 new curtain checks fail on 1.0.0); the comparison page in ungoogled Chromium 155.0.8059.39-1, Firefox 158.0 and WebKitGTK 2.52.6 (close, open, stalled and cancelled animations, turned window); then the repository's own suites one browser at a time: tests/run.js in ungoogled Chromium 155.0.8059.39-1 (29 pass), tests/firefox.js in Firefox 158.0 (5 pass), and in WebKitGTK 2.52.6 the piece, demo and same-answers suites (all pass); close and open of the curtain also ran in WebKitGTK 2.52.6 and GNOME Web 46.5 without errors. Not run: a phone.

Velvet stage curtains that slide shut over a page, then fly open. A scene-change transition for games and shows. About 29 KB, no images (the velvet is painted with canvas).

`prepare()` paints the velvet onto canvas in small slices of idle time, one canvas for each half. `close()` slides the two halves shut over the container with the browser's Web Animations, and `open()` parts them and zooms the whole thing away. Each slide writes its end position into the element itself and has a timer as a safety net, and every method returns a promise that always resolves, so your scene change is never blocked.

## Why it exists

A game or show that changes scenes needs something to hide the swap, and a theater curtain fits a stage look. The built-in View Transitions API makes the page wait on your update callback, which is awkward for a game still running behind it, and no ready curtain with fallbacks for stalled animations turned up (see "How it compares"). This module paints a themed curtain and leaves the page running.

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
| `warmMs` | 2500 | How long `close()` may take to finish painting a little each frame when the velvet is not ready yet; after that the rest is painted at once. `0` paints it all at once straight away (the way 1.0.0 did). |

- `prepare(opts)` paints the velvet in slices (`sliceMs` 2.5, `restMs` 45) during idle time. `prepare({ hurry: true })` paints at once. A page that is busy every frame never reports an idle moment; the browser then hands over a turn after 250 ms, and that turn paints a slice twice as long (5 ms). `close()` works without `prepare()`: if the velvet is not ready, `close()` paints a little (4 ms) each frame for up to `warmMs`, so the page keeps moving, and then finishes the rest at once. If the container or window has a different size than at `prepare()` (the phone was turned), the velvet is painted again for the new size.
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

## How it compares
No open-source, ready, tested "theater curtain scene change" with fallbacks for stalled animations turned up; the nearest real alternatives are the built-in View Transitions API (no code to ship, but the page waits on it) and the curtain code inside Apple Press, which is a little smaller and about as fast but is not a reusable module.

| Alternative | Size (smaller is better) | Speed in browsers (faster is better) | Features | Where it wins / loses |
|---|---|---|---|---|
| View Transitions API (built in; Chrome 111+, Firefox 144+) | 0 bytes | not measured | page snapshot wipe; you draw the curtain yourself with pseudo-elements | Wins: nothing to ship. Loses: the page waits while your update callback runs, awkward for a game still ticking behind. |
| Motion `curtains()` ([motion.dev](https://motion.dev/docs/curtains); paid Motion+ membership; version not read) | not measured | not measured | wipe, iris, blinds, fade; not a theater look | Wins on variety of wipes. Loses: paid, and no velvet curtain. |
| [GSAP](https://gsap.com/community/standard-license/) (own free license, not open source); version not read | not measured | not measured | general timeline engine | Wins: powerful timelines. Loses: you still draw the velvet. |
| [curtains.js](https://github.com/martinlaxenaire/curtainsjs) (MIT); version not read | not measured | not measured | WebGL image planes; unrelated purpose | Not a real alternative, only the same name. |
| Curtain code inside Apple Press build 2026.10.17.0128 (private game source, not a library) | 4,923 bytes gzipped, 11,980 minified, with its 12 style lines (terser 5.51.2; leaves out a few small game helpers it uses) | ready ahead on a busy test page: 0.85 s in ungoogled-chromium 155.0.8059.39-1, 1.10 s in Firefox 158.0; longest freeze on a cold close: 15 ms, 15 ms, 12 ms in Chromium, Firefox, WebKitGTK 2.52.6 | built into the game: no public API; its curtains are skipped in its calm and lite modes | Wins on size (about 13% fewer gzipped bytes than this module). Loses: not reusable. |
| **stage-curtains 1.1.0** | 14,062 bytes minified, 5,672 gzipped (30,548 as written; terser 5.51.2) | ready ahead on the same busy test page: 1.0 s in Chromium, 0.6 s in Firefox (3.6 and 5.7 times faster than 1.0.0); quiet page 0.23 to 0.30 s; longest freeze on a cold close: 16 ms, 13 ms, 13 ms in Chromium, Firefox, WebKitGTK | public API, calm mode and inert page, any color string, interrupting a close, stalled-animation safety timers | see below |

Where it loses:
- About 15% larger gzipped than Apple Press's own curtain code (5,672 against 4,923 bytes; smaller is better).
- Not faster everywhere: ready-ahead on a busy page takes 1.0 s against 0.85 s for Apple Press in Chromium (Apple Press ahead), but 0.6 s against 1.10 s in Firefox (this module ahead); the cold-close freezes are about equal.
- A cold close starts later when the processor is slow (324 ms instead of 128 ms before the first piece moves with the processor slowed 4 times in Chromium).
- A page that always leaves only 4 to 5 ms of quiet is a shared weakness: none of the tested versions finished painting ahead in 8 seconds in Chromium or Firefox.
- The valance is painted at a pixel ratio of at most 1.25, so it is less sharp on high-density phones than Apple Press's (cap 2).
- Only the first screen of a scrolled page is covered; not run on a phone.
- Not measured: speed of the other alternatives in any browser, and their sizes.

## Limits
- Needs canvas 2D, Promise and `Element.animate` (any browser since about 2020). One curtain per container.
- **Size is measured at `prepare()` and checked again at `close()`.** If the size changed in between, the velvet is painted again (a little each frame, so it costs up to `warmMs` of waiting instead of being instant). A size change while `prepare()` is still painting is not noticed: prepare late enough that the size is final.
- **Only the first screen of a scrolled page is covered.** The curtain is `position: absolute` inside the container, so with `document.body` as the container and a scrolled page it sits at the top of the page, not on the current view. It suits games and apps that do not scroll. For a scrolling page, give it a fixed-size container.
- The page behind keeps running; pause your own game logic while closed if you need to.
- Painting is cut into small slices, but the last step of each half and the mirror copy run in one go, so "never drops a frame" is a goal, not a measurement.
- Each scene change repaints the velvet from scratch (the finished canvases are kept until the next `prepare()` or `destroy()`).
- Without `requestIdleCallback` (Safari ships it switched off) a timer stands in and painting takes somewhat longer in total; it still happens in short slices.
- Tested with a fake DOM in Node (`test/run.js`) and in Chromium with the demo. Firefox and phones are not covered by the Node checks.

## Prior art and credits
- **View Transitions API** (built in; Chrome 111+, Firefox 144+): the browser snapshots the page and animates old to new. A curtain wipe can be made with its pseudo-elements, but the page waits while your update callback runs, which is awkward for a game still ticking behind. This module paints a themed curtain and leaves the page running.
- **Motion `curtains()`** ([motion.dev](https://motion.dev/docs/curtains)): wipe, iris, blinds and fade transitions; not a theater look, and it is part of the paid Motion+ membership.
- [GSAP](https://gsap.com/community/standard-license/) is a general timeline engine under its own license (free, not open source); you would still have to draw the velvet.
- [curtains.js](https://github.com/martinlaxenaire/curtainsjs) (MIT) is WebGL image planes: the same name, an unrelated purpose. CSS-only theater curtain demos exist but only open on hover and have no scene-change logic.
I found no open-source, ready, tested "theater curtain scene change" with fallbacks for stalled animations.

Credits, what was taken from others:
- The velvet painting and the first version of the slide logic came from the games Apple Press and Fancy, the Banana (same maker, LFC Foundry).
- Four ideas in 1.1.0 (a forced turn after 250 ms with a 5 ms slice, painting a little each frame on a cold close, painting again after a turned phone, ending when the last animation is cancelled) were taken from Apple Press's own curtain code; same maker, no outside code.
- View Transitions API, Motion `curtains()`, GSAP and curtains.js: compared only; idea only, no code.
No code from others; the ideas above are theirs.

## For AI agents
- Copy `stage-curtains.js` (keep the MIT header). No dependencies. It can be `require`d in Node; nothing touches `document` until `create()` and `prepare()` run.
- Call `prepare()` early (at load or when a level starts), then `close()`, change the scene, `open()`, `destroy()`. Always chain with `.then`; nothing rejects.
- Do not add your own reduced-motion check; the module has one (override with `reducedMotion`). Do not wrap it in a timer; the safety timers are inside.
- Do not call `animation.cancel()` on the curtain elements yourself, and do not remove `style.transform` from them: the module writes the end positions there.
- Node checks: `node modules/stage-curtains/test/run.js`. Browser checks for this module are in `tests/run.js`. The demo is `demo.html`.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
