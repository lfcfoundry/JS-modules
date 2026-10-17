# hold-press changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Node checks; Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`; Firefox 158 per the 2026-10-15 task-board note and Firefox 157 on 2026-10-17 (`tests/firefox.js`): tap is one click, hold repeats, release adds no click. Not run: WebKitGTK, a phone.

## Before version labels

- Early October 2026: First version: hold-to-repeat for buttons that survives Android Chrome `pointercancel`.
- 2026-10-15: A hold now ends when its own finger lifts, even if a second finger is still on the screen.
