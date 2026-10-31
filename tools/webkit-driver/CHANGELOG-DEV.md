# webkit-driver developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.4.1 · API 1 · 2026-10-24

### Quick
README says GNOME Web is no longer a test browser; the option still works. No code change.

### Deep
Shipped in JS-modules PR 161 (merged 2026-10-24).
Documentation only: a note that GNOME Web (the epiphany option) is no longer a test browser as of 2026-10-24 and that the repository's checks use WebKitGTK only. Code unchanged.

## 1.4.0 · API 1 · 2026-10-22

### Quick
1.4.0: new runScript() runs script text without eval, waitForFunction no longer needs eval, and fuzz-kit debug messages are passed on.

### Deep
New page.runScript(text): runs script text in the global scope as an inline script element (falls back to the driver's own script call if inline scripts are blocked), so pages with a strict policy (no unsafe-eval) work. waitForFunction is rebuilt without new Function. Console debug messages starting with __fuzz- are now passed on like console.error, for fuzz-kit.

## 1.3.0 · API 1 · 2026-10-18

### Quick
New attach() lets a check reuse a WebKit browser that is already open instead of starting a new one.

### Deep
Added attach(info, opts): connects to an already running WebDriver session (the warm browser kept by test-runner's warm daemon) instead of launching a new one; launch() is unchanged. Used by test-runner 1.0.0: one tiny job in WebKitGTK 591 to 33 ms and in GNOME Web 6,035 to 104 ms (smaller is better).

## 1.2.0 · API 1 · 2026-10-17

### Quick
Scripted input in GNOME Web now behaves like a real mouse and keyboard for pages that use pointer events, so all five piece checks pass there.

### Deep
Scripted input in GNOME Web now behaves like a real mouse and keyboard for pages that use pointer events. Before: only mouse events were sent, so the grown-ups-door piece check failed at its first hold in GNOME Web 46.5 (1 of 5 piece checks failing there, plus the slow-note slow-tap check). After: all 5 of 5 piece checks pass in GNOME Web 46.5. New in scripted input: pointermove, pointerdown and pointerup (one primary mouse pointer, id 1) sent before the matching mouse events, and a cancelled pointerdown hides the mouse events after it as in a real browser; setPointerCapture, releasePointerCapture and hasPointerCapture work (moves after leaving the element still reach it, lostpointercapture fires on release); a press moves the focus to the button, link or field pressed; mouse events carry a click count (1, 2, ...) so pages can tell a mouse click from a keyboard click; Enter presses a focused button or link and Space presses a button on release unless the page cancelled the key. WebKitGTK real input is unchanged. One thing stays out of reach: browsers time only real input, so the slow-note slow-tap check is reported as not checked in GNOME Web instead of failing.

## 1.1.0 · API 1 · 2026-10-17

### Quick
Killing a test run no longer leaves stray processes behind, and clicks are faster.

### Deep
Stray processes: killing a test run with SIGTERM or Ctrl-C used to leave 7 processes behind (virtual screen, message bus, driver, browser); now 0 are left (measured in WebKitGTK 2.52.6). Clicks are faster: 20 to 22 ms before, 16.6 to 17.8 ms when the pointer moves (about 17% faster) and 5.8 to 7.6 ms when it is already there (about 70% faster), because press and release now travel in one call. waitForFunction now checks inside the page every frame instead of every 50 ms from Node, so a condition that becomes true after 120 ms was seen after 162 to 164 ms and now after 130 ms; a condition that throws now rejects instead of hanging until the timeout. New launch options (all off by default): deviceScaleFactor (whole numbers; the page sees devicePixelRatio 2 with the same page area), colorScheme: 'dark' and reducedMotion: true (the matching media queries become true), and serve (loads your files through a small local web server so errors thrown while a page loads are reported with their real text; on a test page 2 of 2 load-time errors were caught, versus 0 of 2 from a file:// page). The file grew by 3,316 bytes (973 gzipped). Not measured: Netflow Map's own 82-check suite with the patch.

## 1.0.0 · API 1 · 2026-10-17

### Quick
First version: starts WebKitGTK or GNOME Web and gives Playwright-style page calls with no packages.

### Deep
First version. Starts WebKitGTK 2.52.6 or GNOME Web 46.5 through their own WebDriver and gives Playwright-style page calls (`goto`, `evaluate`, `waitForFunction`, mouse, keyboard, wheel, screenshot, `setViewport`, console and page errors) with no packages. Measured on a cloud container with software drawing: WebKitGTK starts in about 1.8 seconds and its 12 browser checks take about 2 seconds; GNOME Web's take about 8 seconds. It ran the whole Netflow Map browser test (82 checks, 40 seconds) in WebKitGTK. Where GNOME Web refuses WebDriver input, the mouse and keys are sent as DOM events by script (untrusted events); WebKitGTK uses real input.
