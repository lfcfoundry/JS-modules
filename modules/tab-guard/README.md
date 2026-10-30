# tab-guard

**Version 1.1.1 · API 1**

**Tested in:** Docs only, code unchanged; the phone result is from the owner's Android phone (Chrome 155) running the storage-probe page, 2026-10-24.

Keeps one open copy of a page "in charge", so two tabs (or two copies of a game) do not overwrite each other's saved data. About 8 KB with its comments, no dependencies.

The first copy takes a Web Lock (a browser feature for sharing one named lock between tabs of the same site) and holds it as long as the page lives; the browser releases it when the page unloads. A second copy finds the lock already taken and calls your `onTwin`, so you can stop saving and tell the player. A button that calls `takeOver()` steals the lock for the copy the player chose.

## Why it exists

A game that saves its progress in the browser can be opened twice by accident, in two tabs or two windows. Each copy then keeps saving over the other's data. This module lets exactly one copy keep saving and gives the other a clear signal to stop. It uses the browser's lock rather than a timer-based flag in storage (see "Why not storage events").

## Use
```js
var g = TabGuard.start({
  name: 'my-game-open',                                   // one name per saved game
  onTwin: function () { stopSaving(); showNotice(); },     // another copy is in charge (or just took over)
  onTakeOver: function () { location.reload(); },          // this copy won a takeOver(): reload to read the latest save
  onFree: function () { offerUseThisCopy(); },             // optional: the other copy closed; "use this one?"
  onUnavailable: function (err) { /* keep saving */ },     // optional: the guard cannot work on this page
  onClaimed: function () {}                                // optional: this copy is in charge
});
button.onclick = function () { g.takeOver(); };            // "Use this copy instead"
g.stop();                                                  // optional: give the lock back
```
Other options: `retryMs` (default 700, the one retry at start-up) and `backForwardCache` (below).
`g` has `supported`, `holding`, `twin`, `free` and `reason` fields, plus `takeOver()` and `stop()`.

## How it works
The first copy takes a Web Lock and holds it as long as the page lives; the Web Locks spec has the browser release it when the document unloads. A second copy finds the lock taken and calls `onTwin`. `takeOver()` steals the lock: the old copy hears about it through its own `onTwin`, the new one through `onTakeOver`. Right after a reload the old page can still hold the lock for a moment, so a refused start is tried once more after `retryMs` (default 700) before `onTwin`. That one `setTimeout` is the only timer; there is no polling and nothing is stored.

**Only a real steal is a twin.** `onTwin` is called when the lock was refused because another copy holds it, or when another copy stole it (the browser then rejects the request with an `AbortError`). Any other failure of the lock request, such as `SecurityError` (a sandboxed frame, or no lock manager for the page) or `InvalidStateError` (the page is not fully active), means the guard cannot work on this page. Then `g.supported` becomes `false`, `g.reason` holds the error name, `onUnavailable(err)` is called once, and `onTwin` is not called. Your game should keep saving.

**"The other copy closed. Use this one?"** After `onTwin`, this copy keeps one waiting request in the lock queue. When the lock becomes free, `onFree` is called once and `g.free` is `true`. The waiting request hands the lock straight back, so this copy is not put in charge by itself and a freshly opened copy can still claim it. If the player says yes, call `takeOver()` (then `onTakeOver` fires; reload to read the latest save). The waiting request is cancelled by `takeOver()` and `stop()`.

**`takeOver()` is safe to call too often.** It does nothing on the copy already in charge, and a second call while the first is still pending is ignored. (Stealing your own lock would knock your own copy out.)

## The Back button and the back/forward cache (`backForwardCache: true`)
Browsers keep a page you just left in a "back/forward cache" so Back is instant. The three test browsers behave differently with a lock held (3 Back presses each, `tab-guard` on its own test page):

| Browser | Without the option | With `backForwardCache: true` |
|---|---|---|
| Firefox 158.0 | whole page reloads 3 of 3 (a held lock blocks the cache) | restored from the cache 3 of 3, still in charge |
| ungoogled Chromium 155.0.8059.39 | restored 3 of 3, still in charge | restored 3 of 3, still in charge (re-claimed once) |
| WebKitGTK 2.52.6 | restored 3 of 3 but the lock is gone and the page wrongly hears `onTwin` then `onFree` | restored 3 of 3, still in charge |

With the option on, the guard lets go of the lock when the page is about to be left (`beforeunload`; letting go on `pagehide` was measured to be too late for Firefox) and takes it again when the page comes back (`pageshow` with `persisted`), or after `returnMs` (default 1000) if the page turned out to be staying (for example a cancelled "leave this page?" prompt). `onClaimed` is called again on the return. The price: for that moment another open copy can claim the lock. If one does, the returning page simply becomes the twin (`onTwin` once, then `onFree` when that copy closes), exactly as if it had started second. Leave it off if your game never shows a link away from itself or you do not care about instant Back.

## Why not storage events
A `localStorage` heartbeat needs timers and can be wrong after a crash. A lock is released by the browser itself when the page unloads, so a closed tab does not leave a stale "in use" flag behind. What happens after a hard crash of the browser process is not documented by MDN and has not been tested here; expect the same cleanup, but do not rely on it for anything that cannot be repaired.

## How it compares
Smaller than the two leader-election libraries whose sizes are known, with the one thing a game needs (take over, with callbacks); it has fewer features than they do and needs Web Locks. Speed: not measured (no loop runs; there is one lock request at start-up).

