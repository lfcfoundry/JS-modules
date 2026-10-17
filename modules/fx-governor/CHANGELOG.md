# fx-governor changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16
Very slow devices are no longer missed: three long gaps in a row now count as a slow device, not a pause. A window under half the line steps down after one window instead of two (new option severe, 0 turns it off). choose() with an unknown name no longer locks, and release('full') sets the level and hands control back. README now shows a Try full effects again button and how to remember the level between visits.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- Early October 2026: First version: steps visual effects down when frames run slow.
- 2026-10-15: Its loop now stops when told to, and the README no longer says it checks timers (it does not).
