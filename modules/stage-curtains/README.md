# stage-curtains

**Version 1.2.0 · API 1**

**Tested in:** Node checks with a fake DOM (37, 11 of them new: 112 curtains and 300 random curtains identical in JavaScript and WebAssembly, sliced painting, no WebAssembly, a failing module, memory that cannot grow, rebuild checks); tests/stage-curtains-wasm-browser.js one browser at a time, three passes of seven fresh pages each, in ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5: 112 curtains, 0 pixels differ in all 12 runs, also on a page without the wasm permission. Not run: a phone, Safari.

Velvet stage curtains that slide shut over a page, then fly open. A scene-change transition for games and shows. About 37 KB (about 2 KB of it is the embedded WebAssembly painter), no images (the velvet is painted with canvas).

`prepare()` paints the velvet onto canvas in small slices of idle time, one canvas for each half. `close()` slides the two halves shut over the container with the browser's Web Animations, and `open()` parts them and zooms the whole thing away. Each slide writes its end position into the element itself and has a timer as a safety net, and every method returns a promise that always resolves, so your scene change is never blocked.

## Why it exists

A game or show that changes scenes needs something to hide the swap, and a theater curtain fits a stage look. The built-in View Transitions API makes the page wait on your update callback, which is awkward for a game still running behind it, and no ready curtain with fallbacks for stalled animations turned up. This module paints a themed curtain and leaves the page running.

## Use

Copy `stage-curtains.js` (keep the MIT header); `demo.html` shows it working. Node checks (fake DOM): `node modules/stage-curtains/test/run.js`; browser checks for this module are in `tests/run.js`.

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
| `color` | `#b3202a` | Cloth color (see below). |
| `seed` | 11 | Changes the folds. |
| `closeMs` / `openMs` | 760 / 1300 | Length of the slide shut and of the fly-open. |
| `stepped` | false | Chunky low-resolution look (painted at one third size, shown pixelated). |
| `zIndex` | 2147483000 | Stacking order. |
| `width` / `height` | container size | Size to paint, in CSS pixels. |
| `maxPixelRatio` | 1.25 | Cap on canvas pixels per CSS pixel. |
| `reducedMotion` | follows the system | `true` forces calm mode, `false` forces full motion. |
| `lockPage` | calm mode only | `true` always makes the page behind inert while closed; `false` never does. |
| `wasm` | true | `false` always paints with plain JavaScript; otherwise the small WebAssembly painter is used when the browser allows it (see below). |
| `warmMs` | 2500 | How long `close()` may take to finish painting a little each frame when the velvet is not ready; then the rest is painted at once. `0` paints it all at once straight away (as 1.0.0 did). |

- `prepare(opts)` paints in slices (`sliceMs` 2.5, `restMs` 45) during idle time; `prepare({ hurry: true })` paints at once. A page busy every frame never reports an idle moment; the browser then hands over a turn after 250 ms, which paints a 5 ms slice. If the container or window has a different size than at `prepare()` (the phone was turned), the velvet is painted again.
- `close()` slides the curtain shut and resolves when both halves are in place; it works without `prepare()` (it paints 4 ms per frame for up to `warmMs`, then finishes at once). Calling it again while it runs gives the same promise.
- `open({ flythrough: false })` parts the halves; by default the whole curtain also grows and fades. It may be called while the curtain is still closing: the halves turn around from where they are, with no jump. A second `open()` returns the running one.
- `destroy()` removes the curtain at once; a running `prepare()`, `close()` or `open()` still resolves.
- If the curtain cannot be painted (no canvas 2D, out of memory, an error) the methods still resolve and no curtain is shown. Check `isReady` if you need to know.
- **Calm mode.** When the system asks for reduced motion, the curtain fades in and out in about a third of a second. While closed, it has `aria-hidden="true"` (in every mode) and, in calm mode, every element that was in the container when it closed gets `inert` (no clicks, no Tab, hidden from screen readers), removed again when the curtain is gone. Elements added behind the curtain during the scene change are not made inert. `lockPage: true` gives the inert page in normal mode too; focus inside an element that becomes inert is lost.
- **Colors.** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (alpha ignored), `rgb()` and `rgba()` with numbers or percentages; other forms (`red`, `hsl(...)`) are turned into a color by the browser's canvas when available. `var(--x)` is not resolved: pass the value. Anything not understood falls back to the default red. Very dark, orange, yellow and pale colors are adjusted a little to still look like cloth.

## WebAssembly velvet loop (since 1.2.0)

