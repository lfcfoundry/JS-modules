# fuzz-kit developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.3.4 · API 1 · 2026-10-24

### Quick
README notes that GNOME Web is no longer a test browser; naming it still works. No code change.

### Deep
Shipped in JS-modules PR 161 (merged 2026-10-24).
Documentation only: a note that GNOME Web (epiphany) is no longer a test browser as of 2026-10-24; the default hunt (Chrome and Firefox) is unchanged and naming epiphany still works. Code unchanged.

## 1.3.3 · API 1 · 2026-10-22

### Quick
1.3.3: Chromium's refusals of a file picker that no real tap opened or that closed at once ('User activation required', 'Must be handling a user gesture', 'The user aborted a request') are no longer findings.

### Deep
Chromium refuses showSaveFilePicker/showOpenFilePicker/showDirectoryPicker when a fuzz tap is not a real user tap, with three wordings: 'User activation required', 'Must be handling a user gesture to show a file picker' and 'The user aborted a request' (the third was found only by a real Chromium 155 test page; the first two came from Story Editor). They show as console errors and as page errors. All three are now always ignored by both runners; every other error, including other showSaveFilePicker errors, is still reported. Proof: fake-page checks for all three wordings in both places, and a real Chromium page that calls showSaveFilePicker without a tap: 1 false finding before, 0 after, while an unrelated console error on the same page still fails the seed.

## 1.3.2 · API 1 · 2026-10-22

### Quick
1.3.2: the WebKitGTK and GNOME Web runs no longer use eval, so games with a strict policy (no unsafe-eval) run all their operations there too.

### Deep
WebKitGTK and GNOME Web went through webkit-driver, which still ran script text with eval and new Function; a strict policy refused it and every seed ended at 0 operations (GNOME Web) or as hung after 90 s (WebKitGTK). Script text and multi-argument calls now go through the driver without eval, the page's __fuzz-ready and __fuzz-op signals reach the runner in WebKit, and the first operation starts 40 ms after the start call so a freezing first operation cannot swallow its answer. On a strict-policy page: 0 of 150 operations before, 150 of 150 in both WebKit browsers after.

## 1.3.1 · API 1 · 2026-10-22

### Quick
1.3.1: the runner no longer waits for the page with script that needs eval, so games with a strict policy (no unsafe-eval) run all their operations.

### Deep
The page now says __fuzz-ready on the console when it has an answer or an input request; both runners (Playwright for Python, puppeteer) wait on that instead of wait_for_function/waitForFunction. No change to findings, seeds or the page API.

## 1.3.0 · API 1 · 2026-10-22

### Quick
New: the background hunt and the runner now also drive WebKitGTK and GNOME Web, so all four test browsers can be hunted. A stuck page in WebKit is reported as hung, as in Chrome and Firefox.

### Deep
WebKitGTK and GNOME Web can now be hunted. New file runner/webkit_browser.js gives tools/webkit-driver the few Puppeteer calls the runner uses (contexts, several arguments to evaluate, string scripts, waiting with a clock of its own so a stuck page cannot hold the run), and fuzz_puppeteer.mjs takes --browser webkitgtk or epiphany; background.js lists both next to Chrome and Firefox instead of 'not run'. Same app, same seeds, 6 seeds in each of the four browsers: the planted bug was found in 24 of 24 seeds and every one shrank to the same 3 operations in all four (6 of 6 in each). A whole four-browser hunt of 6 seeds took 36 s. A page stuck in an endless loop is reported as 'hung' after the seed time (5 s in the test), 2 of 2 times in WebKitGTK, with no WebKit process left behind. Fixed: the browser path variable of one browser (CHROME) was handed to any other browser the runner did not know; each browser now reads only its own (CHROME, FIREFOX, EPIPHANY). Not available in WebKit: CPU throttling, popup, crash and navigation events, console.debug for --hang-trace, and --init runs after the page loads instead of before its scripts. The one WebKit window is reused between seeds after clearing the page, local and session storage and cookies. 214 Node checks (208 before). Size: no change to the engine; runner/webkit_browser.js is about 6 KB.

## 1.2.0 · API 1 · 2026-10-22

### Quick
New background hunt: start a long fuzz run that carries on without the terminal, stops on request, and writes its findings to a folder. Chrome and Firefox now; the runner also works with puppeteer-core.

### Deep
Background hunt (runner/background.js): start, status, stop. One browser at a time at lowest priority, batches of seeds with shrink and saved bundles, findings.md rewritten after each batch, DONE marker, plain-words status. The 6-seed run of the example app with its planted bug took 20 s for Chrome and Firefox together and found the bug in all 12 seeds; stop ended a 400-seed hunt within 8 s. The runner now prints the real browser version on its first line and finds puppeteer-core through NODE_PATH. WebKitGTK and GNOME Web: not run (no Puppeteer-style driver); listed as such in the findings.

## 1.1.0 · API 1 · 2026-10-16

### Quick
Fixed: a page stuck in an endless loop no longer freezes the whole test run; it is reported as hung with the step that froze. Keyboard tests now work in Firefox, and tests can run in several browsers at once.

### Deep
Fixed: a page stuck in an endless loop used to freeze the test run for good (over 100 seconds with a 4-second limit); now the run says "hung" and names the step that froze, in 8 to 11 seconds in Chromium and Firefox. Testing with real keyboard input in Firefox failed on every seed tried (4 of 4) because Firefox does not know the key name "Space"; now 4 of 4 pass. New and optional: `--jobs N` runs seeds in several browsers at once (a slow 16-seed test took 4.7 seconds instead of 12.0 in Chromium, about 2.5 times faster, and 16 instead of 20 in Firefox; each browser uses about 350 MB); `swarm` (`--swarm 0.3`) leaves a random part of the steps out of each run so rare situations show up (on a test game, 15 of 600 seeds found a bug that normal runs never found, 0 of 600, while the common bug turned up 105 times instead of 73; using it on every second seed kept most of both, 95 and 6); `--check-repeat` says in plain words whether a seed plays the same game every time, at the cost of about two extra seeds; `final` is a check that runs once after the last step (for example "undo everything, redo everything, the story must come back the same") and shrinks like any other finding (a failure needing 5 steps was cut from 60 steps to those 5); `Fuzzer.Input.pickVisible` picks a random usable button about 12 times faster on a busy page (0.2 ms instead of 2.4 ms with 400 buttons); `--replay FILE` re-runs a saved short failure with one command (the demo bug replays in 3 steps); `--executable PATH` uses a browser program you name, and `--seeds 1-5,9` accepts lists. Changed: shrinking replays 2 to 9 percent fewer steps and makes about 3 fewer tries, with the same result in 449 of 450 test cases. Everything old works the same. Measured on a 4-core cloud machine in Chromium 141 and 153 and Firefox 157; not yet repeated on Firefox 158 and Chromium 155.

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
