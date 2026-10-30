# wake-keeper

**Version 1.1.0 · API 1**

**Tested in:** ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time (tests/small-lean-browser.js: 0 failures in each of the four; Chromium and Firefox used the real CloseWatcher with the real Escape key and the browser's own wake lock; WebKitGTK and GNOME Web have no CloseWatcher, so 3 back-close situations say 'not available', and they refuse the wake lock request (NotAllowedError), so their 6 wake-keeper situations ran with a stand-in lock). Not run: a phone, Safari itself; node modules/wake-keeper/test/lean.js 12 of 12, 42 older Node checks

Keeps a phone or tablet screen awake **only while a game really wants it**. About 7 KB, no dependencies.

It asks the browser's Screen Wake Lock for a lock when you call `want(true)`, and gives it back when you call `want(false)`, when the tab is hidden, or after `idleMs` without a tap or key press (`poke()`). It asks again when the tab comes back, holds one lock at a time, and waits a while before asking again after a refusal.

## Why it exists

The raw API is three lines, but a game that grabs the lock on load and never lets go drains the battery on a title screen or a forgotten tab. The core rules (release when hidden, ask again when visible, one lock at a time, show when it is held) follow MDN and the specification. Releasing after a quiet spell and the refusal wait are this module's own additions, not platform rules.

## Use

Copy `wake-keeper.js` (or open `demo.html`).

```js
var wk = WakeKeeper.create({
  idleMs: 60000,                  // give the lock back after this long without a tap (default 60 s)
  onRefused: function (err) { },  // low battery, power saving, no permission: not an error you can fix
  onChange: function (held) { },  // optional: true when a lock is held, false when not
  refusalBackoffMs: 20000         // wait this long after a refusal before asking again (default 20 s, 0 = no wait)
});
wk.want(true);                    // playing: ask for the lock
wk.want(false);                   // paused, a card is open, title screen: give it back
wk.poke();                        // call on every tap or key press
var stop = wk.watchInput(document);   // or let it call poke() for pointer, touch and key events (at most once a second)
```

`wk` also has `supported`, `held`, `idle`, `refusals` and `destroy()` (after which `want()` and `poke()` do nothing).

**Controller or hold-only play looks idle.** Gamepad input and long holds are not page events, so `watchInput` cannot see them. Tell it yourself, or the lock is given back after `idleMs`:

```js
new PadNav({ onInput: function () { wk.poke(); } }).start();              // pad-nav calls it at most every 250 ms
HoldPress.attach(button, { onPress: function () { wk.poke(); } });         // a long hold keeps the screen awake
```

Test it: `node modules/wake-keeper/test/run.js` (fake browser, 42 checks).

## The rules it follows

- One lock at a time. A released lock cannot be reused, so a new one is requested each time.
- Released the moment you stop wanting it, when the tab is hidden, and after `idleMs` without a `poke()`.
- Asked for again when the tab becomes visible (the browser drops the lock when a tab is hidden) and after a `poke()` that follows an idle release.
- A refusal is not retried in a loop. `onRefused` runs once per attempt and nothing asks again for `refusalBackoffMs` unless `want()` really changes (off then on) or the tab becomes visible, so `poke()` on every tap cannot cause a storm of failing requests. After the wait, the next `poke()` or `want(true)` tries again.
- If the tab is hidden, or you stop wanting the lock, while a request is pending, the late lock is released at once. If the game wants it again by the time the old answer arrives, a fresh request is made.

## Lean build (new in 1.1.0)

`wake-keeper.js` stays the full file. `python3 modules/wake-keeper/lean.py --without idle,status,callbacks,inject --no-comments -o wakekeeper.js` writes a copy without the parts you do not use (`--list` names them, `--sizes` prints bytes, gzipped bytes and, with `terser` installed, minified bytes). What you keep behaves as in the full file.

| Part | What cutting it removes |
|---|---|
| `idle` | the release after `idleMs`, and `poke()`, `watchInput()` and `idle`; the lock is held for as long as `want(true)` stands |
| `status` | `held` and `refusals` |
| `callbacks` | the `onChange` and `onRefused` options |
| `inject` | the `nav`, `doc` and `now` options (fakes for tests) |

`refusalBackoffMs` is never cut. Fancy Banana's set (all four cut) keeps `create({ refusalBackoffMs: 8000 })`, `want()`, `destroy()` and `supported`: 1,417 bytes minified, 660 gzipped, against 2,648 and 1,105 for the whole file (46% and 40% smaller; lower is smaller). Fancy's own inline code is about 566 bytes, so the lean build is about 2.5 times that.

`node modules/wake-keeper/test/lean.js` (about 1.6 s) builds the full file, Fancy's set (with and without comments) and each part cut alone, and runs the situation table from `tests/small-lean-battery.js` on each with a fake navigator, document and clock: run starts (lock requested), tab hidden (released), tab back (requested again), run ends (released), request refused (no new request for 8 s, then one more that works), lock released by the browser (requested again the next time the game asks), no wake lock (nothing happens, no error). `node tests/small-lean-browser.js` runs the same table in a real browser; where the browser has no wake lock it says "not available", and where it refuses the request it uses a stand-in lock and says so on the line. `lean.py` edits nothing; keep the `//@begin` / `//@else` / `//@end` marker lines balanced if you change `wake-keeper.js`.

## How it compares

Much smaller than NoSleep.js and larger than the plain request-and-listen code; among the alternatives checked here it is the only one that lets go of the lock after a quiet spell and waits after a refusal. Speed in browsers: not measured.

| Alternative | Size (smaller is better) | Features | Where it wins / loses |
|---|---|---|---|
| The plain MDN pattern by hand (`navigator.wakeLock.request`, listen for `visibilitychange`, request again; built in) | about 566 bytes (Fancy, the Banana keeps about 10 lines) | releases on hidden, asks again on visible; no idle release, no refusal wait, no guard for late answers | Wins on size. Loses: the lock is held through a title screen or forgotten tab, and a refused request is easy to retry in a loop. |
| [NoSleep.js](https://github.com/richtr/NoSleep.js) 0.12.0 (MIT) | 16,732 bytes minified, 7,215 gzipped (the published `NoSleep.min.js`; terser 5.51.2 `-c passes=2 -m` leaves its size unchanged and gzip -9 gives the second figure) | wraps the Wake Lock API and is reported to use a hidden looping video in browsers without it; needs a tap to enable | Wins on reach to old browsers. Loses: about 6.3 times the size of this module; the video fallback is no longer needed in Safari on iPhone 16.4 and later. |
| `useWakeLock` hooks for React (various packages; not checked) | not measured | tied to the framework | Wins inside a React app; no use outside React. |
| **wake-keeper 1.1.0** | 2,648 bytes minified, 1,105 gzipped for the whole file; 1,417 and 660 for the smallest set (46% and 40% smaller) | idle release after `idleMs`, refusal wait, late-answer guard, `watchInput`, lean build | |

Where it loses:
- Larger than the plain MDN code (the smallest set, 1,417 bytes minified, is about 2.5 times Fancy's inline code of about 566 bytes), in exchange for being shared and tested.
- No fallback for browsers without the Wake Lock API (NoSleep.js has one). Without `navigator.wakeLock`, `supported` is `false` and nothing happens.
- Not tried on a phone: the real lock was used only in Chromium and Firefox; WebKitGTK and GNOME Web refuse the request, so a stand-in lock was used there.
- Not measured: speed in any browser.

## What it is not

- Needs `navigator.wakeLock` (Chrome 84+, Firefox 126+, Safari and Safari on iPhone 16.4+) and a secure context. Home-screen web apps on iPhone did not work from iOS 16.4 until iOS 18.4 (MDN compatibility data).
- It cannot tell why a request was refused. MDN names low battery as one possible reason (others: power saving, a hidden page, a policy), but every refusal arrives as `NotAllowedError`, so use `onRefused` only to stay quiet or offer a battery saver, never to claim a cause.
- Games shown inside another site's frame are refused by default: the wake lock policy allows the same site only, unless the host page adds `allow="screen-wake-lock"` on the frame. From inside the game this looks like any other refusal.
- The operating system can refuse at its own level while the page still sees success, so `held` can be `true` while the screen sleeps (the specification says this can happen). Treat the lock as a request, not a promise.
- The 60 second release and the 20 second refusal wait are choices made here, not rules from MDN or the specification.
- Tested with a fake browser; the real lock has not been tried on a phone by these tests.

## See it in action

Used right now in [Fancy, the Banana](https://lfcfoundry.github.io/fancy-banana/), [Pineapple Defense](https://github.com/lfcfoundry/pineapple-defense). Checked in each app's shipped file on its main branch on 2026.10.29. The module's own page is `demo.html` in this folder.

## For AI agents

Create the keeper once. Call `want(true)` when play starts and `want(false)` in your pause, card and title code paths; call `poke()` from your pointer and key handlers (or use `watchInput(document)`), and from your controller code if the game supports a pad. Do not request the lock yourself as well.

## Prior art and credits

- NoSleep.js (MIT, 0.12.0): a popular wrapper aimed at older browsers; it needs a tap to enable. It is believed to fall back to a hidden video, not confirmed from its README. Compared only; idea only, no code. This module uses only the standard API.
- Screen Wake Lock API (W3C specification, MDN documentation): the rules for one lock at a time, release when hidden and ask again when visible follow MDN and the specification; idea only, no code. The plain MDN pattern (request, listen for `visibilitychange`, request again) is a few lines; this module adds the idle release, a guard for late answers and the refusal wait.
- Framework hooks such as a `useWakeLock` hook for React exist; they tie you to the framework.
- Browser support facts (Chrome 84, Firefox 126, Safari 16.4, home-screen apps from iOS 18.4) come from MDN compatibility data; read, not copied.

No code from others; the ideas above are theirs.

## Full research notes

The long version of this page (the full comparison table text and the rule-by-rule write-up, repeated in several places) is kept in the project's private knowledge base.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