**What.** The pixel loop that paints the velvet (the hot part of `prepare()`) also exists as a 1,510-byte WebAssembly function, embedded in `stage-curtains.js`. It paints the same pixels, 16 rows at a time, and `StageCurtains.wasmAvailable()` says whether the browser lets it run. The painter reports `engine` as `'wasm'` or `'js'`.

**Why.** On a freshly loaded page one phone-size curtain half (295,475 pixels) paints about 1.4 to 1.6 times as fast: 23.9 to 17.0 ms in Chromium 155, 23.0 to 14.0 ms in Firefox 158.0, 24.0 to 17.0 ms in WebKitGTK 2.52.6 and 30.0 to 21.0 ms in GNOME Web 46.5 (median of three passes of seven fresh pages; lower is better). The picture is identical: 112 curtains, 0 pixels differ in all four browsers, and the same on a page that forbids WebAssembly.

**Rules.**
- Add `'wasm-unsafe-eval'` to `script-src` if your page has a Content Security Policy. Without it the module quietly paints with plain JavaScript (same picture, no speed-up). No other loosening is needed.
- `create({ wasm: false })` forces the plain JavaScript loop. If the WebAssembly part fails for any reason, the plain loop finishes the remaining rows.
- Each `step()` still stops between 16-row chunks, so the slowest single slice stays at 4 to 5 ms in every browser (no change, no loss).
- Costs bytes: +3,923 minified and +2,038 gzipped (smaller is better; 15,353 to 19,276 and 6,275 to 8,313).

**Honest limits.** The first paint is the win. A repeat paint in the same page gains little (1.0 to 1.36x), the slowest slice and the frame rate do not change, and the gain on a phone is an estimate, not a measurement (no phone or Safari run). The valance texture (`curtainTexture`, `addPile`) stays plain JavaScript.

**Rebuild.** `wasm/velvet.c` is the source; `wasm/build.sh` rebuilds `velvet.wasm` and `wasm/embed.py` writes it into `stage-curtains.js`. Both have `--check` to prove the committed files match.

## The bug it fixes

On Android Chrome one curtain half once stayed at its starting position while the other closed (Web Animations `fill: 'forwards'` can stall). Every slide here writes its end position into the element itself and has a timer as a safety net. The finished animation is **not cancelled** afterward: cancelling it made the right half jump a hair on a phone (measured in a game in Chromium; phone confirmation pending). The browser test suite cancels an animation mid-way and checks both halves still end closed.

## How it compares

No open-source, ready, tested "theater curtain scene change" with fallbacks for stalled animations turned up; the nearest real alternatives are the built-in View Transitions API (no code to ship, but the page waits on it) and the curtain code inside Apple Press, which is a little smaller and about as fast but is not a reusable module.

