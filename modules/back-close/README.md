# back-close

**Version 1.2.0 · API 1**

**Tested in:** ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time (tests/small-lean-browser.js: 0 failures in each of the four; Chromium and Firefox used the real CloseWatcher with the real Escape key and the browser's own wake lock; WebKitGTK and GNOME Web have no CloseWatcher, so 3 back-close situations say 'not available', and they refuse the wake lock request (NotAllowedError), so their 6 wake-keeper situations ran with a stand-in lock). Not run: a phone, Safari itself; node modules/back-close/test/lean.js 12 of 12, 30 older Node checks

Makes a phone's back swipe (or back button) close the top panel instead of leaving the page. About 7 KB, no dependencies, one file: `back-close.js`.

You point it at a panel and give it the function that closes that panel. While the panel is shown, it keeps one `CloseWatcher` (the browser's own close-request channel) armed on it; when the back swipe, back button or Escape key arrives, the browser hands the request to that watcher and your close function runs. When the panel is hidden, the watcher is removed again. In browsers without `CloseWatcher`, an opt-in fallback pushes one history entry while the panel is shown and closes the panel when the user steps back.

## Why it exists

On a phone, a pop-up that does not respond to the back gesture sends the player out of the game or to the previous site. `CloseWatcher` is the browser's own "close request" channel (Escape, the Android back gesture and other platform close gestures all go through it), so one hook covers them.

## Use

```js
var back = BackClose.watch(panel, function () { closePanel(); });   // panel: any element that uses the `hidden` attribute
closeButton.onclick = function () { back.close(); };               // optional: the X button and a controller B button take the same route
```

The watcher is on while the panel is shown (no `hidden` attribute, and in the page) and off when it is hidden, however that happened, so your own close button needs no extra code. If your function leaves the panel open (for example while a button is locked), the watcher is armed again, unless the panel was removed from the page or you called `destroy()`.

Panels shown by a CSS class or style instead of `hidden`, or not an element at all (drawn on a canvas, or several panels one back swipe should close together):

```js
BackClose.watch(panel, closePanel, { isShown: function (el) { return el.classList.contains('open'); }, attributes: ['class'] });
var back = BackClose.watchWhen(function () { return anyPanelOpen(); }, function () { closeAllPanels(); });
openPanel = function () { /* ... */ back.sync(); };   // call sync() whenever panels open or close
```

Try it: `demo.html`. Tests: `node modules/back-close/test/run.js` (fake CloseWatcher and fake history, 30 checks) and `python3 modules/back-close/test/run.py` (real browser, Escape key).

## API

`watch(el, close, opts)` and `watchWhen(isOpen, close)` both return `{ supported, mode, close(), destroy(), sync() }`.

| Item | Meaning |
|---|---|
| `isShown(el)`, `attributes` | For `watch`: how to tell the panel is shown (default: no `hidden` attribute) and which attributes to watch (default `['hidden']`). A throwing `isShown` counts as "not shown". |
| `historyFallback: true` | Opt-in history fallback for browsers without `CloseWatcher` (below). Ignored where `CloseWatcher` exists. |
| `close()` | Asks the same watcher to close (`CloseWatcher.requestClose()`, or the history route), so the X, a controller B button and the back swipe all end in your one close function. Returns `false` when the panel is not shown; with no back support it just calls your function. |
| `sync()` | Re-reads whether the panel is shown and arms or removes the watcher. A `watch` handle does this itself; `watchWhen` handles need it. |
| `mode` | `'closewatcher'`, `'history'` (fallback in use) or `'none'`. |
| `BackClose.supported` | Whether the browser has `CloseWatcher`. |

**Safari and iPhone fallback.** `CloseWatcher` is not in Safari or Safari on iPhone (WebKit has it only as a preview), so there the back swipe still leaves the page. With `{ historyFallback: true }` the module pushes one history entry (same address) while the panel is shown; back closes the panel; closing another way (your X) removes the extra entry; a close function that refuses gets a fresh entry. Caveats:
- It changes the browser's history list while a panel is open, so the address bar history shows one extra step.
- Chrome may skip history entries a page adds without a tap or key press; show the panel from a tap or key press.
- Safari's own swipe-back animation may still show the page behind before the panel closes.
- **Not tried on a real iPhone** (and Android Chrome is reached only through the fake history here). Treat it as a starting point.
- If two panels are open and the lower one is closed first, its entry stays buried and is stepped over when the user reaches it with the back button.

**Lean build.** `python3 modules/back-close/lean.py --without history,element,closeRoute,supported --no-comments -o backclose.js` writes a copy without those parts (`--list` names all four, `--sizes` prints bytes, gzipped bytes and, when `terser` is installed, minified bytes). What you keep behaves as in the full file; what you cut is missing. `lean.py` edits nothing: change `back-close.js` and keep its `//@begin` / `//@else` / `//@end` marker lines balanced.

| Part | What cutting it removes |
|---|---|
| `history` | the history fallback for browsers without CloseWatcher |
| `element` | `BackClose.watch(el, ...)`, `isShown`, `attributes` and the MutationObserver; `watchWhen` stays |
| `closeRoute` | `handle.close()` (it then returns false) |
| `supported` | `BackClose.supported` (`handle.supported` stays) |

`node modules/back-close/test/lean.js` (12 of 12) builds the full file, Fancy's set, each part cut alone and the no-CloseWatcher case, and runs the situation table from `tests/small-lean-battery.js` on each (about 1 s); `node tests/small-lean-browser.js` runs the same table in a real browser.

## How it compares

Bigger than the few lines a game would write by hand; no popular library for this was found. It adds one shared handle, support for panels that are not one element, and an opt-in iPhone fallback. Speed in browsers: not measured (the tests check that it works, they do not time it). Size is smaller-is-better.

| Alternative | Size | Where it wins / loses |
|---|---|---|
| Native `<dialog>` with `showModal()`, or a `popover` (built in) | 0 bytes | Wins: no module needed; Escape, Android back (Chrome 120 and later), focus and backdrop for free. Loses: the panel must be a `<dialog>` or `popover`; Firefox and Safari handling of the Android back button was not checked. |
| `CloseWatcher` by hand (built in; Fancy, the Banana keeps about 255 bytes of its own) | about 255 bytes in Fancy's case | Wins on size. Loses: every game writes and tests its own arming, removal and close routing. |
| History API pattern by hand (`pushState`, `popstate`; built in) | a few lines | Wins on reach (every browser, Safari too). Loses: changes the history list and needs undo and stack handling each time. |
| A standalone `CloseWatcher` polyfill | none found (one search, not exhaustive) | Not applicable. |
| **back-close 1.2.0** | 2,467 bytes minified, 1,067 gzipped for the whole file; 842 and 415 for the smallest set (all four parts cut; 66% and 61% smaller) | `hidden` panels, `isShown`, `watchWhen`, `close()` route, optional history fallback, lean build. |

Where it loses:
- The smallest set (842 bytes minified) is about 3.3 times Fancy's own inline code (about 255 bytes), in exchange for being shared and tested.
- `CloseWatcher` is not in stable Safari or Safari on iPhone; the history fallback is not tried on a real iPhone, changes address-bar history while a panel is open, and Chrome may skip entries added without a tap or key press.
- A native `<dialog>` or `popover` needs no module and is the better choice for new panels (give the panel `role="dialog"`, `aria-modal="true"` and a label, move focus in on open and back to the opening button on close; back-close does none of this).
- Not measured: speed in any browser.

## What it is not

- `CloseWatcher` is in Chrome and Android Chrome 126+ and Firefox 149+. Safari: Technology Preview 249 only; stable Safari 27 not confirmed (web research on 2026-10-17, not tested on a device). WebKitGTK 2.52.6 (the Linux stand-in for Safari) has none. It is not in Safari on iPhone. Elsewhere `supported` is false and nothing happens, unless you turn on the history fallback; your normal close controls and Escape handler still work.
- By default only the `hidden` attribute is watched. A panel shown by a CSS class, `style.display` or `aria-hidden` needs `isShown` and `attributes` or `watchWhen`. If you take the panel out of the page and put it back while it is shown, toggle `hidden` once (or call `watch` again) so the watcher arms again.
- If you remove a shown panel from the page without hiding it, one back request is still used up (your function is called); no new watcher is armed after that.
- A close function that always refuses makes the back swipe do nothing on that panel. The browser limits how badly a page can do this, but do not do it.
- Several panels open at once: the newest closes first. Panels shown without a tap or key in between (for example by a timer) can be grouped by the browser and close together on one back swipe; show panels from a user action where you can.
- The Escape-key browser tests go through the same channel as the Android back swipe, which has not been tried on a device. Whether a Bluetooth controller's B button also acts as the browser's Back key on some Android browsers is unverified (old evidence); if it does, B may close a panel through both pad-nav and back-close at once, so test on a device.
- Not run: a phone, Safari itself. WebKitGTK and GNOME Web have no CloseWatcher, so 3 back-close situations say "not available" there, and they refuse the wake lock request, so their 6 wake-keeper situations ran with a stand-in lock.

## For AI agents

Call `watch` once per panel at start-up, after the panel element exists, and keep the returned handle. Route every close control (X button, pad B, your own Escape handling) through `handle.close()` so there is one path. Prefer a native `<dialog>` for new panels. Turn on `historyFallback` only if iPhone back-swipe support matters, and tell the user the caveats above. Do not also push history entries for the same panel yourself.

## Prior art and credits

- `<dialog>.showModal()` and `popover` (built into browsers): use them when you can.
- `CloseWatcher` (HTML Standard, WICG explainer; the explainer repository was archived in August 2025 and its content merged into the HTML Standard): the browser feature itself, used through its own API; idea only, no code. This module is a thin wrapper around it. No maintained standalone CloseWatcher polyfill was found (one search, not exhaustive).
- The plain History API pattern (`pushState` when opening, `popstate` to close) works in every browser, including Safari; it is a common technique and what the opt-in fallback does, with undo-on-normal-close and stack handling written once. Idea only, no code.
- Ariakit (a React dialog library) has an open feature request to use CloseWatcher with no decision recorded, so the wider ecosystem has not adopted it yet.
- Browser support dates came from caniuse and the WebKit blog (webkit.org/blog/18182), read, not copied.
- First cut from Apple Press 1.27 (same maker, LFC Foundry).
- No code from others; the ideas above are theirs.

## Full research notes

The long version of this page (the step-by-step lean-build and situation-table descriptions, the longer comparison table with its per-column notes, and the support-date research) is kept in the project's private knowledge base.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
