# canvas-probe

**Test it:** `node tools/canvas-probe/test/run.js` (fake canvas, no browser, 67 checks) and `python3 tools/canvas-probe/test/browser.py` (Playwright for Python with Chromium, a real canvas, 13 checks; the last four were added 2026-10-15 and have not been run yet).

## What it is

A test-build-only counter for a canvas 2D game. It wraps the drawing methods of `CanvasRenderingContext2D`, counts what the game really asks the browser to do each frame, and tells you in plain words where the work is wasteful or leaking.

**What the numbers cover.** The per-frame numbers (median, 95th percentile and worst) cover the last `keep` frames. The problem totals (leak frames, `restore()` with nothing to restore, source overhangs, growing paths, readback calls, deepest nesting, and `frames` seen) cover **every frame since the last `reset()`**, not only the kept ones.

- **Calls:** how many of each of `drawImage`, `beginPath`, `fill`, `stroke`, `clip`, `fillRect`, `strokeRect`, `clearRect`, `fillText`, `strokeText`, `measureText`, gradients (linear, radial, conic), patterns, `putImageData`/`getImageData`, `setTransform`, `translate`, `scale`, `rotate`, `setLineDash`, and the path calls (`rect`, `arc`, `arcTo`, `ellipse`, `roundRect`, `moveTo`, `lineTo`, `quadraticCurveTo`, `bezierCurveTo`). Methods a browser does not have are skipped.
- **`save()` / `restore()` balance:** contexts that still hold an unmatched `save()` when the frame ends (a slow leak that grows the state stack every frame), `restore()` calls with nothing to restore, and the deepest nesting. `ctx.reset()` and any write to `canvas.width` or `canvas.height` (even the same value) empty the browser's saved-state stack, so the probe zeroes its count at those moments. A context that was thrown away (garbage-collected, or passed to `probe.forget(ctx)`) stops counting. `reset()` needs Chrome 99 / Firefox 113 / Safari 17.2; on older browsers it is simply not wrapped.
- **`drawImage` audits:** nine-argument calls whose source rectangle sticks out of the bitmap (on one axis or both; browsers handle that differently, and it costs extra work), and draws shrunk below half size (the browser scales down a bigger picture every frame; a pre-shrunk copy would be cheaper). A source whose size is not known (an image that has not loaded, a closed bitmap, a source with no readable size) is counted as "size unknown" and not checked, so it is never flagged by mistake. A `VideoFrame` is measured by `displayWidth` and `displayHeight`.
- **Style writes:** how many `fillStyle`, `strokeStyle`, `lineWidth`, `globalAlpha`, `font`, `filter`, `imageSmoothingEnabled`, `shadowBlur`, `shadowColor`, `lineCap`, `textAlign`, `textBaseline` and `globalCompositeOperation` writes there were, and what share only repeated the value already set.
- **Painted area, per canvas:** the area of every `drawImage` and `fillRect`, clipped to its canvas and scaled by the current transform, divided by **that canvas's own area**. Two means the average pixel is painted twice. The **main canvas** gets its own line: the on-screen canvas (the one attached to the page; if none, the canvas painted most that frame; or name it with `opts.mainCanvas`). All other canvases (baked sprites, buffers) are summarized on a second line, each against its own size, so a big buffer no longer hides overdraw on the main canvas.
- **Path without `beginPath()`:** counts `rect`, `arc`, `ellipse`, `moveTo`, `lineTo` and the other path calls since the last `beginPath()` on each context, and flags a path that grew in each of the last 3 frames (`opts.pathGrowFrames`) with no `beginPath()` in between. That is the classic leak where a redraw gets slower after minutes and looks fine on screen.
- **Readback:** `getImageData` on a context created without `{ willReadFrequently: true }`. The probe remembers the options of every context created after it was installed; for older contexts it asks `getContextAttributes()` where the browser has it (Chrome 73, Firefox 117) and stays silent if it cannot tell. The option helps canvases you read back often; on a canvas shown on screen it can slow drawing, so treat the flag as a hint.

It counts; it does not time. Wrapping every call makes drawing slower, so never judge milliseconds with it on, and never ship it. If its own bookkeeping fails, the original call still runs.

## Quick start

```html
<script src="canvas-probe.js"></script>
<script>
  var probe = CanvasProbe.install({ keep: 120 });   // wraps CanvasRenderingContext2D (and OffscreenCanvasRenderingContext2D if present)
  // in your loop, once per frame, after drawing:
  probe.frame();
  // later, in a test or the console:
  console.log(probe.text());      // plain words
  var r = probe.report();         // the same as numbers
  probe.uninstall();              // puts the original methods back
</script>
```

