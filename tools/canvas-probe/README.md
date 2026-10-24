# canvas-probe

**Version 1.1.1 · API 1**

**Tested in:** ungoogled Chromium 155.0.8059.39-1, Firefox 158.0 and WebKitGTK 2.52.6 (`test/browsers.js`, 10 grouped checks each), 18 of 18 `browser.py` checks in Chromium 155 and in Firefox 158 (through the Firefox stand-in), 94 Node checks. Not run: a phone.

A test-build-only counter for a canvas 2D game. It wraps the drawing methods of `CanvasRenderingContext2D`, counts what the game really asks the browser to do each frame, and tells you in plain words where the work is wasteful or leaking.

Once installed, it replaces each drawing method and style setting with a wrapper that adds one to a counter and then runs the original call. Your loop calls `probe.frame()` once per frame, which closes the counts for that frame and keeps the last few; `probe.text()` turns the counts into plain sentences and `probe.check()` gives a pass or fail for a test run. One file, `src/canvas-probe.js`, no dependencies.

## Why it exists

A game can look fine on screen while it quietly wastes work: a `save()` that is never matched by `restore()`, a path that grows because `beginPath()` is missing, a picture shrunk every frame. The browser's profiler shows where time goes, not these counts, and a small library that does this from inside a page was searched for and not found. Use it in test builds, as a baseline to compare before and after a change.

## Use

```html
<script src="canvas-probe.js"></script>
<script>
  var probe = CanvasProbe.install({ keep: 120 });   // wraps the 2D (and offscreen 2D) context prototypes
  probe.frame();                                    // in your loop, once per frame, after drawing
  console.log(probe.text());                        // plain words
  var v = probe.check({ callsPerFrame: 620 });      // { ok, problems }: pass or fail for a test run
  probe.uninstall();                                // puts the original methods back
</script>
```

