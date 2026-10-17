# Changelog

Every module and tool keeps its own `CHANGELOG.md` (in its folder), newest first, in plain words. This page lists where each one stands and the changes made since version labels began on 2026-10-16. Older history is in each module's changelog under "Before version labels".

How to read a label: `1.2.3 · API 1`. The API number goes up only when someone using an older copy could be affected; see [tools/versions/README.md](tools/versions/README.md).

| Module or tool | Version | History |
|---|---|---|
| [stage-curtains](modules/stage-curtains/README.md) | 1.0.0 · API 1 | [changelog](modules/stage-curtains/CHANGELOG.md) |
| [save-kit](modules/save-kit/README.md) | 1.0.0 · API 1 | [changelog](modules/save-kit/CHANGELOG.md) |
| [hold-press](modules/hold-press/README.md) | 1.0.0 · API 1 | [changelog](modules/hold-press/CHANGELOG.md) |
| [env-probes](modules/env-probes/README.md) | 1.1.0 · API 1 | [changelog](modules/env-probes/CHANGELOG.md) |
| [fx-governor](modules/fx-governor/README.md) | 1.1.0 · API 1 | [changelog](modules/fx-governor/CHANGELOG.md) |
| [fly-to-mini](modules/fly-to-mini/README.md) | 1.2.0 · API 1 | [changelog](modules/fly-to-mini/CHANGELOG.md) |
| [sticker-text](modules/sticker-text/README.md) | 1.0.0 · API 1 | [changelog](modules/sticker-text/CHANGELOG.md) |
| [idle-core](modules/idle-core/README.md) | 1.0.0 · API 1 | [changelog](modules/idle-core/CHANGELOG.md) |
| [frame-kit](modules/frame-kit/README.md) | 1.1.0 · API 1 | [changelog](modules/frame-kit/CHANGELOG.md) |
| [sprite-baker](modules/sprite-baker/README.md) | 1.2.0 · API 1 | [changelog](modules/sprite-baker/CHANGELOG.md) |
| [pad-nav](modules/pad-nav/README.md) | 1.0.0 · API 1 | [changelog](modules/pad-nav/CHANGELOG.md) |
| [tab-guard](modules/tab-guard/README.md) | 1.0.0 · API 1 | [changelog](modules/tab-guard/CHANGELOG.md) |
| [wake-keeper](modules/wake-keeper/README.md) | 1.0.0 · API 1 | [changelog](modules/wake-keeper/CHANGELOG.md) |
| [back-close](modules/back-close/README.md) | 1.0.0 · API 1 | [changelog](modules/back-close/CHANGELOG.md) |
| [lzma-decode](modules/lzma-decode/README.md) | 1.0.0 · API 1 | [changelog](modules/lzma-decode/CHANGELOG.md) |
| [ppmd-decode](modules/ppmd-decode/README.md) | 1.0.0 · API 1 | [changelog](modules/ppmd-decode/CHANGELOG.md) |
| [cartoon-3d-kit](modules/cartoon-3d-kit/README.md) | 1.0.0 · API 1 | [changelog](modules/cartoon-3d-kit/CHANGELOG.md) |
| [single-file-tools](tools/single-file-tools/README.md) | 1.1.0 · API 1 | [changelog](tools/single-file-tools/CHANGELOG.md) |
| [lzma-pack](tools/lzma-pack/README.md) | 1.0.0 · API 1 | [changelog](tools/lzma-pack/CHANGELOG.md) |
| [ppmd-pack](tools/ppmd-pack/README.md) | 1.0.0 · API 1 | [changelog](tools/ppmd-pack/CHANGELOG.md) |
| [fuzz-kit](tools/fuzz-kit/README.md) | 1.1.0 · API 1 | [changelog](tools/fuzz-kit/CHANGELOG.md) |
| [canvas-probe](tools/canvas-probe/README.md) | 1.1.0 · API 1 | [changelog](tools/canvas-probe/CHANGELOG.md) |
| [storage-probe](tools/storage-probe/README.md) | 1.1.0 · API 1 | [changelog](tools/storage-probe/CHANGELOG.md) |

