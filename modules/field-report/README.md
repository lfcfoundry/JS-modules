# field-report

**Version 1.0.2 · API 1**

**Tested in:** field-report checks 45/45 (one new: header version equals FR.version)

## What it is and how it works

Two hidden buttons that let a tester on a real device save a **speed report** and an **error log** as small Markdown files. No network, no names.

- Five quick taps in a corner open a small panel; nothing is drawn before that.
- It keeps the last 3,600 frame times and the last 200 distinct errors and warnings.
- The speed report ends in a plain-words verdict.

## Why it exists

Every game and app here needs a way to test on a phone and send back numbers instead of "it felt slow". DevTools needs a computer attached, FPS overlays save nothing, and error services send data over the network, which these apps never do.

**Where it helps**

- Testing a release on real phones and laptops.
- Collecting error logs from testers without a server.
- Comparing speed before and after a change.

**Not for:** errors that happen before the file runs; load it first.

## Quick start
```html
<script src="field-report.js"></script>   <!-- first, so start-up errors are caught -->
<script>
  var fr = FieldReport.start({ name: 'my-game', version: '2026.10.22.1700' });
  fr.mark('first-screen');                                   // when the first screen is ready
  var sprites = fr.task('bake-sprites', function () { return bake(); });   // time one heavy job, keep its answer
</script>
```
Then tap the top-left corner five times. Open `demo.html` to try it.

## API
| Call | What it does |
|---|---|
| `FieldReport.start(options)` | Starts watching; returns the controller below. Without a window (Node) it returns a quiet object that does nothing. |
| `fr.mark(name)` | Records a start-up step (milliseconds since the page started). |
| `fr.task(name, fn)` | Runs `fn`, records how long it took (also if it throws), returns its answer. |
| `fr.time(name, ms)` | Records a time you measured yourself. |
| `fr.speedText()` / `fr.errorsText()` | The two reports as Markdown text. `fr.speed()` and `fr.errors()` give the numbers as objects. |
| `fr.open()` / `fr.close()` / `fr.isOpen()` | Show or hide the panel yourself (for example from your own settings screen). |
| `fr.saveSpeed()` / `fr.saveErrors()` | Save without the panel. Return `{ text, file, saved }`. |
| `fr.stop()` | Stops everything and puts the console back. |

Options: `name` (used in file names, `my-game-speed-20261022-1700.md`), `version` (your release stamp, shown in the reports), `corner` (`'top-left'` by default, or `'top-right'`, `'bottom-left'`, `'bottom-right'`), `taps` (5) within `within` ms (2500) inside a square of `size` px (64), `fps` (60: what "smooth" means for this page; use 30 for a 30 FPS game), `frames` (`false` skips the frame loop), `console` (`false` leaves the console alone), `onSave(text, fileName, kind)` (replaces the file download, for example to open a share sheet), `onOpen`, `onClose`.

## What a report holds
- **Speed report:** device lines (browser string, cores, memory class, screen, pixel ratio, WebAssembly and Worker yes/no), the verdict, a start-up table (first paint, DOMContentLoaded, load, your marks), frame numbers (average FPS, FPS of the slowest 1%, slowest five frames, counts over 33, 50 and 100 ms) and the 15 heaviest tasks.
- **Error log:** the same device lines, a one-line summary ("12 error line(s), 3 different: 10 error, 2 console.warn"), a table with seconds since start, kind, times and text, and the stack of each error that has one.

## Limits
- Errors raised before this file ran cannot be seen; put it first.
- Heavy tasks from the browser's own long-task report exist in Chromium only. In Firefox and Safari engines, wrap known heavy jobs in `task()` or `time()`; frame gaps still show the freezes.
- Frames while the page is hidden are dropped. A page that draws only when something changes has few frames; use `frames: false` there.
- The memory class is rounded by the browser and missing in Firefox and Safari engines. Nothing about the person (no name, no storage, no cookies) is read.
- Files are saved with a download link and a Blob. If the browser will not (some in-app webviews), the text is shown in a box to copy; or pass `onSave`.
- The panel is built with element styles, not a `<style>` tag or style attribute, so it works under a strict page policy (`style-src 'self'`). Nothing needs `'unsafe-inline'`.

## See it in action

Used right now in [Apple Press](https://lfcfoundry.github.io/apple-press/play/), [Fancy, the Banana](https://lfcfoundry.github.io/fancy-banana/play/), [Pineapple Defense](https://lfcfoundry.github.io/pineapple-defense/play/), [Story Editor](https://lfcfoundry.github.io/story-editor/play/), Netflow Map (its repository is private, so there is no link). Checked in each app's shipped file on its main branch on 2026.10.29. The module's own page is `demo.html` in this folder.

## How it compares

| Alternative | What it does | Why it does not fit this job |
|---|---|---|
| Chrome DevTools and Lighthouse | Deep profiling and audits | Need a computer attached to the phone; nothing is saved on the device |
| stats.js and similar overlays | Show frames a second on screen | Save nothing and record no errors |
| Sentry and similar services | Collect errors from real users | Send them over the network, which these games never do |
| **field-report** | Hidden speed button and error-log button, saved on the device for the owner to send back | Not a profiler; it reports numbers, it does not explain them |

## Prior art and credits
No code was taken from anywhere. The ideas of a ring buffer of frame times, "1% low" frame rate and the long-task entry are common practice in game and web performance tools; the long-task entry is the W3C Long Tasks API.

## For AI agents
One file, no dependencies, ES5, UMD (`window.FieldReport` or `require`). Start it before other scripts. Tests: `node modules/field-report/test/run.js` (44 checks, fake window) and `node tests/field-report-browser.js chromium|firefox|webkit|epiphany`.
