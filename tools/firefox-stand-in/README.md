# firefox-stand-in

**Version 1.1.0 · API 1**

**Tested in:** Firefox 158.0 (24 checks of the stand-in, 25 s; pad-nav 105, back-close 11, canvas-probe 18, lzma-pack, frame-kit example). Not run: ungoogled Chromium 155, WebKitGTK.

Run a Playwright-for-Python test in **stock Firefox** without rewriting it. Playwright cannot drive the Firefox you download from Mozilla (it needs its own patched build, which some environments cannot fetch), so tests written for Playwright could only run in Chromium. `run-in-firefox.py` serves the test's `from playwright.sync_api import sync_playwright` from `pwfirefox.py`, a small copy of the Playwright calls this repository's tests use, driving Firefox through Selenium and geckodriver.

## Why it exists
Playwright cannot drive the Firefox you download from Mozilla, so a test written for Playwright could only run in Chromium. This stand-in lets such a test run in real stock Firefox without being rewritten.

## Use
```
pip install selenium
export FIREFOX_PATH=/path/to/firefox GECKODRIVER_PATH=/path/to/geckodriver      # or have both on the PATH
python3 tools/firefox-stand-in/run-in-firefox.py modules/pad-nav/test/run.py   # the test file, then its own arguments
```
A banner on stderr says which Firefox ran (`pwfirefox: Firefox 158.0`), so label the result with it. The test browser is Firefox 158 (see the Tests section of the main README), and every check below was run on it. Tests: `python3 tools/firefox-stand-in/test/run.py` (24 checks, about 25 seconds, most of it starting Firefox; exits 2 with a message when Selenium, Firefox or geckodriver is missing).

## Should this test use it? (read this first)
It is a stand-in, not Playwright. Use it only when it fits the task at hand:

| Situation | Use it? |
|---|---|
| You need to know whether a behavior test passes in real Firefox, and the test only uses the calls listed below | **Yes.** Results are real Firefox results. |
| The test needs a second page or tab (`tab-guard`, the two-copy part of `storage-probe`) | **No.** One page at a time. Use `tests/firefox.js` (Puppeteer over WebDriver BiDi) or write the check there. |
| The test needs to take a screenshot, block the network, emulate a phone (`is_mobile`, `has_touch`) or download files | **No** (not built; the call stops with a plain message). Run it in Chromium, or extend `pwfirefox.py`. |
| The test needs the page to be offline | **Careful.** `route()` is accepted but blocks nothing, and a warning says so. Fine for `file://` pages that make no requests. |
| You need a page error that happens while the page is still loading | **Careful.** Page errors are collected from the moment the page finished loading; one thrown by a script during load is not seen. |
| The task needs a phone, Safari or WebKit | **No.** Firefox on a computer only. |
| You only need "does the page load and work in Firefox" | `tests/firefox.js` is simpler (no Selenium); use this when a whole Playwright test already exists. |

Every unsupported call raises `NotImplementedError` with a sentence naming what is missing and what is supported. It never returns a wrong answer quietly, so a test that runs to its end through the stand-in really ran.

## Tests in this repository, checked on 2026-10-24 in Firefox 158.0
| Test file | Result through the stand-in |
|---|---|
| `modules/pad-nav/test/run.py` | passes, 105 checks, 15 s |
| `modules/back-close/test/run.py` | passes, 11 checks, 7 s (its summary line says "chromium", which is the name the test prints; the browser was Firefox) |
| `tools/canvas-probe/test/browser.py` | passes, all checks, 3 s |
| `tools/lzma-pack/test/browser.py` | passes, 36 s |
| `modules/frame-kit/test/check-example.py` | passes with no problems (new in 1.1.0: console messages and failed loads are now seen; its "browser: Chromium" line is the test's own label, Firefox ran) |
| `modules/tab-guard/test/run.py` | not supported: needs a second page |
| `tools/storage-probe/test/run.py` | not supported: several contexts, `get_attribute`, downloads and init scripts |
| `tools/fuzz-kit/test/browser.py` | not supported: uses `accept_downloads` and more |
| `tools/ppmd-pack/test/browser.py` | not supported: `new_context(java_script_enabled=False)` |

## What it supports
`sync_playwright()`; `p.firefox.launch()` and `p.chromium.launch()` (**both start Firefox**; `webkit` is refused) with `headless` and `executable_path` (given to `chromium.launch` it is the path to Chrome and is ignored: Firefox comes from `FIREFOX_PATH`); `browser.new_context(viewport=...)`, `browser.new_page()`, `browser.version`, `browser.close()`; `context.new_page()`, `context.route()` (blocks nothing); `page.goto`, `set_content`, `evaluate`, `add_script_tag(content= or path=)`, `wait_for_function`, `wait_for_timeout`, `title()`, `url`, `inner_text(selector)`, `click(selector)`, `wait_for_selector(selector, state=)`, `on('console')`, `on('requestfailed')`, `on('pageerror', cb)`, `keyboard.press` (also `Shift+a`-style combinations, `down`, `up`), `mouse.click(x, y)`, `mouse.move(x, y)`; `TimeoutError`.

How it behaves, so a result can be trusted:
- `evaluate` runs your code **in the page's own world** (through a script element), so a page global you assign is the one the page's scripts see. A string is an expression (several statements are fine; the last value is returned); a string that evaluates to a function is called with the one optional argument, like Playwright; a promise is awaited. A page with a strict Content-Security-Policy that forbids inline scripts will refuse this.
- Keys and mouse clicks go through geckodriver's real input actions, so the page gets trusted events (`isTrusted` is true).
- `on('console')` and `on('requestfailed')` see what happens after they are set; messages printed and files that failed while the page was loading are not seen. They arrive when the test next calls `evaluate`, `wait_for_timeout` or `wait_for_selector`. Failed loads are pictures, scripts, style sheets, media and frames (not `fetch`).
- `evaluate` leaves a small `data-pw-r` attribute on the root element for a moment to carry the result back.

## Prior art and credits
- Playwright for Python: only its call names and shapes (`sync_playwright`, `launch`, `new_page`, `goto`, `evaluate` and the others listed above) are copied, so an existing test runs unchanged. No Playwright code is included.
- Selenium and geckodriver do the driving, and Firefox is the browser; none of them is included here. `pwfirefox.py` imports Selenium (install it with `pip install selenium`) and otherwise only Python's standard library.
- The code is written for this repository (LFC Foundry, MIT); the headers of both Python files name no outside code.

## For AI agents
- Keep it small and honest: add a call only when a real test needs it, give it a check in `test/run.py`, and keep the plain-words `NotImplementedError` for everything else. Do not make `route()` pretend to block, or `chromium` pretend to be Chromium.
- When you run a test through it, say so in the result ("run through the Firefox stand-in, Firefox 158") and name any call the test made that behaves differently from Playwright's (route, load-time errors).
- Python 3 and Selenium 4 only; nothing here ships in a game.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
