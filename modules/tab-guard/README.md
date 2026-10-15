# tab-guard

Keeps one open copy of a page "in charge", so two tabs (or two copies of a game) do not overwrite each other's saved data. About 3 KB, no dependencies.

## Use
```js
var g = TabGuard.start({
  name: 'my-game-open',                                   // one name per saved game
  onTwin: function () { stopSaving(); showNotice(); },     // another copy is in charge (or just took over)
  onTakeOver: function () { location.reload(); },          // this copy won a takeOver(): reload to read the latest save
  onClaimed: function () {}                                // optional: this copy is in charge
});
button.onclick = function () { g.takeOver(); };            // "Use this copy instead"
g.stop();                                                  // optional: give the lock back
```
`g` has `supported`, `holding` and `twin` flags, plus `takeOver()` and `stop()`.

## How it works
The first copy takes a Web Lock and holds it as long as the page lives; the browser frees it when the tab closes or crashes. A second copy finds the lock taken and calls `onTwin`. `takeOver()` steals the lock: the old copy hears about it through its own `onTwin`, the new one through `onTakeOver`. Right after a reload the old page can still hold the lock for a moment, so a refused start is tried once more after `retryMs` (default 700) before `onTwin`.

## Why not storage events
A `localStorage` heartbeat needs timers and can be wrong after a crash. A lock is released by the browser itself, so a closed or crashed tab never leaves a stale "in use" flag behind.

## Limits
- Needs `navigator.locks` (Chrome 69+, Firefox 96+, Safari 15.4+). Without it nothing is guarded; `start()` returns `{ supported: false }`.
- Locks are shared by pages from the same origin. In Chromium and Firefox, pages opened from `file:` in different folders were measured to share locks as well, so two different games opened from disk should use different `name`s.
- It guards the page, not the data. Your `onTwin` must stop saving (and ideally save once first); the module does not touch storage.
- Private windows have their own lock space, so a normal window and a private window are not guarded against each other (they do not share storage either).

## Prior art
Web Locks leader-election helpers exist (for example the "navigator.locks leader" pattern in the MDN guide, and libraries such as BroadcastChannel leader election). This module is the small, no-dependency version for one job: warn the older copy, let the player choose, and stop saving.

## For AI agents
Call `TabGuard.start` once, early. Put your save switch-off in `onTwin`. Give the player a visible button that calls `takeOver()`. Do not call `takeOver()` automatically.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Apple Press](https://github.com/JNFoo/apple-press)
