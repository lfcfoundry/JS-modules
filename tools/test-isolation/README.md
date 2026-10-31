# test-isolation

**Version 1.1.0 · API 1**

**Tested in:** Firefox 158.0 (reports 158.0b5), ungoogled Chromium 155.0.8059.39-1, WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5 for the page checks in tests/pieces-browser.js, one at a time (2026-10-17); the 7 property probes and key-loop timings were measured by the Apple Press thread in Firefox 158.0, Chromium 155 and WebKitGTK 2.52.6; not run: GNOME Web for the timings, a phone

## What it is and how it works

Keeps a test page away from the player's real saved game. 1.8 KB gzipped, no dependencies.

- It swaps `localStorage` (and `sessionStorage` if asked) for a copy that prefixes every key.
- A test, speed run or random-play run can never read or overwrite the real keys.
- An inline snippet puts it in place before the game script runs.

## Why it exists

A test page is often the game file with extra buttons, and it shares the game's saved data. In Apple Press a speed-test page once wrote into a real saved game on a phone.

**Where it helps**

- Test and diagnostic builds of games.
- Speed tests on a tester's own phone.
- Random-play runs that reset saves.

**Not for:** sandboxing; it guards against honest mistakes only.

## Try it and test it
**Test it:** `node tools/test-isolation/test/run.js` (10 checks on a fake Storage, about 0.1 s) and `node tests/pieces-browser.js` (real localStorage, plus the `fresh`, `seed`, inline snippet and property-style checks, in Firefox, ungoogled Chromium and WebKitGTK).

## Use
Put it first on the test page, before the game's own script:
```html
<script src="test-isolation.js"></script>
<script>TestIsolation.install({ prefix: "speedtest:" });</script>
```
or paste the same thing as one short piece of script at the very top of `<head>` when you build the test page with a script:
```js
var inline = "<script>" + TestIsolation.snippet("speedtest:") + "<\/script>";   // about 1,960 characters (it carries the same Proxy code as the file, so it is bigger than 1.0.0's 641), shows no error if storage is blocked
```
From then on `localStorage.getItem("save")` reads the key `speedtest:save`. `install` returns `{ ok, prefix, names, restore() }`; `restore()` puts the real storage back. `wrap(storage, prefix)` gives you the prefixed object over any Storage, which is what the Node tests use.

What you get is a `getItem`, `setItem` (values become text, like a real Storage), `removeItem`, `clear` (removes only the prefixed keys), `key(i)` and `length` that count only the prefixed keys. Options: `names` (default `["localStorage"]`, add `"sessionStorage"`), `target` (default `window`), `fresh` (true removes the prefixed keys an earlier run left behind before starting; they stay on the device forever otherwise) and `seed` (true starts the test copy with the real save's values; the real keys are only read, never changed). Property-style use behaves like a real Storage: `localStorage.save`, `localStorage.save = "x"`, `"save" in localStorage`, `delete localStorage.save`, `Object.keys` and `JSON.stringify` all see only the test keys. The key list is remembered, so a loop over thousands of keys is fast.

## Limits
- It does not stop a page from reaching the real storage another way (another window, the `Storage.prototype` methods, IndexedDB, cookies, `caches`). It is a guard against honest mistakes, not a sandbox.
- Browsers do not promise an order for `key(i)`; in Firefox the order was not the order of writing. Do not rely on it.
- `storage` events from another tab arrive with the full prefixed key; they are not translated.
- `localStorage instanceof Storage` is false and `Storage.prototype.getItem.call(localStorage, ...)` throws (covering them would need patching the real prototype, which breaks the promise of never touching the real storage). A key added or swapped by someone else under the prefix, without changing the real key count, is not noticed until the next write or storage event.
- The inline snippet is about 1,960 characters (641 in 1.0.0) because it now carries the Proxy code. A browser with no Proxy falls back to the method-only object (checked in Node only).
- Choose prefixes that do not start each other (`lab:` and `lab:2:` would share keys).
- When the browser will not give the page storage at all, `install` returns `ok: false` and changes nothing.

## How it compares

| Alternative | What it does | Why it does not fit this job |
|---|---|---|
| node-storage-shim, jest-localstorage-mock | In-memory Storage for unit tests in Node | Not a real page; data is gone on reload |
| Cypress commands that save and restore localStorage | Clear and refill the real keys between tests | Still touch the real keys |
| **test-isolation** | Wraps the real storage of a real page so its keys stay apart from the game's, across reloads | Needs to run before the game script |

## Prior art and credits
- [node-storage-shim](https://github.com/mnahkies/node-storage-shim) (ISC, 2.0.1, 5.8 KB unpacked) and jest-localstorage-mock give unit tests an in-memory Storage in Node. This is different: it wraps the **real** storage of a **real page**, so the page keeps working across reloads while its keys stay apart from the game's.
- Cypress commands that save and restore localStorage clear and refill the real keys between tests; they do not keep a second set of keys beside the real ones.
- I found no small library that does this one job (one search of npm, not exhaustive).
- Cut from Apple Press (same maker, LFC Foundry), where a speed-test page once wrote into a real saved game on a phone.
- node-storage-shim, jest-localstorage-mock and the Cypress commands are named for comparison only; no code from them. The key-wrapping object uses the browser's own `Proxy`. The file has no dependencies and its header names no outside code.

## For AI agents
Put `install` (or the inline snippet) first on any page that runs the game with test hooks, speed tests or fuzzing, and pick a prefix that names the test. Never point a test page at the real keys "just to check" a save. Tell the user that this is a guard against mistakes, not a security boundary.
