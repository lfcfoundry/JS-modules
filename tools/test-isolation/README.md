# test-isolation

**Version 1.0.0 · API 1**

**Tested in:** Node checks where the piece has any; Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6, one at a time, in a real browser (`tests/pieces-browser.js`, 2026-10-17; WebKitGTK 2.52.6 through `tools/webkit-driver`; key down/up and touch were sent as page events or the mouse). Not run: GNOME Web (Epiphany) 46.5, a phone.

Keeps a test page away from the player's real saved game. It swaps `localStorage` (and `sessionStorage` if you ask) for a copy that puts a prefix in front of every key, so a test page, a speed test or a random-play run can never read or overwrite the real keys. 4.7 KB, no dependencies. Cut from Apple Press, where a speed-test page once wrote into a real saved game on a phone.

**Test it:** `node tools/test-isolation/test/run.js` (6 checks on a fake Storage, about 0.1 s) and `node tests/pieces-browser.js` (real localStorage in Firefox 158 and ungoogled Chromium 155).

## Use
Put it first on the test page, before the game's own script:
```html
<script src="test-isolation.js"></script>
<script>TestIsolation.install({ prefix: "speedtest:" });</script>
```
or paste the same thing as one short piece of script at the very top of `<head>` when you build the test page with a script:
```js
var inline = "<script>" + TestIsolation.snippet("speedtest:") + "<\/script>";   // 641 characters, shows no error if storage is blocked
```
From then on `localStorage.getItem("save")` reads the key `speedtest:save`. `install` returns `{ ok, prefix, names, restore() }`; `restore()` puts the real storage back. `wrap(storage, prefix)` gives you the prefixed object over any Storage, which is what the Node tests use.

What you get is a `getItem`, `setItem` (values become text, like a real Storage), `removeItem`, `clear` (removes only the prefixed keys), `key(i)` and `length` that count only the prefixed keys. Options: `names` (default `["localStorage"]`, add `"sessionStorage"`), `target` (default `window`).

## Why
A diagnostic page is often the same file as the game with extra buttons. Opened from a file, or from the same address as the game, it shares the game's saved data, and a run that resets or fills the save wipes the real one. The cure has to be in place before the game script runs, which is why there is an inline snippet.

## Limits
- It does not stop a page from reaching the real storage another way (another window, the `Storage.prototype` methods, IndexedDB, cookies, `caches`). It is a guard against honest mistakes, not a sandbox.
- Browsers do not promise an order for `key(i)`; in Firefox the order was not the order of writing. Do not rely on it.
- `storage` events from another tab arrive with the full prefixed key; they are not translated.
- Property-style access (`localStorage.save = 1`, `localStorage.save`) is not covered; use `getItem` and `setItem`.
- Choose prefixes that do not start each other (`lab:` and `lab:2:` would share keys).
- When the browser will not give the page storage at all, `install` returns `ok: false` and changes nothing.

## Prior art
- [node-storage-shim](https://github.com/mnahkies/node-storage-shim) (ISC, 2.0.1, 5.8 KB unpacked) and jest-localstorage-mock give unit tests an in-memory Storage in Node. This is different: it wraps the **real** storage of a **real page**, so the page keeps working across reloads while its keys stay apart from the game's.
- Cypress commands that save and restore localStorage clear and refill the real keys between tests; they do not keep a second set of keys beside the real ones.
- I found no small library that does this one job (one search of npm, not exhaustive).

## For AI agents
Put `install` (or the inline snippet) first on any page that runs the game with test hooks, speed tests or fuzzing, and pick a prefix that names the test. Never point a test page at the real keys "just to check" a save. Tell the user that this is a guard against mistakes, not a security boundary.
