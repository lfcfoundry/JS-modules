# webkit-driver changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-17
First version. Starts WebKitGTK 2.52.6 or GNOME Web 46.5 through their own WebDriver and gives Playwright-style page calls (`goto`, `evaluate`, `waitForFunction`, mouse, keyboard, wheel, screenshot, `setViewport`, console and page errors) with no packages. Measured on a cloud container with software drawing: WebKitGTK starts in about 1.8 seconds and its 12 browser checks take about 2 seconds; GNOME Web's take about 8 seconds. It ran the whole Net Flow Map browser test (82 checks, 40 seconds) in WebKitGTK. Where GNOME Web refuses WebDriver input, the mouse and keys are sent as DOM events by script (untrusted events); WebKitGTK uses real input.
