# wake-keeper

**Version 1.0.0 · API 1**

**Tested in:** Node checks with a fake wake lock; no real browser run recorded (its demo page loads in Firefox through `tests/firefox.js`: Firefox 158 per the 2026-10-15 note, Firefox 157 on 2026-10-17). Not run: a phone.

Keeps a phone or tablet screen awake **only while a game really wants it**. About 7 KB, no dependencies.

**Test it:** `node modules/wake-keeper/test/run.js` (fake browser, 42 checks).

## Use
```js
var wk = WakeKeeper.create({
  idleMs: 60000,                                   // give the lock back after this long without a tap (default 60 s)
  onRefused: function (err) { /* low battery, power saving, no permission: not an error you can fix */ },
  onChange: function (held) { },                    // optional: true when a lock is held, false when it is not
  refusalBackoffMs: 20000                           // after a refusal, wait this long before asking again (default 20 s, 0 = no wait)
});
wk.want(true);     // playing: ask for the lock
wk.want(false);    // paused, a card is open, title screen: give it back
wk.poke();         // call on every tap or key press
var stop = wk.watchInput(document);   // or let it call poke() for you on pointer, touch and key events (at most once a second)
```
`wk` also has `supported`, `held`, `idle`, `refusals` and `destroy()`. After `destroy()`, `want()` and `poke()` do nothing.

**Controller or keyboard-only play looks idle.** Gamepad input is not a page event, so `watchInput` cannot see it. Call `wk.poke()` from your pad-nav handlers (or any pad code) too, or the lock is given back after `idleMs` of pad-only play. Key presses are covered by `watchInput`.

## The rules it follows
- One lock at a time. A released lock cannot be reused, so a new one is requested each time.
- Released the moment you stop wanting it, when the tab is hidden, and after `idleMs` without a `poke()`.
- Asked for again when the tab becomes visible (the browser drops the lock when a tab is hidden) and after a `poke()` that follows an idle release.
- A refusal is not retried in a loop. `onRefused` runs once per attempt, and nothing asks again for `refusalBackoffMs` (about 20 s) unless `want()` really changes (off then on) or the tab becomes visible again. So `poke()` on every tap cannot cause a storm of failing requests. After the wait, the next `poke()` or `want(true)` tries again.
- If the tab is hidden, or you stop wanting the lock, while the request is still pending, the late lock is released at once. If the game wants the lock again by the time the old answer arrives (pause and resume, or hidden and shown, in a quick row), a fresh request is made, so the player is not left without a lock.

## Why
The raw API is three lines, but a game that grabs the lock on load and never lets go drains the battery on a title screen or a forgotten tab. The core rules (release when hidden, ask again when visible, one lock at a time, show when it is held) follow MDN and the specification. Releasing after a quiet spell and the refusal wait are this module's own additions, not platform rules.

## Limits
- Needs `navigator.wakeLock` (Chrome 84+, Firefox 126+, Safari and Safari on iPhone 16.4+) and a secure context. Without it `supported` is `false` and nothing happens. Home-screen web apps on iPhone did not work from iOS 16.4 until iOS 18.4 (MDN compatibility data).
- It cannot tell why a request was refused. MDN names low battery as one possible reason (others: power saving, a hidden page, a policy), but every refusal arrives with the same error name (`NotAllowedError`), so `onRefused` should only be used to stay quiet or to offer a battery saver, never to claim a cause.
- Games shown inside another site's frame (a portal page) are refused by default: the wake lock policy allows the same site only, unless the host page grants it with `allow="screen-wake-lock"` on the frame. From inside the game this looks like any other refusal.
- The operating system can refuse at its own level and the page may still see success, so `held` can be `true` while the screen still sleeps (the specification says this can happen). Treat the lock as a request, not a promise.
- The 60 second release and the 20 second refusal wait are choices made here, not rules from MDN or the specification.
- The module is tested with a fake browser. The real lock has not been tried on a phone by these tests.

## Prior art
- NoSleep.js (MIT): a popular wrapper aimed at older browsers; it needs a tap to enable. I believe it falls back to a hidden video, but I did not confirm that from its README. This module uses only the standard API.
- The plain MDN pattern (request, listen for `visibilitychange`, request again) is a few lines. This module adds the idle release, a guard for answers that arrive late, and the refusal wait.
- Framework hooks such as a `useWakeLock` hook exist for React; they tie you to the framework.

## For AI agents
Create the keeper once. Call `want(true)` when play starts and `want(false)` in your pause, card and title code paths; call `poke()` from your pointer and key handlers (or use `watchInput(document)`), and from your controller code if the game supports a pad. Do not request the lock yourself as well.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
