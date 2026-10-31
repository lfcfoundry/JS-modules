# hold-press developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17

### Quick
Buttons that are not being pressed no longer cost anything on every mouse or touch move, so pages with many buttons feel lighter. New option stops the browser from scrolling during a touch press.

### Deep
Buttons not being pressed no longer cost anything on every mouse or touch move: 12 buttons went from 10.9 to 0.075 microseconds per mouse move in ungoogled Chromium 155.0.8059.39-1, 3.25 to 0.65 in Firefox 158.0, 6.6 to 0.75 in WebKitGTK 2.52.6 and 8.9 to 0.35 in GNOME Web 46.5 (50 buttons: 41.3 to 0.075 in Chromium). The page-wide listeners now exist only while a press is down. New option lockTouch: true sets touch-action none while attached (measured: with auto or manipulation Chromium 155 cancels the touch and scrolls the page 83 px when a finger drags up from the button; with none it does neither). New option keyboard: true repeats onPress while Enter or Space is held on the focused button: 4 presses in 1.1 s in all four browsers; Enter keeps its one normal click, a Space hold swallows its release click, a quick tap stays one click. Added 16 checks (17 to 33). Minified size 3,579 to 4,707 bytes (1,387 to 1,754 gzip).

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
