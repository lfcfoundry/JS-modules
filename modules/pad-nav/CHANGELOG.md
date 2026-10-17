# pad-nav changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Chromium only at build (version not recorded; 105 checks); Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`; Firefox 157.0.1 through the Firefox stand-in (105 checks pass, 2026-10-17). Not run: Firefox 158, ungoogled Chromium 155, WebKitGTK, a real controller, a phone.

## Before version labels

- Early October 2026: First version: gamepad to DOM focus. Never tried with a real controller.
- 2026-10-15: Stick press and release now have a gap so a jittery stick does not flicker; sliders and drop-downs can be reached; unplugging a pad cleans up; your callbacks can no longer throw out of the module.
