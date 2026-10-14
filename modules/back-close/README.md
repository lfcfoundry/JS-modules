# back-close

Makes a phone's back swipe (or back button) close the top panel instead of leaving the page. About 2 KB, no dependencies.

## Use
```js
BackClose.watch(panel, function () { closePanel(); });   // panel: any element that uses the `hidden` attribute
```
The watcher is on while the panel is shown (no `hidden` attribute) and off when it is hidden, however that happened, so your own close button needs no extra code. If your function leaves the panel open (for example while a button is locked), the watcher is armed again. `watch` returns `{ supported, destroy() }`.

## Why
On a phone, a pop-up that does not respond to the back gesture sends the player out of the game or to the previous site. `CloseWatcher` is the browser's own "close request" channel (the Escape key, the Android back gesture and other platform close gestures all go through it), so one hook covers them.

## Limits
- Needs `CloseWatcher` (Chrome 126+, Firefox 149+). Elsewhere `supported` is false and nothing happens; your normal close controls and Escape handler still work.
- Several panels open at once: the newest closes first. Panels shown without a tap or key in between (for example by a timer) can be grouped by the browser and close together on one back swipe. Show panels from a user action where you can.
- The automated tests drive the Escape key. The real Android back swipe goes through the same channel but has not been tried on a device by these tests.

## Prior art
`CloseWatcher` is a web standard (WICG, now in the HTML standard). Polyfills that push a history entry exist, but they change the address bar history; this module uses the standard API only and does nothing where it is missing.

## For AI agents
Call `watch` once per panel at start-up, after the panel element exists. Do not also push history entries for the same panel.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 JNFoo · extracted from [Apple Press](https://github.com/JNFoo/apple-press)
