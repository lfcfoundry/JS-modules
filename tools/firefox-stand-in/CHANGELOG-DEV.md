# firefox-stand-in developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-24

### Quick
Tests can now watch console messages and failed loads and wait for a selector, so one more test file runs in Firefox.

### Deep
Shipped in JS-modules PR 160 (merged 2026-10-24).
New calls so more existing Playwright tests run in stock Firefox: page.on('console') (type and text of messages made after it is set), page.on('requestfailed') (pictures, scripts, style sheets, media and frames that fail to load), and page.wait_for_selector with visible, attached, hidden and detached states. chromium.launch(executable_path=...) no longer tries to start Chrome's file as Firefox (a test written for Chromium passes its Chrome path; Firefox now comes from FIREFOX_PATH). The frame-kit example check now passes in Firefox 158 with no problems found. Measured on Firefox 158.0 (one run): the stand-in's own test takes 25.1 s, not the 7 s written before (starting Firefox takes 1.9 s of each launch, each evaluate call about 9.6 ms), so the README says 25 s. The four test files checked before on Firefox 157.0.1 were rerun on 158.0: pad-nav 105 checks 15 s, back-close 11 checks 7 s, canvas-probe all 18 checks 3 s, lzma-pack all checks 36 s. Still not supported: several browser contexts, downloads, init scripts, get_attribute and java_script_enabled=False, so storage-probe and ppmd-pack tests stay Chromium-only.

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
