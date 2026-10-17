# pad-nav changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
Finding the buttons you can reach is about 2.5 times faster where element.checkVisibility() exists: 1000 buttons 8.1 to 3.2 ms in ungoogled Chromium 155.0.8059.39-1; 4 to 1 ms in Firefox 158.0 and 5 to 1 ms in WebKitGTK 2.52.6 (those timers round to 1 ms); same buttons found every time (847 of 1000). Older browsers use the earlier check. New options: nextRule: 'edges' (off by default; on 2,000 random menus with mixed button widths it picks a different button in 21.2% of presses and never jumps past a button sitting directly in line, which the default does in 5.4% of those presses; on regular grids both always agree), and onInput(pad) with inputMs (default 250) so a controller can keep the screen awake through wake-keeper. New test/lite.js cuts hints and sliders out of a copy: 28% smaller (13,091 to 9,403 bytes minified, 4,771 to 3,430 gzip). Added 18 checks (94 to 112). Full file minified 12,103 to 13,091 bytes (4,476 to 4,771 gzip).

Tested in: Node: 112 checks pass (18 new). Module browser suite passes in ungoogled Chromium 155.0.8059.39-1. Candidate search compared old and new (same answers, 847 of 1000) in ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5. Not run: that browser suite in Firefox 158.0, WebKitGTK and GNOME Web, a real controller, a phone

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Chromium only at build (version not recorded; 105 checks); Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`; Firefox 157.0.1 through the Firefox stand-in (105 checks pass, 2026-10-17). Not run: Firefox 158, ungoogled Chromium 155, WebKitGTK, a real controller, a phone.

## Before version labels

- Early October 2026: First version: gamepad to DOM focus. Never tried with a real controller.
- 2026-10-15: Stick press and release now have a gap so a jittery stick does not flicker; sliders and drop-downs can be reached; unplugging a pad cleans up; your callbacks can no longer throw out of the module.
