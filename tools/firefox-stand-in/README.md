# firefox-stand-in

**Version 1.0.0 · API 1**

**Tested in:** Firefox 157.0.1 only (19 checks of the stand-in itself, about 7 seconds, and the test files listed in its README, 2026-10-17); not yet repeated on Firefox 158. Not run: ungoogled Chromium 155, WebKitGTK.

Run a Playwright-for-Python test in **stock Firefox** without rewriting it. Playwright cannot drive the Firefox you download from Mozilla (it needs its own patched build, which some environments cannot fetch), so tests written for Playwright could only run in Chromium. `run-in-firefox.py` serves the test's `from playwright.sync_api import sync_playwright` from `pwfirefox.py`, a small copy of the Playwright calls this repository's tests use, driving Firefox through Selenium and geckodriver.

```
pip install selenium
export FIREFOX_PATH=/path/to/firefox GECKODRIVER_PATH=/path/to/geckodriver      # or have both on the PATH
python3 tools/firefox-stand-in/run-in-firefox.py modules/pad-nav/test/run.py   # the test file, then its own arguments
```
A banner on stderr says which Firefox ran (`pwfirefox: Firefox 157.0.1`), so label the result with it. The test browser is Firefox 158 (see the Tests section of the main README); the checks below were run on Firefox 157.0.1 before that switch and are not yet repeated on 158. Tests: `python3 tools/firefox-stand-in/test/run.py` (19 checks, about 7 seconds; exits 2 with a message when Selenium, Firefox or geckodriver is missing).

## Should this test use it? (read this first)
It is a stand-in, not Playwright. Use it only when it fits the task at hand:

| Situation | Use it? |
|---|---|
| You need to know whether a behavior test passes in real Firefox, and the test only uses the calls listed below | **Yes.** Results are real Firefox results. |
| The test needs a second page or tab (`tab-guard`, the two-copy part of `storage-probe`) | **No.** One page at a time. Use `tests/firefox.js` (Puppeteer over WebDriver BiDi) or write the check there. |
| The test needs to watch `console` messages, take a screenshot, block the network, emulate a phone (`is_mobile`, `has_touch`), download files or wait for a selector | **No** (not built; the call stops with a plain message). Run it in Chromium, or extend `pwfirefox.py`. |
| The test needs the page to be offline | **Careful.** `route()` is accepted but blocks nothing, and a warning says so. Fine for `file://` pages that make no requests. |
| You need a page error that happens while the page is still loading | **Careful.** Page errors are collected from the moment the page finished loading; one thrown by a script during load is not seen. |
| The task needs a phone, Safari or WebKit | **No.** Firefox on a computer only. |
| You only need "does the page load and work in Firefox" | `tests/firefox.js` is simpler (no Selenium); use this when a whole Playwright test already exists. |

Every unsupported call raises `NotImplementedError` with a sentence naming what is missing and what is supported. It never returns a wrong answer quietly, so a test that runs to its end through the stand-in really ran.

## Tests in this repository, checked on 2026-10-17 in Firefox 157.0.1
| Test file | Result through the stand-in |
|---|---|
| `modules/pad-nav/test/run.py` | passes, 105 checks |
| `modules/back-close/test/run.py` | passes, 11 checks (its summary line says "chromium", which is the name the test prints; the browser was Firefox) |
| `tools/canvas-probe/test/browser.py` | passes, 18 checks |
| `tools/lzma-pack/test/browser.py` | passes |
| `modules/tab-guard/test/run.py` | not supported: needs a second page |
| `tools/storage-probe/test/run.py` | not supported: needs `wait_for_selector` and several pages |
| `tools/fuzz-kit/test/browser.py` | not supported: uses `accept_downloads` and more |
| `modules/frame-kit/test/check-example.py`, `tools/ppmd-pack/test/browser.py` | not supported: listen for `console` messages |

## What it supports
`sync_playwright()`; `p.firefox.launch()` and `p.chromium.launch()` (**both start Firefox**; `webkit` is refused) with `headless` and `executable_path`; `browser.new_context(viewport=...)`, `browser.new_page()`, `browser.version`, `browser.close()`; `context.new_page()`, `context.route()` (blocks nothing); `page.goto`, `set_content`, `evaluate`, `add_script_tag(content= or path=)`, `wait_for_function`, `wait_for_timeout`, `title()`, `url`, `inner_text(selector)`, `click(selector)`, `on('pageerror', cb)`, `keyboard.press` (also `Shift+a`-style combinations, `down`, `up`), `mouse.click(x, y)`, `mouse.move(x, y)`; `TimeoutError`.

How it behaves, so a result can be trusted:
- `evaluate` runs your code **in the page's own world** (through a script element), so a page global you assign is the one the page's scripts see. A string is an expression (several statements are fine; the last value is returned); a string that evaluates to a function is called with the one optional argument, like Playwright; a promise is awaited. A page with a strict Content-Security-Policy that forbids inline scripts will refuse this.
- Keys and mouse clicks go through geckodriver's real input actions, so the page gets trusted events (`isTrusted` is true).
- `evaluate` leaves a small `data-pw-r` attribute on the root element for a moment to carry the result back.

## For AI agents
- Keep it small and honest: add a call only when a real test needs it, give it a check in `test/run.py`, and keep the plain-words `NotImplementedError` for everything else. Do not make `route()` pretend to block, or `chromium` pretend to be Chromium.
- When you run a test through it, say so in the result ("run through the Firefox stand-in, Firefox 157") and name any call the test made that behaves differently from Playwright's (route, load-time errors).
- Python 3 and Selenium 4 only; nothing here ships in a game.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
