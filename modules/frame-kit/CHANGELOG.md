# frame-kit changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.2.1 · API 1 · 2026-10-17
- The frame-rate badge now reads "60 FPS" instead of "60 fps". Nothing else changes.

## 1.2.0 · API 1 · 2026-10-17
- New trimming tool writes smaller copies of the two files without the parts a game does not use. The full files work as before.

## 1.1.0 · API 1 · 2026-10-16
- The quality governor now steps down on very slow devices instead of ignoring them.
- New options keep it from stepping back up, or lock a quality level.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- Early October 2026: First version: `EvenDt`, `QualityGovernor` and `JobPump`.
- 2026-10-14: New `FrameMeter`: frames a second, slowest frame, hitch count with a game-or-device cause, tap-to-next-frame delay and a plain-words verdict.
- 2026-10-15: `FrameMeter` no longer counts a tab that comes back after a long hidden spell as a hitch. `JobPump` stops on step count when the clock is coarse, and accepts a bare `performance.now`.
- 2026-10-15: New flip-flop guard in `QualityGovernor` (the slow level-up-and-down cycle). It is off unless `flipLimit` is set.
