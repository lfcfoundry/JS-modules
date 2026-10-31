# field-report changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-31
- New frames modes: 'play' records only while the app says it is animating; 'external' takes frame times from the app's own loop (fr.frame(ts)), so there is no second animation-frame callback.

## 1.0.2 · API 1 · 2026-10-22
- 1.0.2: the version the module reports (FR.version and the report footer) now says 1.0.2; 1.0.1 still reported 1.0.0.

## 1.0.1 · API 1 · 2026-10-22
- 1.0.1: the Save buttons now really download the report file; before, a wrong type test sent every browser to the copy box.

## 1.0.0 · API 1 · 2026-10-22
- First version: five taps in a page corner open two hidden buttons that save a speed report and an error log from a real device as small files, with no network.

## 1.0.0 · API 1 · 2026-10-22
- First version: five taps in a page corner open two hidden buttons that save a speed report and an error log from a real device as small files, with no network.
