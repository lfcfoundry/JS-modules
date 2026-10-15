# wake-keeper

Keeps a phone or tablet screen awake **only while a game really wants it**. About 5 KB, no dependencies.

**Test it:** `node modules/wake-keeper/test/run.js` (fake browser, 20 checks).

## Use
```js
var wk = WakeKeeper.create({
  idleMs: 60000,                                   // give the lock back after this long without a tap (default 60 s)
  onRefused: function (err) { /* low battery, power saving, no permission: not an error you can fix */ },
  onChange: function (held) { }                     // optional: true when a lock is held, false when it is not
});
wk.want(true);     // playing: ask for the lock
wk.want(false);    // paused, a card is open, title screen: give it back
wk.poke();         // call on every tap or key press
```
`wk` also has `supported`, `held`, `idle`, `refusals` and `destroy()`.

## The rules it follows
- One lock at a time. A released lock cannot be reused, so a new one is requested each time.
- Released the moment you stop wanting it, when the tab is hidden, and after `idleMs` without a `poke()`.
- Asked for again when the tab becomes visible (the browser drops the lock when a tab is hidden) and after a `poke()` that follows an idle release.
- A refusal is not retried in a loop. `onRefused` runs once per attempt; the next try waits for `want()`, `poke()` or the tab becoming visible.
- If the tab is hidden, or you stop wanting the lock, while the request is still pending, the late lock is released at once.

## Why
The raw API is three lines, but a game that grabs the lock on load and never lets go drains the battery on a title screen or a forgotten tab. The rules above are what MDN and web.dev recommend, written once and tested.

## Limits
- Needs `navigator.wakeLock` (Chrome 84+, Firefox 126+, Safari 16.4+) and a secure context. Without it `supported` is `false` and nothing happens.
- It cannot tell why a request was refused (MDN does not name a low-battery error), so `onRefused` should only be used to stay quiet or to offer a battery saver, never to claim a cause.
- The module is tested with a fake browser. The real lock has not been tried on a phone by these tests.

## Prior art
Many small wake-lock wrappers exist (for example NoSleep.js, which also covers old browsers with a hidden video). This one uses only the standard API and adds the release-on-idle, release-on-hidden and no-retry-storm rules.

## For AI agents
Create the keeper once. Call `want(true)` when play starts and `want(false)` in your pause, card and title code paths; call `poke()` from your pointer and key handlers. Do not request the lock yourself as well.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Pineapple Defense](https://github.com/JNFoo/pineapple-defense)
