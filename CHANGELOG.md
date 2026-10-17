# Changelog

Every module and tool keeps its own `CHANGELOG.md` (in its folder), newest first, in plain words. This page lists where each one stands and the changes made since version labels began on 2026-10-16. Older history is in each module's changelog under "Before version labels".

How to read a label: `1.2.3 · API 1`. The API number goes up only when someone using an older copy could be affected; see [tools/versions/README.md](tools/versions/README.md).

| Module or tool | Version | History |
|---|---|---|
| [stage-curtains](modules/stage-curtains/README.md) | 1.0.0 · API 1 | [changelog](modules/stage-curtains/CHANGELOG.md) |
| [save-kit](modules/save-kit/README.md) | 1.0.0 · API 1 | [changelog](modules/save-kit/CHANGELOG.md) |
| [hold-press](modules/hold-press/README.md) | 1.0.0 · API 1 | [changelog](modules/hold-press/CHANGELOG.md) |
| [env-probes](modules/env-probes/README.md) | 1.1.0 · API 1 | [changelog](modules/env-probes/CHANGELOG.md) |
| [fx-governor](modules/fx-governor/README.md) | 1.0.0 · API 1 | [changelog](modules/fx-governor/CHANGELOG.md) |
| [fly-to-mini](modules/fly-to-mini/README.md) | 1.2.0 · API 1 | [changelog](modules/fly-to-mini/CHANGELOG.md) |
| [sticker-text](modules/sticker-text/README.md) | 1.0.0 · API 1 | [changelog](modules/sticker-text/CHANGELOG.md) |
| [idle-core](modules/idle-core/README.md) | 1.0.0 · API 1 | [changelog](modules/idle-core/CHANGELOG.md) |
| [frame-kit](modules/frame-kit/README.md) | 1.0.0 · API 1 | [changelog](modules/frame-kit/CHANGELOG.md) |
| [sprite-baker](modules/sprite-baker/README.md) | 1.2.0 · API 1 | [changelog](modules/sprite-baker/CHANGELOG.md) |
| [pad-nav](modules/pad-nav/README.md) | 1.0.0 · API 1 | [changelog](modules/pad-nav/CHANGELOG.md) |
| [tab-guard](modules/tab-guard/README.md) | 1.0.0 · API 1 | [changelog](modules/tab-guard/CHANGELOG.md) |
| [wake-keeper](modules/wake-keeper/README.md) | 1.0.0 · API 1 | [changelog](modules/wake-keeper/CHANGELOG.md) |
| [back-close](modules/back-close/README.md) | 1.0.0 · API 1 | [changelog](modules/back-close/CHANGELOG.md) |
| [lzma-decode](modules/lzma-decode/README.md) | 1.0.0 · API 1 | [changelog](modules/lzma-decode/CHANGELOG.md) |
| [ppmd-decode](modules/ppmd-decode/README.md) | 1.0.0 · API 1 | [changelog](modules/ppmd-decode/CHANGELOG.md) |
| [cartoon-3d-kit](modules/cartoon-3d-kit/README.md) | 1.0.0 · API 1 | [changelog](modules/cartoon-3d-kit/CHANGELOG.md) |
| [single-file-tools](tools/single-file-tools/README.md) | 1.0.0 · API 1 | [changelog](tools/single-file-tools/CHANGELOG.md) |
| [lzma-pack](tools/lzma-pack/README.md) | 1.0.0 · API 1 | [changelog](tools/lzma-pack/CHANGELOG.md) |
| [ppmd-pack](tools/ppmd-pack/README.md) | 1.0.0 · API 1 | [changelog](tools/ppmd-pack/CHANGELOG.md) |
| [fuzz-kit](tools/fuzz-kit/README.md) | 1.0.0 · API 1 | [changelog](tools/fuzz-kit/CHANGELOG.md) |
| [canvas-probe](tools/canvas-probe/README.md) | 1.0.0 · API 1 | [changelog](tools/canvas-probe/CHANGELOG.md) |
| [storage-probe](tools/storage-probe/README.md) | 1.0.0 · API 1 | [changelog](tools/storage-probe/CHANGELOG.md) |

## Changes since labels began

- 2026-10-16 · **fly-to-mini** 1.2.0 · API 1: New opt-in options: pass the sticky bar as an element (it follows the bar's size), a visible-amount callback, hysteresis so scrolling at the edge stops flip-flopping, keyboard focus follows the visible button, a short fade under reduced motion, and a blink method for the mini. The flying copy no longer has duplicate ids and now shows canvas pictures. destroy() clears all timers.
- 2026-10-16 · **fly-to-mini** 1.1.0 · API 1: New optional `engine: 'transition'` uses the browser's View Transitions API for the move (with the same arc, tilt and squash). The flight is still the default, and browsers without the API use it automatically. Nothing existing changes. Not yet judged by eye on a phone or in Firefox.
- 2026-10-16 · **env-probes** 1.1.0 · API 1: Faster clock and canvas checks. New: canvasNoise() says how big canvas noise is, framed() says whether the page sits inside another page, capabilities() lists which newer browser features work, plus hover, any-hover and reduced-transparency questions. explain() now says so when saving is blocked inside a frame. The demo is now a one-button device check page with a copy-report button. Everything old answers the same as before.
