# hold-press changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
Buttons not being pressed no longer cost anything on every mouse or touch move: 12 buttons went from 10.9 to 0.075 microseconds per mouse move in ungoogled Chromium 155.0.8059.39-1, 3.25 to 0.65 in Firefox 158.0, 6.6 to 0.75 in WebKitGTK 2.52.6 and 8.9 to 0.35 in GNOME Web 46.5 (50 buttons: 41.3 to 0.075 in Chromium). The page-wide listeners now exist only while a press is down. New option lockTouch: true sets touch-action none while attached (measured: with auto or manipulation Chromium 155 cancels the touch and scrolls the page 83 px when a finger drags up from the button; with none it does neither). New option keyboard: true repeats onPress while Enter or Space is held on the focused button: 4 presses in 1.1 s in all four browsers; Enter keeps its one normal click, a Space hold swallows its release click, a quick tap stays one click. Added 16 checks (17 to 33). Minified size 3,579 to 4,707 bytes (1,387 to 1,754 gzip).

Tested in: Node: 33 checks pass (16 new). Real key presses (Enter and Space, hold 1.1 s, quick tap, hold then tap): ungoogled Chromium 155.0.8059.39-1 and Firefox 158.0. Idle cost compared old and new in those two plus WebKitGTK 2.52.6 and GNOME Web 46.5; keyboard hold by script key events in the last two. Not run: touch on a real phone, the browser-side Space click swallow in WebKitGTK and GNOME Web (script keys send no click)

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Node checks; Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`; Firefox 158 per the 2026-10-15 task-board note and Firefox 157 on 2026-10-17 (`tests/firefox.js`): tap is one click, hold repeats, release adds no click. Not run: WebKitGTK, a phone.

## Before version labels

- Early October 2026: First version: hold-to-repeat for buttons that survives Android Chrome `pointercancel`.
- 2026-10-15: A hold now ends when its own finger lifts, even if a second finger is still on the screen.
