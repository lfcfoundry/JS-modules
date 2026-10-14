# canvas-probe

**Test it:** `node tools/canvas-probe/test/run.js` (fake canvas, no browser, 24 checks) and `python3 tools/canvas-probe/test/browser.py` (Playwright for Python with Chromium, a real canvas, 9 checks).

## What it is

A test-build-only counter for a canvas 2D game. It wraps the drawing methods of `CanvasRenderingContext2D`, counts what the game really asks the browser to do each frame, and tells you in plain words where the work is wasteful or leaking.

Per frame (median, 95th percentile and worst of the last `keep` frames) it reports:

- **Calls:** how many of each of `drawImage`, `beginPath`, `fill`, `stroke`, `clip`, `fillRect`, `strokeRect`, `clearRect`, `fillText`, `strokeText`, `measureText`, gradients, patterns and `putImageData`/`getImageData`.
- **`save()` / `restore()` balance:** contexts that still hold an unmatched `save()` when the frame ends (a slow leak that grows the state stack every frame), `restore()` calls with nothing to restore, and the deepest nesting.
- **`drawImage` audits:** nine-argument calls whose source rectangle sticks out of the bitmap (on one axis or both; browsers handle that differently, and it costs extra work), and draws shrunk below half size (the browser scales down a bigger picture every frame; a pre-shrunk copy would be cheaper).
- **Style writes:** how many `fillStyle`, `strokeStyle`, `lineWidth`, `globalAlpha`, `font` and similar writes there were, and what share only repeated the value already set.
- **Painted area:** the area of every `drawImage` and `fillRect`, clipped to the canvas and scaled by the current transform, divided by the canvas area. Two means the average pixel is painted twice.

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
| `CanvasProbe.install(opts)` | Wraps the prototypes and returns the probe. `opts.keep` (default 240) is how many frames the report covers. `opts.prototypes` is an array of prototypes to wrap (default: the 2D and offscreen 2D contexts). `opts.auto` calls `frame()` from `requestAnimationFrame` for you, for games you cannot edit. |
| `probe.frame()` | Closes the current frame: stores its counts and checks for open `save()` calls. Call it once per drawn frame. |
| `probe.report()` | Numbers: `frames`, `kept`, `calls`, `saveRestore`, `drawImage`, `styleWrites`, `paintedArea`. |
| `probe.text()` | The same in plain words. Before the first `frame()` it says to call `frame()`. |
| `probe.reset()` | Forgets everything counted so far (use it after the game's loading screen). |
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
- Tested in Chromium (real canvas) and with a fake context in Node. Not yet run in Firefox or on Android.

## For AI agents

- Load it only in test builds. Never add it to a shipped file.
- Install it before the game script, call `probe.frame()` once per drawn frame (or pass `auto: true`), play for a few seconds, then read `probe.text()`.
- Use the numbers as a baseline to compare before and after a change. Do not use them as timings.
- Treat "slow leak" and "source rectangle sticks out" as bugs to fix. Treat style repeats and painted area as hints to check, not failures.
- Copyright (c) 2026 JNFoo. MIT License.