| Alternative | Size (smaller is better) | Speed (faster is better) | Where it wins / loses |
|---|---|---|---|
| View Transitions API (built in; Chrome 111+, Firefox 144+) | 0 bytes | not measured | Wins: nothing to ship. Loses: the page waits while your update callback runs; you draw the curtain yourself with pseudo-elements. |
| Motion `curtains()` ([motion.dev](https://motion.dev/docs/curtains); paid Motion+ membership; version not read) | not measured | not measured | Wins on variety of wipes (wipe, iris, blinds, fade). Loses: paid, and no velvet curtain. |
| [GSAP](https://gsap.com/community/standard-license/) (own free license, not open source); version not read | not measured | not measured | Wins: powerful timelines. Loses: you still draw the velvet. |
| [curtains.js](https://github.com/martinlaxenaire/curtainsjs) (MIT); version not read | not measured | not measured | Not a real alternative: WebGL image planes, only the same name. |
| Curtain code inside Apple Press build 2026.10.17.0128 (private game source, not a library) | 4,923 bytes gzipped, 11,980 minified, with its 12 style lines (terser 5.51.2; leaves out a few small game helpers it uses) | ready ahead on a busy test page: 0.85 s in ungoogled-chromium 155.0.8059.39-1, 1.10 s in Firefox 158.0; longest freeze on a cold close: 15 ms, 15 ms, 12 ms in Chromium, Firefox, WebKitGTK 2.52.6 | Wins on size (about 13% fewer gzipped bytes). Loses: no public API, not reusable; its curtains are skipped in its calm and lite modes. |
| **stage-curtains 1.2.0** | 19,276 bytes minified, 8,313 gzipped (36,953 as written; terser 5.51.2; 1.1.0 was 14,062 and 5,672 plus 30,548 as written, before the WebAssembly painter) | ready ahead on the same busy test page: 1.0 s in Chromium, 0.6 s in Firefox (3.6 and 5.7 times faster than 1.0.0; measured on 1.1.0); first paint of one phone-size half 1.4 to 1.6 times faster with WebAssembly; quiet page 0.23 to 0.30 s; longest freeze on a cold close: 16 ms, 13 ms, 13 ms in Chromium, Firefox, WebKitGTK | Public API, calm mode and inert page, any color string, interrupting a close, stalled-animation safety timers. |

Where it loses:
- About 69% larger gzipped than Apple Press's own curtain code (8,313 against 4,923 bytes; smaller is better), because of the WebAssembly painter; 1.1.0 was 15% larger.
- Not faster everywhere: ready-ahead on a busy page takes 1.0 s against 0.85 s for Apple Press in Chromium (Apple Press ahead), but 0.6 s against 1.10 s in Firefox (this module ahead); the cold-close freezes are about equal.
- A cold close starts later when the processor is slow (324 ms instead of 128 ms before the first piece moves with the processor slowed 4 times in Chromium).
- A page that always leaves only 4 to 5 ms of quiet is a shared weakness: none of the tested versions finished painting ahead in 8 seconds in Chromium or Firefox.
- The valance is painted at a pixel ratio of at most 1.25, so it is less sharp on high-density phones than Apple Press's (cap 2).
- Not measured: speed of the other alternatives in any browser, and their sizes.

## What it is not

- Needs canvas 2D, Promise and `Element.animate` (any browser since about 2020). One curtain per container.
- **Only the first screen of a scrolled page is covered.** The curtain is `position: absolute` inside the container, so with `document.body` and a scrolled page it sits at the top of the page, not on the current view. It suits games and apps that do not scroll; for a scrolling page, give it a fixed-size container. Not run on a phone.
- Size is measured at `prepare()` and checked again at `close()`; if it changed, the velvet is painted again (up to `warmMs` of waiting). A size change while `prepare()` is still painting is not noticed: prepare late enough that the size is final.
- The page behind keeps running; pause your own game logic while closed if you need to.
- Painting is cut into small slices, but the last step of each half and the mirror copy run in one go, so "never drops a frame" is a goal, not a measurement.
- Each scene change repaints the velvet from scratch (finished canvases are kept until the next `prepare()` or `destroy()`).
- Without `requestIdleCallback` (Safari ships it switched off) a timer stands in and painting takes somewhat longer in total, still in short slices.
- Tested with a fake DOM in Node and in the browsers listed above; Firefox and phones are not covered by the Node checks.

## For AI agents

- Copy `stage-curtains.js` (keep the MIT header). No dependencies. It can be `require`d in Node; nothing touches `document` until `create()` and `prepare()` run.
- Call `prepare()` early (at load or when a level starts), then `close()`, change the scene, `open()`, `destroy()`. Always chain with `.then`; nothing rejects.
- Do not add your own reduced-motion check (override with `reducedMotion`). Do not wrap it in a timer; the safety timers are inside.
- Keep the plain JavaScript loop (`row()`) and the WebAssembly kernel (`wasm/velvet.c`) painting identical pixels; change both together and run `node modules/stage-curtains/test/run.js` and `embed.py --check`.
- Do not call `animation.cancel()` on the curtain elements, and do not remove `style.transform` from them: the module writes the end positions there.

## Prior art and credits

- **View Transitions API** (built in; Chrome 111+, Firefox 144+): the browser snapshots the page and animates old to new. A curtain wipe can be made with its pseudo-elements, but the page waits while your update callback runs. This module paints a themed curtain and leaves the page running.
- **Motion `curtains()`** ([motion.dev](https://motion.dev/docs/curtains)): wipe, iris, blinds and fade transitions; not a theater look; part of the paid Motion+ membership.
- [GSAP](https://gsap.com/community/standard-license/): a general timeline engine under its own license (free, not open source); you would still have to draw the velvet.
- [curtains.js](https://github.com/martinlaxenaire/curtainsjs) (MIT): WebGL image planes, an unrelated purpose. CSS-only theater curtain demos exist but only open on hover and have no scene-change logic.
- The velvet painting and the first version of the slide logic came from the games Apple Press and Fancy, the Banana (same maker, LFC Foundry).
- Four ideas in 1.1.0 (a forced turn after 250 ms with a 5 ms slice, painting a little each frame on a cold close, painting again after a turned phone, ending when the last animation is cancelled) were taken from Apple Press's own curtain code; same maker, no outside code.
- View Transitions API, Motion `curtains()`, GSAP and curtains.js: compared only; idea only, no code.

No code from others; the ideas above are theirs.

## Full research notes

The long version of this page (longer write-ups of each alternative and the full list of limits and test runs) is kept in the project's private knowledge base.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
