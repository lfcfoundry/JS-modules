# frame-kit changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16
`QualityGovernor` no longer ignores very slow devices. Before, a frame gap over 100 ms was treated as a pause and never counted, so a phone under 10 frames a second was never stepped down; now four long frames in a row count as a slow device. In a simulation with fake frame times a 6.7 fps phone is stepped down after about 15 seconds and a 1 fps phone after about 102 seconds (it still counts 100 frames before it decides). New option `stepUp: false` (only ever steps down) and new `lock()` / `unlock()` keep a level the player picked. A single stall still changes nothing.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- Early October 2026: First version: `EvenDt`, `QualityGovernor` and `JobPump`.
- 2026-10-14: New `FrameMeter`: frames a second, slowest frame, hitch count with a game-or-device cause, tap-to-next-frame delay and a plain-words verdict.
- 2026-10-15: `FrameMeter` no longer counts a tab that comes back after a long hidden spell as a hitch. `JobPump` stops on step count when the clock is coarse, and accepts a bare `performance.now`.
- 2026-10-15: New flip-flop guard in `QualityGovernor` (the slow level-up-and-down cycle). It is off unless `flipLimit` is set.
