# pad-nav changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
- Finding the buttons a gamepad can reach is about 2.5 times faster in browsers that support it.
- New optional rule that picks the next button by its edges.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- Early October 2026: First version: gamepad to DOM focus. Never tried with a real controller.
- 2026-10-15: Stick press and release now have a gap so a jittery stick does not flicker; sliders and drop-downs can be reached; unplugging a pad cleans up; your callbacks can no longer throw out of the module.
