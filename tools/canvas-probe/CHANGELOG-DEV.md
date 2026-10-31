# canvas-probe developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.1.1 · API 1 · 2026-10-24

### Quick
Notes now say the probe's browser checks pass in Firefox 158 and Chromium 155. No code change.

### Deep
Shipped in JS-modules PR 160 (merged 2026-10-24).
Documentation only, code unchanged. The README said the browser checks had not been run in Firefox, but the Firefox stand-in already passed all 18 on Firefox 157.0.1. Rerun today: all 18 pass in Firefox 158.0 (3 s) and in ungoogled Chromium 155.0.8059.39-1; 94 Node checks pass. New file test/browsers.js runs the same three in-page scripts through the shared test runner: its 10 grouped checks pass in Firefox 158.0, ungoogled Chromium 155.0.8059.39-1 and WebKitGTK 2.52.6. README tested-in lines updated.

## 1.1.0 · API 1 · 2026-10-16

### Quick
The probe slows your game less, and a new check gives a plain pass or fail with problems listed in words.

### Deep
The probe slows the game less: on a test frame of 5,500 canvas calls it added 2.3 ms instead of 3.7 ms to a 3.1 ms frame (about 40 percent less extra time in one run, up to 60 percent in another, in Chromium 141), because it now reads the transform once per draw. New: `probe.check(limits)` gives a pass or fail with plain-words problems (leaks, restore without save, source overhang, growing paths, and a calls-per-frame ceiling) so a game needs no checking code of its own; the report has a per-frame total of calls; and `install({ deep: true })` counts draws made with a filter, a shadow or a blend mode, the ones that cost the most. README now explains the rejected-style-write and method-name limits and says to run games with their quality governor off while the probe is on. The code is the same size (12,672 against 12,678 bytes minified before the new options).

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
