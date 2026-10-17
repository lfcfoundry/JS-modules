# back-close

**Version 1.1.0 · API 1**

**Tested in:** Node: 30 checks pass (7 new). Module browser suite passes in ungoogled Chromium 155.0.8059.39-1. Not run: that browser suite in Firefox 158.0, WebKitGTK and GNOME Web (no geckodriver on the browsers branch; no driver for the others), a phone. CloseWatcher itself is absent in WebKitGTK 2.52.6

Makes a phone's back swipe (or back button) close the top panel instead of leaving the page. About 7 KB, no dependencies.

**Test it:** `node modules/back-close/test/run.js` (fake CloseWatcher and fake history, 30 checks) and `python3 modules/back-close/test/run.py` (real browser, Escape key).

## Use
```js
var back = BackClose.watch(panel, function () { closePanel(); });   // panel: any element that uses the `hidden` attribute
closeButton.onclick = function () { back.close(); };               // optional: the X button and the controller B button take the same route
```
The watcher is on while the panel is shown (no `hidden` attribute, and the panel is in the page) and off when it is hidden, however that happened, so your own close button needs no extra code. If your function leaves the panel open (for example while a button is locked), the watcher is armed again, unless the panel was removed from the page or you called `destroy()`.

Panels shown by a CSS class or a style instead of `hidden`: pass `isShown` (and the `attributes` to watch, default `['hidden']`):
```js
BackClose.watch(panel, closePanel, { isShown: function (el) { return el.classList.contains('open'); }, attributes: ['class'] });
```
Not an element at all (drawn on a canvas, or several panels that one back swipe should close together): `BackClose.watchWhen(isOpen, close)` takes a function and a handle's `sync()` arms or removes the watcher to match it. Call `sync()` whenever panels open or close:
```js
var back = BackClose.watchWhen(function () { return anyPanelOpen(); }, function () { closeAllPanels(); });
openPanel = function () { /* ... */ back.sync(); };
```
A throwing `isShown` counts as "not shown". `watch` and `watchWhen` both return `{ supported, mode, close(), destroy(), sync() }`:
- `close()` asks the same watcher to close (`CloseWatcher.requestClose()`, or the history route below), so the on-screen X, a controller B button and the back swipe all end in your one close function. It returns `false` when the panel is not shown. In a browser without any back support it simply calls your function.
- `sync()` re-reads whether the panel is shown and arms or removes the watcher (a `watch` handle does this by itself from the attribute observer; `watchWhen` handles need it).
- `mode` is `'closewatcher'`, `'history'` (fallback in use) or `'none'`.

## Safari and iPhone: the history fallback (opt-in)
`CloseWatcher` is not in Safari or Safari on iPhone (WebKit has it only as a preview), so there the back swipe still leaves the page. Pass `{ historyFallback: true }` to use the old History pattern in browsers without `CloseWatcher`:
```js
BackClose.watch(panel, closePanel, { historyFallback: true });
```
When the panel is shown it pushes one history entry (same address). The back button or swipe then closes the panel. If the panel is closed another way (your X button), the extra entry is removed again. A close function that refuses gets a fresh entry. Where `CloseWatcher` exists the option is ignored.

Caveats, please read:
- It changes the browser's history list while a panel is open, and the address bar history shows one extra step. Closing by X goes back one step to undo it.
- Chrome may skip history entries a page adds without a tap or key press (its "history manipulation intervention"). Show the panel from a tap or key press.
- Safari's own swipe-back animation may still show the page behind before the panel closes.
- **Not tried on a real iPhone** (and Android Chrome is only reached through the fake history here). Treat it as a starting point.
- If two panels are open and the lower one is closed first, its entry stays buried and is stepped over when the user reaches it with the back button.

## Use the browser's own dialog where you can
A native `<dialog>` opened with `showModal()` and a `popover` element already take part in the browser's close requests (Escape, and the Android back button in Chrome 120 and later), and give you focus handling and a backdrop for free. If you can use them, you need no module. back-close is for custom panels that use the `hidden` attribute. Firefox and Safari handling of the Android back button for `<dialog>` was not checked.

## Make the panel a proper dialog
The demo shows the pattern: give the panel `role="dialog"`, `aria-modal="true"` and a label (`aria-labelledby`), move keyboard focus into it when it opens, and return focus to the button that opened it when it closes. back-close does none of this for you.

## Why
On a phone, a pop-up that does not respond to the back gesture sends the player out of the game or to the previous site. `CloseWatcher` is the browser's own "close request" channel (the Escape key, the Android back gesture and other platform close gestures all go through it), so one hook covers them.

## Limits
- `CloseWatcher` is in Chrome and Android Chrome 126+ and Firefox 149+. Safari: Technology Preview 249 only; stable Safari 27 not confirmed (web research on 2026-10-17, not tested on a device). WebKitGTK 2.52.6 (the Linux stand-in for Safari) has none. It is not in Safari on iPhone. Elsewhere `supported` is false and nothing happens, unless you turn on the history fallback; your normal close controls and Escape handler still work.
- By default only the `hidden` attribute is watched. A panel shown by a CSS class, `style.display` or `aria-hidden` needs `isShown` and `attributes` (above) or `watchWhen`. If you take the panel out of the page and put it back while it is shown, toggle `hidden` once (or call `watch` again) so the watcher arms again.
- If you remove a shown panel from the page without hiding it, one back request is still used up (your function is called); no new watcher is armed after that.
- A close function that always refuses makes the back swipe do nothing on that panel. The browser limits how badly a page can do this, but do not do it.
- Several panels open at once: the newest closes first. Panels shown without a tap or key in between (for example by a timer) can be grouped by the browser and close together on one back swipe. Show panels from a user action where you can.
- The Escape-key browser tests go through the same channel as the Android back swipe, which has not been tried on a device. Whether a Bluetooth controller's B button also acts as the browser's Back key on some Android browsers is unverified (old evidence); if it does, B may close a panel through both pad-nav and back-close at once, so test on a device.

## Prior art
- `<dialog>.showModal()` and `popover` (built into browsers): see above. Use them when you can.
- `CloseWatcher` is a web standard (the WICG explainer repository was archived in August 2025 and its content merged into the HTML Standard). This module is a thin wrapper around it. I found no maintained standalone CloseWatcher polyfill (one search, not exhaustive).
- The plain History API pattern (`pushState` when opening, `popstate` to close) works in every browser, including Safari; that is what the opt-in fallback does, with the undo-on-normal-close and stack handling written once.
- Ariakit (a React dialog library) has an open feature request to use CloseWatcher with no decision recorded, so the wider ecosystem has not adopted it yet.

## For AI agents
Call `watch` once per panel at start-up, after the panel element exists, and keep the returned handle. Route every close control (X button, pad B, your own Escape handling) through `handle.close()` so there is one path. Prefer a native `<dialog>` for new panels. Turn on `historyFallback` only if iPhone back-swipe support matters, and tell the user the caveats above. Do not also push history entries for the same panel yourself.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
