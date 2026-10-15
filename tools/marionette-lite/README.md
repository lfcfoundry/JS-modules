# marionette-lite

Drive Firefox from Python with the standard library only: no selenium, no geckodriver, no pip installs. About 5 KB.

```python
from marionette_lite import Firefox
fx = Firefox(binary='/path/to/firefox', width=500, height=900, dpr=1.0)   # headless by default
fx.go('file:///tmp/game.html')
print(fx.js('return [innerWidth, devicePixelRatio]'))
fx.shot('/tmp/page.png')
fx.close()
```
Firefox has a built-in remote-control server (Marionette, `--marionette`). It speaks `<length>:<json>` messages over a local socket; this file implements just enough of it to open pages, run JavaScript (as a function body, use `return`), resize the window, switch dark mode, and take screenshots. A fresh profile is created each run. `Firefox(prefs={'privacy.resistFingerprinting': True})` tests strict privacy mode.

## How it differs
Mozilla's `marionette_driver` package and Selenium both work, but need installs and a driver. This is one readable file for the common case.

## Limits
Local use only. No element objects or waits; use `js()` for those. The Marionette protocol can change between Firefox versions.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
