# field-report developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-31

### Quick
Games can stop paying for a second frame loop.

### Details
frames 'play' (from Pineapple Defense's patch: the default loop cost about 39 ms a second on an idle title screen) runs the callback only between fr.frames(true) and fr.frames(false); frames 'external' (asked by Fancy Banana) runs none, and fr.frame(ts) records from the app's loop; fr.frames(false/true) pauses and resumes any mode, and the gap is not counted. The default (true) is unchanged.

## 1.0.2 · API 1 · 2026-10-22

### Quick
1.0.2: the version the module reports (FR.version and the report footer) now says 1.0.2; 1.0.1 still reported 1.0.0.

### Deep
Fix: field-report 1.0.1 shipped with its header saying 1.0.1 but the VERSION constant (FR.version, and the 'field-report X' text in every saved report) still reading 1.0.0. Both now read 1.0.2, and a new check compares the header with FR.version so it cannot drift again. No other change.

### 2026-10-24 · no version change · JS-modules PR 162
Comment and message text only in a test file (test/run.js): GNOME Web is no longer named as a test browser there. No code or behavior change; Node checks pass.

## 1.0.1 · API 1 · 2026-10-22

### Quick
1.0.1: the Save buttons now really download the report file; before, a wrong type test sent every browser to the copy box.

### Deep
Fix. field-report tested typeof URL === 'object', but URL is a function in every browser, so the file download never ran and Save always fell back to the copy box. The test is now typeof URL === 'function'. The check that should have caught it passed when no download happened; it now requires exactly one download with a dated .md name (it fails on 1.0.0's line, passes on 1.0.1's). Found by the Pineapple Defense thread. 44 of 44 checks pass. No size change worth noting (one word).

## 1.0.0 · API 1 · 2026-10-22

### Quick
First version: five taps in a page corner open two hidden buttons that save a speed report and an error log from a real device as small files, with no network.

### Deep
New module. Five taps in a page corner (top-left by default) open a panel with Save speed report and Save error log; each saves one small Markdown file; no network request, no names. Speed report: start-up (first paint, DOMContentLoaded, load, your marks), average FPS, FPS of the slowest 1%, slowest five frames, frames over 33/50/100 ms, heavy tasks (task(), time(), and the browser's long tasks in Chromium), and a plain verdict. Error log: uncaught errors, rejected promises, failed loads, page-policy blocks, console.error/warn, repeats counted, last 200 kept. 44 of 44 Node checks; browser check 15 of 15 in Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5 under a strict page policy (no inline script or style): real-mouse five taps open the panel, both buttons save, every planted error kind is listed, frames recorded (average 41 to 58 FPS in the headless test pages), and no request beyond the page files. Size: field-report.js see the README table.
