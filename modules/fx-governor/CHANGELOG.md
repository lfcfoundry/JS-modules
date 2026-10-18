# fx-governor changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.1.1 · API 1 · 2026-10-17
- The demo and the README say FPS instead of "fps". Words only.

## 1.1.0 · API 1 · 2026-10-16
- Very slow devices are no longer missed: they now step down to lighter effects within a few seconds.
- A weak window now steps down after about 3 seconds instead of 6.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- Early October 2026: First version: steps visual effects down when frames run slow.
- 2026-10-15: Its loop now stops when told to, and the README no longer says it checks timers (it does not).