Keep it out of the shipped file the way you keep other test code out: load it only from the test build (for example between `/*TEST_HOOK_START*/` and `/*TEST_HOOK_END*/` markers, or injected by the test runner with Playwright's `add_script_tag`).

## API

| Call | Meaning |
|---|---|
| `CanvasProbe.install(opts)` | Wraps the prototypes and returns the probe. It never throws: a method it cannot wrap (a frozen prototype) is listed in `report().skipped`, and if it cannot start at all you get a probe whose `text()` says so. `opts.keep` (default 240) is how many frames the per-frame numbers cover. `opts.prototypes` is an array of context prototypes to wrap (default: the 2D and offscreen 2D contexts). `opts.canvasPrototypes` is the same for canvases (default: `HTMLCanvasElement` and `OffscreenCanvas`; used for size writes and `getContext` options). `opts.auto` calls `frame()` from `requestAnimationFrame` for you, for games you cannot edit; the first frame is recorded on the first animation frame after install, never at install. `opts.mainCanvas` (a canvas, or a function that gets a canvas and returns true) names the main canvas. `opts.pathGrowFrames` (default 3). |
| `probe.frame()` | Closes the current frame: stores its counts and checks for open `save()` calls. Call it once per drawn frame. |
| `probe.report()` | Numbers: `frames`, `kept`, `calls`, `saveRestore`, `drawImage`, `styleWrites`, `paintedArea` (the main canvas, with its `canvas` size), `paintedAreaOther`, `pathWithoutBeginPath`, `readback`, `skipped`. |
| `probe.text()` | The same in plain words, with the median, 95th percentile and worst. Before the first `frame()` it says to call `frame()`. |
| `probe.reset()` | Forgets everything counted so far, including each context's save depth (use it after the game's loading screen). Creation options stay known. |
| `probe.forget(ctx)` | Tells the probe a context was thrown away, so an open `save()` on it stops counting. Needed only where `WeakRef` is missing; elsewhere dropped contexts are noticed on their own. |
| `probe.uninstall()` | Restores every original method and accessor. |
| `probe.calls`, `probe.styles` | The lists of wrapped method and style names. |

## How it differs from existing tools

I searched for a small library that counts canvas 2D calls and checks `save()`/`restore()` balance and `drawImage` source rectangles from inside a page, and did not find one. Near neighbors:

- **Browser developer tools** (Chromium's Performance panel, Firefox's profiler) show where time goes, not how many calls were made or whether a `save()` leaked.
- **Spector.js** and similar capture tools record WebGL calls, not 2D canvas.
- **stats.js** shows frame time and memory, not what was drawn.
- **Proxy-based canvas recorders** (used by some test libraries to compare drawing output) record every call for replay; this keeps only counts per frame, so it adds almost no memory.

If you know a tool that already does this, tell the owner so the prior-art note here can name it.

## Limits

- Counts only. It cannot see GPU work, presentation stalls or a frozen compositor; use a profile for those.
- It wraps the prototype, so a game that grabs `ctx.drawImage` into a variable before the probe is installed bypasses the wrapper. Install it before the game's script runs.
- `getTransform` is used when present to scale areas and shrink checks; without it the transform is treated as identity.
- Painted area counts `drawImage` and `fillRect` only. Paths, text and gradients are counted as calls but have no area.
- Without `WeakRef` (very old browsers) the probe keeps a plain reference to every context that holds an open `save()` until it is restored, reset or forgotten.
- Writing `canvas.width` is seen only for canvases whose 2D context was created after the probe was installed, or that called `save()` after it. Install it first.
- The path-growth flag is a guess from the call counts: a path that legitimately gets longer for several frames in a row with no `beginPath()` would be flagged too.
- Tested in Chromium (real canvas) and with a fake context in Node. Not yet run in Firefox or on Android.

## For AI agents

- Load it only in test builds. Never add it to a shipped file.
- Install it before the game script, call `probe.frame()` once per drawn frame (or pass `auto: true`), play for a few seconds, then read `probe.text()`.
- Use the numbers as a baseline to compare before and after a change. Do not use them as timings.
- Treat "slow leak", "source rectangle sticks out" and "a path that kept growing with no beginPath()" as bugs to fix. Treat style repeats, painted area and the `getImageData` hint as things to check, not failures.
- Read the painted area of the main canvas first; the other-canvases line is for finding a buffer that is repainted too often.
- Copyright (c) 2026 LFC Foundry. MIT License.