Keep it out of the shipped file like other test code: load it only from the test build (between `/*TEST_HOOK_START*/` and `/*TEST_HOOK_END*/` markers, or injected by the test runner, e.g. Playwright's `add_script_tag`). Install it before the game script runs. Run the game with its quality governor (such as `QualityGovernor` or `FxGovernor`) off while the probe is on, or it sees the slower frames the probe causes and steps quality down.

Tests: `node tools/canvas-probe/test/run.js` (fake canvas, no browser, 94 checks) and `python3 tools/canvas-probe/test/browser.py` (Playwright for Python with Chromium, a real canvas, 18 checks; all pass in ungoogled Chromium 155 and in Firefox 158 through `tools/firefox-stand-in/run-in-firefox.py`). `node tools/canvas-probe/test/browsers.js firefox|chromium|webkit` runs the same three in-page scripts in any test browser through `tools/test-runner` (10 grouped checks).

## What it measures

Per-frame numbers (median, 95th percentile, worst) cover the last `keep` frames. Problem totals (leak frames, `restore()` with nothing to restore, source overhangs, growing paths, readback calls, deepest nesting, `frames` seen) cover every frame since the last `reset()`.

- **Calls:** how many of each drawing, path, text, gradient, pattern, image-data and transform call; a method the browser lacks is skipped. Plus one total per frame (compare its median with a call budget).
- **`save()` / `restore()` balance:** contexts still holding an unmatched `save()` when the frame ends (a slow leak), `restore()` with nothing to restore, deepest nesting. `ctx.reset()` and any write to `canvas.width` or `canvas.height` empty the saved-state stack, so the probe zeroes its count then. A thrown-away context (garbage-collected or passed to `probe.forget(ctx)`) stops counting. `reset()` needs Chrome 99 / Firefox 113 / Safari 17.2; on older browsers it is not wrapped.
- **`drawImage` audits:** nine-argument calls whose source rectangle sticks out of the bitmap, and draws shrunk below half size (a pre-shrunk copy would be cheaper). A source of unknown size (not loaded, closed bitmap) is counted as "size unknown" and never flagged. A `VideoFrame` is measured by `displayWidth` and `displayHeight`.
- **Style writes:** how many `fillStyle`, `strokeStyle`, `lineWidth`, `globalAlpha`, `font`, `filter`, `imageSmoothingEnabled`, `shadowBlur`, `shadowColor`, `lineCap`, `textAlign`, `textBaseline` and `globalCompositeOperation` writes, and what share only repeated the value already set.
- **Painted area, per canvas:** area of every `drawImage` and `fillRect`, clipped and scaled by the current transform, divided by that canvas's own area (2 means the average pixel is painted twice). The main canvas (the on-screen one, else the one painted most that frame, or `opts.mainCanvas`) gets its own line; other canvases (baked sprites, buffers) are summarized on a second line, each against its own size.
- **Path without `beginPath()`:** flags a path that grew in each of the last 3 frames (`opts.pathGrowFrames`) with no `beginPath()` in between, the classic leak where a redraw slows down after minutes.
- **Readback:** `getImageData` on a context made without `{ willReadFrequently: true }`. Options are remembered for contexts created after install; for older ones it asks `getContextAttributes()` (Chrome 73, Firefox 117) and stays silent if it cannot tell. Treat the flag as a hint: on a canvas shown on screen the option can slow drawing.
- **Costly draws (opt-in, `deep: true`):** draws made while a `filter`, a shadow (`shadowBlur` above 0) or a blend mode other than `source-over` is set, the usual hidden cost on phones. Off by default because reading the three properties adds about 170 ns to every draw.

It counts; it does not time. Wrapping makes drawing slower (about 420 ns per wrapped call in a Chromium test, so a frame of 5,500 calls took 2.3 ms longer), so never judge milliseconds with it on, and never ship it. If its own bookkeeping fails, the original call still runs.

## API

| Call | Meaning |
|---|---|
| `CanvasProbe.install(opts)` | Wraps the prototypes and returns the probe. Never throws: a method it cannot wrap (frozen prototype) is listed in `report().skipped`; if it cannot start you get a probe whose `text()` says so. |
| `opts.keep` | Frames the per-frame numbers cover (default 240). |
| `opts.auto` | Calls `frame()` from `requestAnimationFrame` for games you cannot edit; the first frame is recorded on the first animation frame after install. |
| `opts.mainCanvas` | A canvas, or a function that gets a canvas and returns true. |
| `opts.pathGrowFrames` | Frames of path growth that raise the flag (default 3). |
| `opts.deep` | `true` also counts draws with a filter, shadow or non-default blend mode; `text()` says when it is on. |
| `opts.prototypes`, `opts.canvasPrototypes` | Context and canvas prototypes to wrap (default: 2D and offscreen 2D contexts; `HTMLCanvasElement` and `OffscreenCanvas`). |
| `probe.frame()` | Closes the frame: stores its counts and checks for open `save()` calls. |
| `probe.report()` | Numbers: `frames`, `kept`, `deep`, `calls`, `callsPerFrame`, `saveRestore`, `drawImage`, `styleWrites`, `paintedArea` (main canvas, with its `canvas` size), `paintedAreaOther`, `pathWithoutBeginPath`, `readback`, `costlyDraws` (`null` unless `deep`), `skipped`. |
| `probe.text()` | The same in plain words. Before the first `frame()` it says to call `frame()`. |
| `probe.check(limits)` | `{ ok, problems }`. With no limits it fails on any frame ending with an unmatched `save()` (`leakFrames`, 0), any `restore()` with nothing to restore (`restoreWithoutSave`, 0), any `drawImage` source that sticks out (`sourceOverhang`, 0) and any frame with a growing path (`growingPathFrames`, 0). Add `callsPerFrame` (ceiling for the median of the per-frame total) and `callsPerFrameP95`; with `deep`, `withFilter`, `withShadow`, `withBlendMode`. `null` or `Infinity` switches a limit off. With no frames recorded it fails and says to call `frame()`. |
| `probe.reset()` | Forgets everything counted, including save depth (use after the loading screen). Creation options stay known. |
| `probe.forget(ctx)` | A context was thrown away; needed only where `WeakRef` is missing. |
| `probe.uninstall()` | Restores every original method and accessor. |
| `probe.calls`, `probe.styles` | Lists of wrapped method and style names. |

## How it differs from existing tools

A small library that counts canvas 2D calls and checks `save()`/`restore()` balance and `drawImage` source rectangles from inside a page was searched for and not found. Near neighbors (none measured):

- **Browser developer tools** (Chromium's Performance panel, Firefox's profiler) show where time goes, not how many calls were made or whether a `save()` leaked.
- **Spector.js** and similar tools capture WebGL calls, not 2D canvas.
- **stats.js** shows frame time and memory, not what was drawn.
- **Proxy-based canvas recorders** (used by some test libraries to compare drawing output) record every call for replay; this keeps only counts per frame, so it adds almost no memory.

If you know a tool that already does this, tell the owner so the prior-art note can name it.

## What it is not

- **A rejected style write looks like a repeat.** A value the browser ignores (`font = 'bogus'`, `globalAlpha = NaN`) leaves the old value, so it counts as a repeat. In a Chromium test, 5 of 9 writes were counted as repeats and only 2 really were.
- **The wrapped methods look different:** `ctx.drawImage.length` reads 0 instead of 3, `name` reads "value", `toString()` shows source code instead of `[native code]`.
- Counts only: no GPU work, presentation stalls or frozen compositor; use a profile for those.
- It wraps the prototype, so a game that grabbed `ctx.drawImage` into a variable before install bypasses it.
- `getTransform` scales areas and shrink checks when present; without it the transform counts as identity.
- Painted area counts `drawImage` and `fillRect` only; paths, text and gradients are counted as calls but have no area.
- Without `WeakRef` (very old browsers) the probe keeps a plain reference to every context holding an open `save()` until it is restored, reset or forgotten.
- A `canvas.width` write is seen only for canvases whose 2D context was created after install, or that called `save()` after it.
- The path-growth flag is a guess from call counts: a path that legitimately grows for several frames with no `beginPath()` is flagged too.
- Tested in ungoogled Chromium 155, Firefox 158 and WebKitGTK 2.52.6 (real canvas) and with a fake context in Node. Not yet run on a phone.

## For AI agents

- Load it only in test builds; never add it to a shipped file.
- Install before the game script, call `probe.frame()` once per drawn frame (or pass `auto: true`), play a few seconds, read `probe.text()`.
- Use the numbers as a baseline before and after a change, not as timings.
- To make a test: `probe.check({ callsPerFrame: <ceiling> })`, fail when `ok` is false, print `problems`.
- Treat "slow leak", "source rectangle sticks out" and "a path that kept growing with no beginPath()" as bugs. Treat style repeats, painted area and the `getImageData` hint as things to check, not failures.
- Read the main canvas's painted area first; the other-canvases line is for finding a buffer repainted too often.

## Prior art and credits

Written for this repository. The source header of `src/canvas-probe.js` credits no outside code, and the file has no dependencies. Browser developer tools, Spector.js, stats.js and proxy-based canvas recorders were compared as ideas only; no code was taken from them. No small library that does this was found; if you know one, tell the owner so it can be named here.

## Full research notes

The long version of this page (the full list of counted methods, the detailed notes on each audit, and the per-limit explanations) is kept in the project's private knowledge base.

Copyright (c) 2026 LFC Foundry. MIT License.