## Changes since labels began

- 2026-10-16 · **storage-probe** 1.1.0 · API 1: The page now also checks IndexedDB (the Story Editor keeps its file memory there), and on the second press it says how often and since when this copy was pressed and that its saved data survived. Two new buttons: Measure free saved-data space (how many entries, the biggest ones, how much room is left) and Save a second copy of this page (one press instead of saving the page twice by hand, handy on a phone). The test now waits for the page instead of sleeping, so it takes about 2 seconds instead of 6, and it has 12 more checks.
- 2026-10-16 · **single-file-tools** 1.1.0 · API 1: Packer: --encoding bytes makes a file you hand out about 23% smaller (works from a double-clicked file, not from a server that forces utf-8 such as GitHub Pages), and Zopfli now defaults to 15 passes (3 times faster, a few bytes bigger) with --fast and --best. Pictures: ones with a style inside are now handled, ones with a script inside or no end are left alone and listed, and --report shows the real size saved after compression. Fonts: --report lists characters a font lacks, --costs shows what each layout feature costs, and the font type label now says woff2. README has the measured numbers and which packer to pick.
- 2026-10-16 · **fx-governor** 1.1.0 · API 1: Very slow devices are no longer missed: three long gaps in a row now count as a slow device, not a pause. A window under half the line steps down after one window instead of two (new option severe, 0 turns it off). choose() with an unknown name no longer locks, and release('full') sets the level and hands control back. README now shows a Try full effects again button and how to remember the level between visits.
- 2026-10-16 · **fuzz-kit** 1.1.0 · API 1: Two fixes found by running in real browsers: the hang guard now really reports a frozen page (before, the run never came back), and the real-input option now works in Firefox (it failed on the Space key). New and optional: swarm testing (each seed uses only part of the operations), a final end-of-run check, a fingerprint per run with a repeat check, replay from a saved file, running several seeds side by side (--jobs), a cheaper way to pick a visible button (pickVisible), comma lists of seeds, and --executable in the Playwright runner. Everything old works the same. The README has the numbers and what is still untested.
- 2026-10-16 · **frame-kit** 1.1.0 · API 1: QualityGovernor no longer ignores very slow devices: four long frames in a row (over 100 ms) now count as a slow device instead of a pause, so a phone under about 10 frames a second is finally stepped down. New option stepUp: false (only ever steps down) and new lock() / unlock() for a level the player picked. Single stalls still change nothing.
- 2026-10-16 · **fly-to-mini** 1.2.0 · API 1: New opt-in options: pass the sticky bar as an element (it follows the bar's size), a visible-amount callback, hysteresis so scrolling at the edge stops flip-flopping, keyboard focus follows the visible button, a short fade under reduced motion, and a blink method for the mini. The flying copy no longer has duplicate ids and now shows canvas pictures. destroy() clears all timers.
- 2026-10-16 · **fly-to-mini** 1.1.0 · API 1: New optional `engine: 'transition'` uses the browser's View Transitions API for the move (with the same arc, tilt and squash). The flight is still the default, and browsers without the API use it automatically. Nothing existing changes. Not yet judged by eye on a phone or in Firefox.
- 2026-10-16 · **env-probes** 1.1.0 · API 1: Faster clock and canvas checks. New: canvasNoise() says how big canvas noise is, framed() says whether the page sits inside another page, capabilities() lists which newer browser features work, plus hover, any-hover and reduced-transparency questions. explain() now says so when saving is blocked inside a frame. The demo is now a one-button device check page with a copy-report button. Everything old answers the same as before.
- 2026-10-16 · **canvas-probe** 1.1.0 · API 1: The probe now slows the game less (about 40 to 60 percent less extra time per frame in a Chromium test) because it reads the transform once per draw. New: probe.check(limits) gives a pass or fail with plain-words problems (leaks, restore without save, source overhang, growing paths, and a calls-per-frame ceiling); the report has a per-frame total of calls; and install({ deep: true }) counts draws made with a filter, a shadow or a blend mode. README now explains the rejected-style-write and method-name limits and says to run games with their quality governor off while the probe is on.
