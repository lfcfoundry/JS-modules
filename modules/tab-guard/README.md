# tab-guard

**Version 1.0.0 · API 1**

**Tested in:** Chromium (version not recorded) and Firefox 155 (13 browser checks, at the cut from Apple Press); Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`. Not run: Firefox 158, ungoogled Chromium 155, WebKitGTK, a phone.

Keeps one open copy of a page "in charge", so two tabs (or two copies of a game) do not overwrite each other's saved data. About 8 KB with its comments, no dependencies.

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
`g` has `supported`, `holding`, `twin`, `free` and `reason` fields, plus `takeOver()` and `stop()`.

## How it works
The first copy takes a Web Lock and holds it as long as the page lives; the Web Locks spec has the browser release it when the document unloads. A second copy finds the lock taken and calls `onTwin`. `takeOver()` steals the lock: the old copy hears about it through its own `onTwin`, the new one through `onTakeOver`. Right after a reload the old page can still hold the lock for a moment, so a refused start is tried once more after `retryMs` (default 700) before `onTwin`. That one `setTimeout` is the only timer; there is no polling and nothing is stored.

**Only a real steal is a twin.** `onTwin` is called when the lock was refused because another copy holds it, or when another copy stole it (the browser then rejects the request with an `AbortError`). Any other failure of the lock request, such as `SecurityError` (a sandboxed frame, or no lock manager for the page) or `InvalidStateError` (the page is not fully active), means the guard cannot work on this page. Then `g.supported` becomes `false`, `g.reason` holds the error name, `onUnavailable(err)` is called once, and `onTwin` is not called. Your game should keep saving.

**"The other copy closed. Use this one?"** After `onTwin`, this copy keeps one waiting request in the lock queue. When the lock becomes free, `onFree` is called once and `g.free` is `true`. The waiting request hands the lock straight back, so this copy is not put in charge by itself and a freshly opened copy can still claim it. If the player says yes, call `takeOver()` (then `onTakeOver` fires; reload to read the latest save). The waiting request is cancelled by `takeOver()` and `stop()`.

**`takeOver()` is safe to call too often.** It does nothing on the copy already in charge, and a second call while the first is still pending is ignored. (Stealing your own lock would knock your own copy out.)

## Why not storage events
A `localStorage` heartbeat needs timers and can be wrong after a crash. A lock is released by the browser itself when the page unloads, so a closed tab does not leave a stale "in use" flag behind. What happens after a hard crash of the browser process is not documented by MDN and has not been tested here; expect the same cleanup, but do not rely on it for anything that cannot be repaired.

## Limits
- Needs `navigator.locks` (Chrome 69+, Firefox 96+, Safari 15.4+). Without it nothing is guarded; `start()` returns `{ supported: false, reason: 'no-web-locks' }` and calls nothing.
- **Web Locks needs a secure context** (https, `localhost`, or a `file:` page). A game played from plain `http://192.168.x.x` on a home network has no `navigator.locks`, so nothing is guarded there: `supported` is `false` and `reason` is `'insecure-context'`. Serve it over https, or add a `storage`-event check yourself.
- Locks are shared by pages from the same origin. In Chromium and Firefox, pages opened from `file:` in different folders were measured to share locks as well, so two different games opened from disk should use different `name`s.
- It guards the page, not the data. Your `onTwin` must stop saving (and ideally save once first); the module does not touch storage.
- `onFree` means the lock was free at that moment. If the other copy was only reloading, its new page may claim the lock a moment later, and `takeOver()` would then take it from that page. Ask the player before calling it.
- Private windows have their own lock space, so a normal window and a private window are not guarded against each other (they do not share storage either).
- A frozen background tab keeps its lock, so a new copy sees it as in charge until the player presses "use this copy".
- Firefox partitions some storage by top-level site in embedded frames; whether Web Locks inside a third-party frame is shared is not checked here.
- The checks in `test/run.js` use a model of the lock manager, not a real browser. `test/run.py` runs the real thing in Chromium and Firefox.

## Prior art
Web Locks leader-election helpers exist (for example the "navigator.locks leader" pattern in the MDN guide, and libraries such as BroadcastChannel leader election). This module is the small, no-dependency version for one job: warn the older copy, let the player choose, and stop saving.

## For AI agents
Call `TabGuard.start` once, early, with a name that is unique to the saved game. Put your save switch-off in `onTwin`, and give the player a visible button that calls `takeOver()`. Do not call `takeOver()` automatically. Do not stop saving because `supported` is `false` or `onUnavailable` was called: that means there is no guard, not that another copy exists. Use `onFree` to change the notice to "the other copy closed, use this one?" (keep the same button). Tests: `node modules/tab-guard/test/run.js` (plain Node, fake locks); `python3 modules/tab-guard/test/run.py [firefox]` for real browsers (needs Playwright). Set `OLD_REF=none` to skip the comparison with an older file.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
