# frame-kit developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.2.1 · API 1 · 2026-10-17

### Quick
The frame-rate badge now reads "60 FPS" instead of "60 fps". Nothing else changes.

### Deep
The frame-rate badge from FrameMeter.lines() now reads "60 FPS" instead of "60 fps" (one word changed in the first line it returns; no numbers, timings or thresholds change, and the same "worst", "tap" and verdict lines follow). The README says FPS in its frame-rate sentences too.

## 1.2.0 · API 1 · 2026-10-17

### Quick
New trimming tool writes smaller copies of the two files without the parts a game does not use. The full files work as before.

### Deep
New: modules/frame-kit/lean.py writes lean copies of even-dt.js (3 parts: options, stats, refreshRule) and quality-governor.js (7 parts: options, control, errors, flipGuard, stats, stallRules, graceStart). The full files are unchanged: 1,536 and 3,688 bytes minified (662 and 1,240 gzipped), the same 67 checks pass. Fancy Banana's sets are 985 bytes minified (506 gzipped) and 1,342 (575): 36% and 24%, and 64% and 54%, smaller than the whole files (lower is smaller), against about 378 and 630 bytes for Fancy's own inline code. Three parts swap in Fancy's rule instead of removing code, so the lean builds give Fancy's exact answers: 0 different frame steps in 50,011 frames and 0 different level changes in 78 governor runs (171 level changes), on 26 frame series, in Node and in all four browsers. The full files do not: they differ on 42,604 of those frames (median 0.026 ms, 99th percentile 1.35 ms, largest 8.8 ms) and in 9 of 78 governor runs; nothing in the full files was changed to match

## 1.1.0 · API 1 · 2026-10-16

### Quick
The quality governor now steps down on very slow devices instead of ignoring them. New options keep it from stepping back up, or lock a quality level.

### Deep
`QualityGovernor` no longer ignores very slow devices. Before, a frame gap over 100 ms was treated as a pause and never counted, so a phone under 10 frames a second was never stepped down; now four long frames in a row count as a slow device. In a simulation with fake frame times a 6.7 fps phone is stepped down after about 15 seconds and a 1 fps phone after about 102 seconds (it still counts 100 frames before it decides). New option `stepUp: false` (only ever steps down) and new `lock()` / `unlock()` keep a level the player picked. A single stall still changes nothing.

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
