# back-close

**Version 1.2.0 · API 1**

**Tested in:** ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time (tests/small-lean-browser.js: 0 failures in each of the four; Chromium and Firefox used the real CloseWatcher with the real Escape key and the browser's own wake lock; WebKitGTK and GNOME Web have no CloseWatcher, so 3 back-close situations say 'not available', and they refuse the wake lock request (NotAllowedError), so their 6 wake-keeper situations ran with a stand-in lock). Not run: a phone, Safari itself; node modules/back-close/test/lean.js 12 of 12, 30 older Node checks

Makes a phone's back swipe (or back button) close the top panel instead of leaving the page. About 7 KB, no dependencies.

You point it at a panel and give it the function that closes that panel. While the panel is shown, it keeps one `CloseWatcher` (the browser's own close-request channel) armed on it; when the back swipe, back button or Escape key arrives, the browser hands the request to that watcher and your close function runs. When the panel is hidden, the watcher is removed again. In browsers without `CloseWatcher`, an opt-in fallback pushes one history entry while the panel is shown and closes the panel when the user steps back.

## Why it exists
On a phone, a pop-up that does not respond to the back gesture sends the player out of the game or to the previous site. `CloseWatcher` is the browser's own "close request" channel (the Escape key, the Android back gesture and other platform close gestures all go through it), so one hook covers them.

## Try it and test it
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

## Lean build: ship only what a game uses (new in 1.2.0)

`back-close.js` stays the full file. `python3 modules/back-close/lean.py --without history,element,closeRoute,supported --no-comments -o backclose.js` writes a copy without those parts (`--list` names all four, `--sizes` prints bytes, gzipped bytes and, when `terser` is installed, minified bytes). What you keep behaves as in the full file; what you cut is simply missing. The parts:

| Part | What cutting it removes |
|---|---|
| `history` | the history fallback (`historyFallback`) for browsers without CloseWatcher |
| `element` | `BackClose.watch(el, ...)`, `isShown`, `attributes` and the MutationObserver; `watchWhen` stays |
| `closeRoute` | `handle.close()` (it then returns false) |
| `supported` | `BackClose.supported` (`handle.supported` stays) |

Fancy Banana's set (all four cut, so only `watchWhen(isOpen, close)` and the handle's `sync()` and `destroy()` remain): 842 bytes minified, 415 gzipped, against 2,467 and 1,067 for the whole file (66% and 61% smaller; lower is smaller). Fancy's own inline code is about 255 bytes, so the lean build is about 3.3 times that, in exchange for being shared and tested.

`node modules/back-close/test/lean.js` builds the full file, Fancy's set (with and without comments), each part cut on its own and the no-CloseWatcher case, and runs the situation table from `tests/small-lean-battery.js` on each (about 1 s): panel opens (a watcher is made), closes by its own button (the watcher is destroyed and your close function is not called), a back request closes the newest panel and the other one stays closable, no CloseWatcher (nothing happens, no error). `node tests/small-lean-browser.js` runs the same table in a real browser with the browser's own CloseWatcher and the real Escape key; where the browser has no CloseWatcher it says "not available" for the three situations that need one. `lean.py` edits nothing: change `back-close.js` and keep its `//@begin` / `//@else` / `//@end` marker lines balanced.

## How it compares
Bigger than the few lines a game would write by hand; I found no popular library for this. It adds one shared handle, support for panels that are not one element, and an opt-in iPhone fallback. Speed in browsers: not measured (the tests check that it works, they do not time it).

| Alternative | Size (smaller is better) | Speed (faster is better) | Features | Where it wins / loses |
|---|---|---|---|---|
| Native `<dialog>` with `showModal()`, or a `popover` (built in) | 0 bytes | not measured | Escape, Android back (Chrome 120 and later), focus handling, backdrop | Wins: no module needed. Loses: your panel must be a `<dialog>` or `popover`; Firefox and Safari handling of the Android back button was not checked. |
| `CloseWatcher` written by hand (built in; Fancy, the Banana keeps about 255 bytes of its own) | about 255 bytes in Fancy's case | not measured | one watcher, no `hidden`-watching, no handle | Wins on size. Loses: every game writes and tests its own arming, removal and close routing. |
| History API pattern by hand (`pushState` then `popstate`; built in) | a few lines | not measured | works in every browser including Safari | Wins on reach. Loses: changes the history list and needs undo and stack handling written each time. |
| A standalone `CloseWatcher` polyfill | none found (one search, not exhaustive) | not measured | not applicable | Not applicable. |
| **back-close 1.2.0** | 2,467 bytes minified, 1,067 gzipped for the whole file; 842 and 415 for the smallest set (66% and 61% smaller, lower is smaller). | not measured | `hidden` panels, `isShown`, `watchWhen`, `close()` route, optional history fallback, lean build | see below |

Where it loses:
- The smallest set (842 bytes minified) is about 3.3 times Fancy's own inline code (about 255 bytes), in exchange for being shared and tested.
- `CloseWatcher` is not in stable Safari or Safari on iPhone; the opt-in history fallback is not tried on a real iPhone.
- Chrome may skip history entries added without a tap or key press; the fallback changes the address-bar history while a panel is open.
- A native `<dialog>` or `popover` needs no module at all and is the better choice for new panels.
- Not measured: speed in any browser.

## Limits
- `CloseWatcher` is in Chrome and Android Chrome 126+ and Firefox 149+. Safari: Technology Preview 249 only; stable Safari 27 not confirmed (web research on 2026-10-17, not tested on a device). WebKitGTK 2.52.6 (the Linux stand-in for Safari) has none. It is not in Safari on iPhone. Elsewhere `supported` is false and nothing happens, unless you turn on the history fallback; your normal close controls and Escape handler still work.
- By default only the `hidden` attribute is watched. A panel shown by a CSS class, `style.display` or `aria-hidden` needs `isShown` and `attributes` (above) or `watchWhen`. If you take the panel out of the page and put it back while it is shown, toggle `hidden` once (or call `watch` again) so the watcher arms again.
- If you remove a shown panel from the page without hiding it, one back request is still used up (your function is called); no new watcher is armed after that.
- A close function that always refuses makes the back swipe do nothing on that panel. The browser limits how badly a page can do this, but do not do it.
- Several panels open at once: the newest closes first. Panels shown without a tap or key in between (for example by a timer) can be grouped by the browser and close together on one back swipe. Show panels from a user action where you can.
- The Escape-key browser tests go through the same channel as the Android back swipe, which has not been tried on a device. Whether a Bluetooth controller's B button also acts as the browser's Back key on some Android browsers is unverified (old evidence); if it does, B may close a panel through both pad-nav and back-close at once, so test on a device.

## Prior art and credits
- `<dialog>.showModal()` and `popover` (built into browsers): see above. Use them when you can.
- `CloseWatcher` is a web standard (the WICG explainer repository was archived in August 2025 and its content merged into the HTML Standard). This module is a thin wrapper around it. I found no maintained standalone CloseWatcher polyfill (one search, not exhaustive).
- The plain History API pattern (`pushState` when opening, `popstate` to close) works in every browser, including Safari; that is what the opt-in fallback does, with the undo-on-normal-close and stack handling written once.
- Ariakit (a React dialog library) has an open feature request to use CloseWatcher with no decision recorded, so the wider ecosystem has not adopted it yet.

Credits, what was taken from others:
- `CloseWatcher` (HTML Standard, WICG explainer): the browser feature itself, used through its own API; idea only, no code.
- History API `pushState` / `popstate` pattern: a common technique; idea only, no code.
- Browser support dates came from caniuse and the WebKit blog (webkit.org/blog/18182), read, not copied.
- First cut from Apple Press 1.27 (same maker, LFC Foundry).
No code from others; the ideas above are theirs.

## For AI agents
Call `watch` once per panel at start-up, after the panel element exists, and keep the returned handle. Route every close control (X button, pad B, your own Escape handling) through `handle.close()` so there is one path. Prefer a native `<dialog>` for new panels. Turn on `historyFallback` only if iPhone back-swipe support matters, and tell the user the caveats above. Do not also push history entries for the same panel yourself.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
