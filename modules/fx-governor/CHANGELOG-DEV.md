# fx-governor developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.1.1 · API 1 · 2026-10-17

### Quick
The demo and the README say FPS instead of "fps". Words only.

### Deep
The demo label and the README say FPS instead of "fps" and "frames a second". Words only: no code, number or threshold changes.

## 1.1.0 · API 1 · 2026-10-16

### Quick
Very slow devices are no longer missed: they now step down to lighter effects within a few seconds. A weak window now steps down after about 3 seconds instead of 6.

### Deep
Very slow devices are no longer missed. Before, a device slower than 4 frames a second looked like one endless pause and was never stepped down; now three long gaps in a row count as a slow device, and in a simulation a 3 fps device steps down after 3.6 seconds and a 1 fps device after 5.0 seconds. A window under half the line (under 18 fps by default) now steps down after one window (about 3 seconds) instead of two (about 6 seconds); the new option `severe` sets that share, and 0 turns it off. `choose()` with an unknown name no longer locks, and `release('full')` sets the level and hands control back. README now shows a Try full effects again button and how to remember the level between visits, so a slow phone does not repeat the first 3 to 6 seconds of slow play on every launch. Measured in a simulation with fake frame times, not on a real phone.

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
