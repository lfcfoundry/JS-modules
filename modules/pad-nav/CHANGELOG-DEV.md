# pad-nav developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17

### Quick
Finding the buttons a gamepad can reach is about 2.5 times faster in browsers that support it. New optional rule that picks the next button by its edges.

### Deep
Finding the buttons you can reach is about 2.5 times faster where element.checkVisibility() exists: 1000 buttons 8.1 to 3.2 ms in ungoogled Chromium 155.0.8059.39-1; 4 to 1 ms in Firefox 158.0 and 5 to 1 ms in WebKitGTK 2.52.6 (those timers round to 1 ms); same buttons found every time (847 of 1000). Older browsers use the earlier check. New options: nextRule: 'edges' (off by default; on 2,000 random menus with mixed button widths it picks a different button in 21.2% of presses and never jumps past a button sitting directly in line, which the default does in 5.4% of those presses; on regular grids both always agree), and onInput(pad) with inputMs (default 250) so a controller can keep the screen awake through wake-keeper. New test/lite.js cuts hints and sliders out of a copy: 28% smaller (13,091 to 9,403 bytes minified, 4,771 to 3,430 gzip). Added 18 checks (94 to 112). Full file minified 12,103 to 13,091 bytes (4,476 to 4,771 gzip).

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
