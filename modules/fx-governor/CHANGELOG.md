# fx-governor changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16
Very slow devices are no longer missed. Before, a device slower than 4 frames a second looked like one endless pause and was never stepped down; now three long gaps in a row count as a slow device, and in a simulation a 3 fps device steps down after 3.6 seconds and a 1 fps device after 5.0 seconds. A window under half the line (under 18 fps by default) now steps down after one window (about 3 seconds) instead of two (about 6 seconds); the new option `severe` sets that share, and 0 turns it off. `choose()` with an unknown name no longer locks, and `release('full')` sets the level and hands control back. README now shows a Try full effects again button and how to remember the level between visits, so a slow phone does not repeat the first 3 to 6 seconds of slow play on every launch. Measured in a simulation with fake frame times, not on a real phone.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- Early October 2026: First version: steps visual effects down when frames run slow.
- 2026-10-15: Its loop now stops when told to, and the README no longer says it checks timers (it does not).