| Alternative | Size (smaller is better) | Speed (faster is better) | Features | Where it wins / loses |
| --- | --- | --- | --- | --- |
| **tab-guard 1.1.0** (this module, MIT) | 2,769 B minified (1,154 B gzipped, esbuild) | Not measured | One copy in charge, player-chosen takeover, "other copy closed" notice, optional Back-button cache support | Wins: smaller than the libraries, built for one job. Loses: no messages between tabs, no fallback without Web Locks |
| `tab-election` (license not checked, version not recorded) | About 5.1 KB minified (1.9 KB gzipped) | Not measured | Voluntary step-down, a queue for waiting, tab ids, messages between tabs, a fallback without Web Locks | Wins: more features and a fallback. Loses: bigger |
| `broadcast-channel` (MIT, version not recorded) | 25.8 KB minified for everything | Not measured | Leader election plus messaging between tabs | Wins: messaging and election in one. Loses: much bigger for this job |
| `leader-tab` (license and size not checked) | Not measured | Not measured | Leader election | Not compared further |
| The MDN "navigator.locks leader" pattern, hand-written | A few lines | Not measured | One holder at a time | Wins: nothing to copy in. Loses: you write the twin, takeover and "other copy closed" handling yourself |
| A `localStorage` heartbeat with `storage` events | A few lines plus a timer | Not measured | Works where Web Locks does not (plain `http://` pages) | Loses: needs timers and can be wrong after a crash, and a closed tab can leave a stale "in use" flag |

**Where it loses**
- Needs `navigator.locks` and a secure context (https, `localhost` or `file:`); a game played from plain `http://192.168.x.x` is not guarded.
- No voluntary step-down, no queue, no tab ids or messages between tabs.
- A frozen background tab keeps its lock, and private windows have their own lock space.
- With `backForwardCache` off (the default), Firefox 158.0 reloads the whole page on Back (3 of 3 tries).
- What happens after a hard browser crash is not tested. The browser suite was run in ungoogled Chromium 155.0.8059.39-1 only; not run in Firefox 158.0, WebKitGTK, GNOME Web or on a phone.
- Not measured: speed of any of them; sizes of `leader-tab` and the hand-written ways.

## Limits
- Needs `navigator.locks` (Chrome 69+, Firefox 96+, Safari 15.4+). Without it nothing is guarded; `start()` returns `{ supported: false, reason: 'no-web-locks' }` and calls nothing.
- **Web Locks needs a secure context** (https, `localhost`, or a `file:` page). A game played from plain `http://192.168.x.x` on a home network has no `navigator.locks`, so nothing is guarded there: `supported` is `false` and `reason` is `'insecure-context'`. Serve it over https, or add a `storage`-event check yourself.
- Locks are shared by pages from the same origin. In Chromium and Firefox, pages opened from `file:` in different folders were measured to share locks as well, so two different games opened from disk should use different `name`s.
- **Phone, measured 2026-10-24:** two copies of a page opened from an Android phone's Files app (`content://` addresses with different paths, Chrome 155) also share one lock space, one `localStorage` and one IndexedDB. A game opened as a file on a phone should therefore use a name nobody else uses, such as `my-game-open`, never a bare word like `game`.
- It guards the page, not the data. Your `onTwin` must stop saving (and ideally save once first); the module does not touch storage.
- `onFree` means the lock was free at that moment. If the other copy was only reloading, its new page may claim the lock a moment later, and `takeOver()` would then take it from that page. Ask the player before calling it.
- Private windows have their own lock space, so a normal window and a private window are not guarded against each other (they do not share storage either).
- A frozen background tab keeps its lock, so a new copy sees it as in charge until the player presses "use this copy".
- Firefox partitions some storage by top-level site in embedded frames; whether Web Locks inside a third-party frame is shared is not checked here.
- The checks in `test/run.js` use a model of the lock manager, not a real browser. `test/run.py` runs the real thing in Chromium and Firefox.

## See it in action

Used right now in [Fancy, the Banana](https://lfcfoundry.github.io/fancy-banana/play/), [Pineapple Defense](https://lfcfoundry.github.io/pineapple-defense/play/), Netflow Map (its repository is private, so there is no link). Checked in each app's shipped file on its main branch on 2026.10.29. The module's own page is `demo.html` in this folder.

## Prior art and credits
- The Web Locks API (W3C specification, built into the browser): the whole guard is built on it, so the browser does the work of releasing the lock when the page unloads.
- The "navigator.locks leader" pattern in the MDN guide (MDN code examples are public domain, CC0) and Web Locks leader-election libraries (`tab-election`, `broadcast-channel`, `leader-tab`): read as prior art for electing one tab. Ideas only, no code.
- Cut from Apple Press 1.27, LFC Foundry's own game, so the code is the project's own.

No code from others; the ideas above are theirs.

## For AI agents
Call `TabGuard.start` once, early, with a name that is unique to the saved game. Put your save switch-off in `onTwin`, and give the player a visible button that calls `takeOver()`. Do not call `takeOver()` automatically. Do not stop saving because `supported` is `false` or `onUnavailable` was called: that means there is no guard, not that another copy exists. Use `onFree` to change the notice to "the other copy closed, use this one?" (keep the same button). Tests: `node modules/tab-guard/test/run.js` (plain Node, fake locks); `python3 modules/tab-guard/test/run.py [firefox]` for real browsers (needs Playwright). Set `OLD_REF=none` to skip the comparison with an older file.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
