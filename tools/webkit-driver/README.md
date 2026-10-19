# webkit-driver

**Version 1.3.0 · API 1**

**Tested in:** not recorded.

A Node file with no dependencies that starts **WebKitGTK** (the WebKit engine for Linux, the nearest thing to Safari a Linux test machine can run) or **GNOME Web** and gives you the small set of page controls that Playwright and Puppeteer give: `goto`, `evaluate`, `waitForFunction`, `mouse.move/down/up/click/wheel`, `keyboard.press`, `screenshot`, `setViewport`, and `on('pageerror')` / `on('console')`.

It starts `WebKitWebDriver` (the WebDriver program WebKitGTK ships) and sends it each call over plain HTTP in the W3C WebDriver protocol, then hands the answer back as the Playwright-style call result.

## Why it exists
Playwright and Puppeteer cannot drive WebKitGTK (Playwright only drives its own patched WebKit build, which many networks do not let you download). WebKitGTK ships its own WebDriver, `WebKitWebDriver`, and this file speaks the W3C WebDriver protocol to it over plain HTTP.

## Try it and test it
**Test it:** `node tools/webkit-driver/test/run.js` (pretend driver, no browser, 7 checks) and `node tools/webkit-driver/test/webkit.js` (a real WebKitGTK 2.52.6, 17 checks, about 5 seconds; `node tools/webkit-driver/test/webkit.js epiphany` does the same in GNOME Web 46.5, about 8 seconds).

## Quick start

```js
var WD = require('./webkit-driver.js');
var b = await WD.launch({ width: 1280, height: 800 });      // { browser: 'epiphany' } for GNOME Web
console.log(b.version);                                       // "MiniBrowser 2.52.6"
var p = b.page;
p.on('pageerror', function (e) { console.log('page error', e.message); });
await p.goto('file:///path/to/page.html');
await p.waitForFunction(function () { return window.ready; }, null, { timeout: 20000 });
var n = await p.evaluate(function (x) { return document.querySelectorAll('li').length + x; }, 2);
await p.mouse.click(120, 120); await p.keyboard.press('Escape');
await p.screenshot({ path: 'shot.png' });
await b.close();
```

It needs `WebKitWebDriver` on the machine, plus `xvfb-run` and `dbus-run-session` when there is no screen (a cloud container). The `browsers` branch of the knowledge base installs all three (`sh install.sh` as root).

## API

- `launch(opts)` resolves to `{ page, version, close() }`. Options: `browser` (`'webkitgtk'` default, or `'epiphany'`), `width`, `height` (default 1280 x 800), `timeout` (how long one page script may run, default 600000 ms), `driver` and `binary` (paths), `xvfb` (default: only when there is no `DISPLAY`), `port`, and four that are off by default:
  - `deviceScaleFactor` (whole numbers only): the page sees `devicePixelRatio` 2 with the same page area.
  - `colorScheme: 'dark'`: `prefers-color-scheme: dark` becomes true.
  - `reducedMotion: true`: `prefers-reduced-motion: reduce` becomes true.
  - `serve` (`true` serves the current folder, or give a folder path): `goto('file:///...')` for a file under that folder is loaded over `http://127.0.0.1` through a small local web server, so errors thrown while the page loads are reported with their real text. Two things change: the page's origin is `http://127.0.0.1:...`, so `localStorage` is not shared with `file://`; and a page whose security policy only allows hashed or nonce scripts would block the hook that reports errors. `close()` ends the driver and the whole process group; exiting Node does too.
- `page.goto(url)`: loads and waits for the load event.
- `page.evaluate(fn, arg)`: runs `fn(arg)` in the page. The argument and the answer must be JSON-able; a returned promise is awaited; an error thrown in the page is thrown here with its message. Answers travel as one JSON string, so a large array (a million numbers) works.
- `page.waitForFunction(fn, arg, { timeout })`: checks inside the page, once per frame, until `fn(arg)` is truthy; rejects after the timeout (default 20000 ms), and rejects at once if `fn` throws.
- `page.mouse.move(x, y, { steps })`, `.down()`, `.up()`, `.click(x, y)`, `.wheel(dx, dy)`; `page.keyboard.press('Escape' | 'ArrowRight' | 'a' | 'Control+a')`.
- `page.setViewport({ width, height })`: sizes the window so the page area is exactly that.
- `page.screenshot({ path })`: PNG of the page area; resolves to a Buffer.
- `page.on('pageerror', fn)` and `page.on('console', fn)` (console errors only; `m.type()` is `'error'`, `m.text()` is the text).

## How it differs from what exists

`selenium-webdriver` and WebdriverIO can talk to WebKitGTK too, but they are large packages and they have their own page API, so a test written for Playwright or Puppeteer has to be rewritten. This file is about 200 lines, has no dependencies and copies the Playwright and Puppeteer call names for the handful of calls a test needs, so an existing test needs only a new launch line. Its sibling [firefox-stand-in](../firefox-stand-in/README.md) does the same job for stock Firefox and Playwright for Python. The smoke test in the knowledge base's `browsers` branch (`webkitgtk/webdriver-smoke.py`) proves the driver starts; this is what you then write tests with.

## Limits

- **Linux only**, and WebKitGTK is not Safari: it catches many but not all iPhone-only problems. It runs software drawing in a container, so it says nothing about real graphics speed. WebGPU is not available in it.
- Errors thrown **while the page is loading** are not seen on a plain `file://` page (the hook goes in right after the load event); with the `serve` option they are. Errors after the load are always seen.
- WebKitGTK 2.52.6 has **no BiDi** and **no touch events** (a touch test is done with the mouse).
- Only **console errors** are reported, not other console output.
- **GNOME Web (Epiphany 46)** refuses the WebDriver input calls (`unsupported operation`), so there the mouse, wheel and keys are sent as DOM events by script. Those events are untrusted, so a page that insists on real ones will not react. WebKitGTK itself (`MiniBrowser`) uses real input.
- A WebGL canvas that has been shown on screen is **empty if read back in a later task** (WebKit clears it); draw and read in the same task, as the Netflow Map browser test does.
- Never run it at the same time as another browser: timings go flaky.
- Tested in WebKitGTK 2.52.6 and GNOME Web 46.5 (Ubuntu 24.04 packages from the `browsers` branch) with Node 22. Not run on a phone, Safari or macOS.

## Prior art and credits
- Playwright and Puppeteer: the call names (`goto`, `evaluate`, `waitForFunction`, `mouse`, `keyboard`, `screenshot`, `on('pageerror')`) are copied so an existing test needs only a new launch line. Names only, no code from them.
- selenium-webdriver and WebdriverIO: named for comparison only (see "How it differs from what exists"). No code from them.
- The W3C WebDriver protocol: the published standard this file speaks to `WebKitWebDriver` over plain HTTP.
- `WebKitWebDriver`, WebKitGTK and GNOME Web are programs it starts; none of them is included here.
- The code is written for this repository (LFC Foundry, MIT). It uses only Node's own modules (`http`, `net`, `child_process`, `fs`, `path`, `os`) and its header names no outside code.

## For AI agents

- Use it when a test already written for Playwright or Puppeteer must also run in WebKit: copy the file, add a `webkit` branch to your browser opener that calls `launch`, and map your helper calls to the page methods above.
- Run the browsers one at a time and label each result with the version `b.version` prints.
- Read back WebGL pixels in the same task as the draw call (see Limits).
- Put anything the page needs to answer into `evaluate`'s return value as JSON; do not return DOM nodes.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
