# save-kit

**Version 2.5.0 · API 2**

**Tested in:** Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6 (cloud)

## What it is and how it works

save-kit stores game or app progress in the browser safely. One file, 18.6 KB gzipped (9.9 KB minified and gzipped), no dependencies. `createLarge` does the same over IndexedDB for big saves. Since 2.4.1 `save-kit.min.js` is the same code minified (27.4 KB, 10.1 KB gzipped, MIT header kept), and it opens a page with a saved game a little faster than localForage in Chrome and about even in Firefox on a laptop and a phone (see "How it compares"). Since 2.5.0 `save-kit-small.min.js` (14.0 KB) leaves out codes, `createLarge` and the crash copy, and opens a saved game about a third faster than localForage on a laptop and phone.

- You describe the save as a schema, and every field is checked on save and load.
- A backup slot is kept, and a damaged value falls back alone instead of ruining the save.
- Saves can be copied out as text codes with a checksum, and pasted back.

## Why it exists

Browser saves fail quietly: a `NaN` gets written, a phone closes the page before it saves, two tabs overwrite each other. Plain `JSON.stringify` into `localStorage` loses everything when that happens, and storage libraries like localForage store whatever they are given. save-kit was cut out of Apple Press and Fancy, the Banana.

**Where it helps**

- Progress and settings in browser games.
- Moving a save between devices by copy and paste, with no account.
- Changing the save format later without breaking old saves.

**Not for:** secrets or anti-cheat (codes can be edited), or shapeless key-value storage.

## Use

Copy `save-kit.js` (keep its header).

```js
var kit = SaveKit.create({ key: 'mygame', prefix: 'MG1',
  schema: { score: 'num', level: 'int:99', sound: 'flag', name: 'str:20', owned: { type: 'counts', max: 20 } },
  defaults: { sound: 1 } });
var state = kit.load() || kit.validate({});   // rebuilt from the better of the main and backup slots, else null
kit.save(state);                              // false (and nothing written) if a number is NaN/Infinity/negative
var stop = kit.autosave(function () { return state; }, 2000);   // timer + pagehide + visibilitychange
kit.exportCode(state).then(show, showMessage);   // 'MG1z.<data>.<7-char check>' (or 'MG1p...')
kit.importCode(pasted).then(function (clean) { kit.stageImport(clean, state); location.reload(); }, showMessage);
```

Try `demo.html`. Checks: `node modules/save-kit/test/run.js` (plain Node, no browser; `OLD_REF=<commit>` compares with an older file, `OLD_REF=none` skips that) and `node modules/save-kit/test/lean.js` (the lean builds). `tests/save-kit-browser.js` runs the new options in a real browser (see the file's first lines).

## API

Also exported: `SaveKit.validate(schema, defaults, untrusted)`, `SaveKit.has(obj, key)` (for counts) and `SaveKit.twoTap(fn, ms, onArm)` ("tap again to confirm" on destructive buttons). Schema types are listed at the top of `save-kit.js`.

- `kit.pause(true)` switches saving off (`false` on again); `stageImport` uses it while a loaded save waits for a reload. `kit.forceBackupNext()` makes the next `save()` also refresh the backup slot.
- `kit.warm()` (new in 2.1.0, off unless you call it) does `load()`'s reading and checking right away, for example at the top of the page while images and sounds still load; the next `load()` only checks that the stored text did not change and hands over the same result (20 KB save: about 0.5 us in Chromium 155 and 1.5 us in WebKitGTK 2.52.6, against 85 to 140 us for a full load). Same total work, done earlier. A `save()` or a slot changed by another tab makes `load()` read again. `afterValidate` runs during `warm()`. Returns `true` when a save was found.
- `kit.save(state, true)` writes even when `skipUnchangedMs` would skip it (autosave does this by itself when the page is hidden or closed).
- `kit.onOtherTab(function (state, event) {...})` is called when another tab of the same site writes the save (`state` is the clean new save, or `null` if removed). The browser never tells the tab that wrote it. Use it so an old tab does not overwrite newer progress: `kit.pause(true)` and show "This game changed in another tab. Reload." Returns a function that stops listening. Does nothing outside a browser.
- `kit.persist()` asks the browser not to delete this site's storage when space runs low. Resolves `true`/`false`, never rejects. Chrome answers by itself (often `false` for a page nobody installed), Firefox 158 asks the player and the promise waits for the answer, WebKitGTK 2.52.6 has no `persist()` (so `false`). Call it after a first save, never at page load.

| `create()` option | Meaning | Default |
|---|---|---|
| `key`, `schema`, `defaults` | Storage key, field types, fallback values | required (`defaults` optional) |
| `prefix` | Start of a save code | `'SK1'` |
| `storage` | Any object with synchronous `getItem`/`setItem` | `localStorage`; `null` if blocked |
| `soundKeys` | Numbers that must be sound to write a save | every `num` and `int` field |
| `backupEveryMs` | Least time between backup writes | 60000 |
| `backupKey` | Name of the backup slot | `<key>-backup` |
| `version`, `migrate` | `version: 2` stamps every save and code with `v: 2`. A save with a lower `v` (or none) goes through `migrate(copyOfOldSave, fromVersion)` first, then the usual checks. A `migrate` that throws leaves the save as it was | off |
| `skipUnchangedMs` | If only `seen` differs from the last write, `save()` returns `true` without touching storage until this many ms pass. Idle games that read `seen` should pick a small value | `0` (always write) |
| `compactCodes` | `exportCode` leaves out fields equal to their default. Opens in any 1.x; only safe if a default never changes later | `false` |
| `codeCheck` | Ending of a save code: `'padded36'` (7 base-36 characters), `'plain36'` (base 36 without leading zeros, 1 to 7 characters; Apple Press's old codes), `'hex8'` (8 hex characters; Fancy the Banana's old codes). Same FNV-1a hash behind all three | `'padded36'` |
| `damagedKey` | Unusable main-slot text is copied here first so it can be looked at | off |
| `readBackupWithoutMain` | `false`: no main slot means `load()` returns `null`, not a leftover backup | `true` |
| `trust` | `true` (new in 2.3.0): skip every check. `load()` returns the stored JSON as it is (the backup only when the main slot is missing or not JSON), `save()` writes without looking. No schema, defaults, broken-number refusal, `migrate` or `afterValidate`. For games that check their own data and want the bare speed: ours/theirs against localForage's localStorage driver in Firefox 158, Chromium 155 and WebKitGTK 2.52.6: 448 B load 0.16 to 0.54, save 0.33 to 0.68; 20 KB load 0.86 to 1.02, save 0.80 to 0.91. With checks on, small loads stay 1.0 to 1.2 of it | `false` (all checks on) |
| `afterValidate` | `function (clean, raw)` at the end of `load()`, `importCode()`, `onOtherTab()`: change `clean`, return a replacement, or `false`/`null` to refuse. A throwing hook is ignored | off |
| `stamp` | Name of the timestamp field written on every save, code and staged import | `'seen'` |
| `maxCodeBytes` | Biggest save a code may unpack to and `exportCode` will write | 262144 (256 KiB) |
| `durable` | `true` (or a database name): every save is also kept in IndexedDB, written through to disk. See "Crash-safe saves" below | off |
| `maxCodeChars` | Longest pasted text `importCode` will look at | `maxCodeBytes` x 4/3 + 1024 (350549) |

Moving a game that already has saves: these options keep existing saves and codes working, but check an old save and an old code through the new code before shipping (field names and order come from your schema and state).

`importCode` reads the unpacked data in pieces and stops once it passes `maxCodeBytes`, so a code that expands 1000 to 1 is cut off early. It rejects with a short string, never an exception. Importing keeps the old game in `<key>-before-load` and pauses saving until the reload.

### Crash-safe saves (new in 1.4.0)

When a browser crashes or is killed, it can lose the last stretch of `localStorage` writes: in our tests about 3 s (Firefox 158) to 1 minute (Chromium) of saves. `durable: true` also puts each save in IndexedDB with strict durability (on disk before the browser says done). Start-up stays the same fast synchronous `load()`; `recover()` then answers within a few ms with the IndexedDB copy only if it is newer.

```js
var kit = SaveKit.create({ key: 'mygame', schema: schema, durable: true });
var state = kit.load() || fresh();
kit.recover().then(function (newer) { if (newer) state = newer; });   // null almost always
```

- Only the newest save is written while an IndexedDB write is running, so autosave every second costs one write at a time.
- `recover()` compares the copy with the save `load()` returned, so call it right after `load()`. A save made before it answers does not hide the newer copy. The newer copy is also written back to `localStorage`.
- `kit.flushed()` resolves `true` once the newest save is on disk (`false` with no IndexedDB). Without IndexedDB, saving works as before.
- `SaveKit.durableCopy(name)` is the same copy for an app with its own save format: `write(text, seq)` (seq only goes up, e.g. the save time), `newer(seq)` resolves `{ text, seq }` when the copy that was there when the page opened is newer than what the app loaded (else `null`), and `flushed()`. A 3.9 MB text is on disk 11 to 25 ms after `write()`, and `newer()` answers in 10 to 24 ms.
- Cost in the three test browsers: no measurable extra time in `save()` or `load()`; the copy is on disk 2 ms (2 KB save) to 8-12 ms (200 KB) later, off the page's critical path.

### Large saves (new in 1.3.0)

`localStorage` holds about 5 MB for the whole site and every call blocks the page. For a bigger save (a big map, a long log) use `SaveKit.createLarge`, which keeps the same ideas over IndexedDB. Every method returns a Promise and none rejects.

```js
var big = SaveKit.createLarge({ name: 'mygame-big', schema: { gold: 'num', world: { type: 'raw' } }, defaults: { world: [] }, lock: true });
big.load().then(function (state) { /* clean state or null */ });
big.save(state).then(function (ok) { /* true once stored */ });
big.onOtherTab(function (state) { /* another tab of this game stored a save */ });
```

- The main slot and a backup slot are written in one transaction, so a half-written save cannot exist. The save is stored as its JSON text plus the text length; `load()` ignores a slot that is cut short or is not a JSON object and uses the other one. The browser's own storage adds its own checksums; there is no checksum of ours on top (it cost 8 to 54 ms on 16 MB and was dropped).
- Same checks as `create()`: a broken or negative number refuses the save (`false`, nothing written); fields are rebuilt with the schema; `afterValidate`, `stamp`, `version` (stamps `v`; there is no `migrate` here yet), `soundKeys`, `backupEveryMs`, `pause()` and `forceBackupNext()` work the same. `raw` fields skip the deep copy when the stored text names no `__proto__`, `constructor` or `prototype` key (otherwise they are scrubbed as before).
- Since 2.1.0 a save whose biggest array field has 100,000 or more entries stores that array in pieces of about 40,000 entries (at most 8), each with its index, the piece count, the total and a save id, read side by side and parsed one by one; a missing, cut, reordered, duplicated or foreign piece makes the slot count as broken (the backup is used, as for any broken slot). 20 MB, pieces / one text, early-stop rule: WebKitGTK load 0.76 and save 0.67, Chromium load 0.90 and save 0.63, Firefox load 0.90 and save 0.99. **Upgrade note:** save-kit 2.0.2 or older cannot read a big save written in pieces.
- Since 2.2.0 (in Chromium-family browsers since 2.4.0), an array field of 10,000 or more entries that are all plain objects with the same names in the same order, holding only numbers, strings, `true`/`false` or `null`, is stored as columns: `{ k: names, c: one array per name }` (about 40% less text). `load()` builds the same objects again (same names, same order, same values); any other array keeps the plain text. Every browser reads both forms. A short column, a repeated or `__proto__` name or a wrong total makes the slot count as broken. In Chromium 155 (2.3.0 / 2.4.0, 3 runs) 20 MB save 97-100 / 79-82 ms, 5 MB save 34-36 / 23-26, 1 MB save 10-11 / 7.5-8, 20 MB load 100-116 / 80-113. Measured (ms, 2.1.0 / 2.2.0, `tests/save-kit-large-browser.js`, 2 runs): WebKitGTK 2.52.6 20 MB load 111-116 / 78-89, save 72-75 / 58-63, 5 MB load 31 / 24-26; Firefox 158 20 MB load 143-156 / 102-109, save 148-150 / 104-113, 5 MB load 37-38 / 26-27. **Upgrade note:** save-kit 2.1.0 or older cannot read a save written as columns.
- Quick saves in a row: while one write runs, newer saves wait and only the newest is written; every caller's Promise resolves `true` once its save or a newer one is stored.
- `lock: true`: the first tab to save takes a lock (`navigator.locks`); another tab with the same `name` gets `false` from `save()` until it calls `claim(true)` to take over, and the old holder's `onLost(cb)` runs. Without Web Locks every tab may write.
- `skipUnchangedMs: 60000` (off by default): a `save()` whose fields equal the last stored save (only the stamp differs) resolves `true` without writing until that many ms pass; `save(state, true)` always writes. The text is still built to compare, so an unchanged save costs about 34 to 43% of a normal one, not zero: 16 MB in Chromium 155 95.6 ms against 222.8, Firefox 158 61 against 168, WebKitGTK 2.52.6 35 against 102 (milliseconds, smaller is better). The stamp is kept beside the text and put back on load.
- IndexedDB is used from the page only. In WebKitGTK, a blob Worker started from a `file://` page sees a separate, empty database, so a save written there would not be found by the page.
- `onOtherTab(cb)` uses a `BroadcastChannel` and calls `cb(cleanState)` when another tab stored a save; it does not call in the tab that wrote. `clear()` removes both slots; `close()` closes the database.
- Not included (use `create()` for small saves): codes, `migrate`, `persist()`, `autosave()`. Pass `indexedDB: null` to see the no-IndexedDB path (saves `false`, loads `null`).

Speed in the three test browsers is in the table below ("How it compares").

### Lean builds (new in 1.2.0)

`python3 modules/save-kit/lean.py --without autosave,twoTap,persist` writes `save-kit-lean.js` without those parts (`--list` names every part); kept parts behave exactly as in the full file, a cut method is missing. Minify the result yourself. `lean.py` edits nothing: keep the `//@begin` / `//@else` / `//@end` marker lines in `save-kit.js` balanced.

Minified size with terser 5.36.0 (`-c passes=2 -m`), bytes, smaller is better: 1.2.0 full 8,894; set for Fancy the Banana (keeps codes and `onOtherTab`) 6,341; set for Apple Press (keeps codes and `stageImport`) 6,281; core only (`load`, `save`, `validate`, counts; no codes) 2,967. Cutting `codes` alone saves 3,551 bytes (higher is better); the other parts save 142 to 505 each.

### Lite build: save-kit-lite.js (new in 1.6.0)

For a small game that only needs checked numbers, whole numbers, flags and short text with a backup slot, copy `save-kit-lite.js` instead (global `SaveKitLite`). **1,811 bytes minified, 966 gzipped** (terser 5.51.2, `-c passes=2 -m`, header kept), against 3,978 / 1,847 for the full file with every part cut by `lean.py`. It has `load()`, `save()`, `validate()` and `clear()` and the options `key`, `schema`, `defaults`, `storage`, `backupEveryMs`, `backupKey`, `stamp`. No `counts` or `raw` fields, codes, autosave, versions, other-tab notice, IndexedDB or damaged-slot copy; those stay in `save-kit.js`.

It reads and writes the same stored text as `create()` and gives the same answers (except since 2.0.0 a `create()` save written in a Chromium-family browser with a counts map of 32 or more names, which lite cannot read; see below): `test/lite.js` feeds 3,000 random damaged main and backup slots to both and requires identical results, and checks hostile keys, the backup interval and blocked storage. Speed against `create()` on a six-field save (early-stop rule, limit 5%, lite/full, lower is better): Chromium 155 save 0.98 (inconclusive), load 0.91 (faster); Firefox 158 save 1.01, load 0.95 (both ok); WebKitGTK 2.52.6 save 0.89, load 0.97 (both ok). So it matches the full file in speed; it is smaller, not faster.

## What it does that plain JSON saves do not

- **Survives a damaged save.** Of five options tested (save-kit, JSON with zod, plain JSON, idb-keyval, localForage), it is the only one that refuses a bad write (a `NaN` from a bug) and still opens a save whose text was cut off, has one count of the wrong type, or carries a `__proto__` key. The results are the same in all three test browsers.
- **Faster than checking with zod.** It is 1.4 to 5.5 times as fast on every save and load measured, against `localStorage` with JSON and zod. Where zod throws and loads nothing, save-kit loads the backup.
- **No database wait for small saves.** It is about 90 to 250 times as fast as idb-keyval and localForage for a 448-byte save, and 2 to 25 times as fast for 20 KB, because `localStorage` answers at once.
- **Small.** The core with checks and backup is 1.8 KB minified and gzipped, against 9.1 KB for localForage and 14.1 KB for zod bundled whole. The full file, with codes, big saves and the crash copy, is 6.1 KB in the lean build. Since 1.6.0, `save-kit-lite.js` keeps checked fields and a backup slot in 966 bytes, about 2.6 times idb-keyval's 370.
- **The price.** Next to a bare `JSON.stringify` into `localStorage` it is 1.1 to 2.9 times slower, which is the cost of the checks. idb-keyval is smaller still (0.4 KB gzipped, against 1.0 KB for the lite file), but it has no checks and no backup.

**Since 2.0.0 (API 2), in Chromium-family browsers, `create()` stores each counts map of 32 or more names as two lists, `[names, counts]`.** V8 reads and writes two lists much faster than one object with hundreds of names. Every browser reads both shapes, and the checks are the same (9,944 random saves, damaged ones included, give the same answers as 1.6.3). 20 KB, ours over localForage's localStorage driver, Chromium 155: save 0.81 (faster), load 1.05 (about even). Firefox and WebKitGTK keep the object shape, because rebuilding the maps is slow there. Small maps, codes, `createLarge()` and `save-kit-lite.js` are unchanged. **Upgrade note:** save-kit 1.6.3 or older, and `save-kit-lite.js`, cannot read such a save, so do not go back to an older copy once players have saved with 2.0.0 in Chromium.

Since 1.6.3 a clean load checks each counts map once and skips the second scan for damaged fields, (`JSON.parse` alone is about two thirds of the load). A load with checks stays slower than one with none; the rest is the per-key checks.

Measured 2026.11.01 on save-kit 1.5.2 in cloud Chromium 155, Firefox 158 and WebKitGTK 2.52.6 (early-stop A/B rule), and confirmed on a laptop in Firefox 160 and Chromium 156 (16 cores). The tables are in "Speed and efficiency numbers".

Each field is checked on its own and falls back alone. `__proto__`, `constructor` and `prototype` keys are dropped and counts are capped. A save with a broken number is refused. If the backup write fails because storage is full, the main save still counts and the backup is retried next time. Codes are deflate-squeezed where the browser supports it, only when that is really shorter, and use the browser's own `Uint8Array.toBase64`/`fromBase64` when it exists; words pasted after a code are ignored.

**Loads with a raw field are about 2 to 3 times faster since 1.3.1** (0.8 to 120 KB saves: 2.1 to 3.3x in Firefox 158, Chromium 155 and WebKitGTK 2.52.6; same clean state). When the stored text names no `__proto__`, `constructor` or `prototype` key, the objects `JSON.parse` made are used as they are instead of being copied again, so in `afterValidate(clean, raw)` a raw field of `clean` may be the same object as in `raw`.

## How it compares

Larger than a hand-written `JSON.stringify` save, but the one built for game saves: it checks every field, keeps a backup and makes copy-paste codes with a checksum. Against localForage's localStorage driver (no backup, no checks), ours/theirs from the early-stop A/B in `tests/save-kit-small-browser.js` (save-kit 2.2.1 to 2.3.0, one cloud machine, ratio below 1 is faster): 448 B save 0.89 / 0.37 / 0.72 and load 1.12 / 0.29 / 0.95; 20 KB save 0.82 / 0.92 / 1.28 and load 0.99 / 1.03 / 1.53 (ungoogled Chromium 155 / Firefox 158 / WebKitGTK 2.52.6; long-run paired medians, 3 fresh launches x 80 (448 B) or 40 (20 KB) interleaved rounds per browser; WebKitGTK's 20 KB rows spread widely, 10th to 90th percentile 1.03 to 2.21 for the load). Where we are slower, that is the price of checking every field (in WebKitGTK the 20 KB load spends about 20 us just giving the two 400-name maps a null prototype, so a saved name like `toString` can never look like a built-in). With `trust: true` (new in 2.3.0, off by default; no checks) it is 448 B save 0.81 / 0.36 / 0.64 and load 0.55 / 0.16 / 0.53, 20 KB save 0.98 / 0.87 / 1.04 and load 0.98 / 0.93 / 0.99 (even where a bare `JSON.parse` is all either side does). Against localForage's default IndexedDB mode and idb-keyval, save-kit is faster at every size: see below.

### Opening the page: the first load

What a game does once per visit: run the library's script, then `create()` and the first `load()` of a 20 KB save (localForage: `config`, `setDriver` to its localStorage driver and the first `getItem`). Each library sits inline in a fresh page, like a single-file game, and the clock runs from before its script to the save in hand. Mean of 40 fresh pages per library in one cloud browser session, order rotated, ms, smaller is better (Firefox and WebKitGTK count in whole milliseconds, so their means carry about 0.1 ms of noise).

| Browser | save-kit.min.js 2.4.1 | save-kit.js 2.4.1 (readable) | localForage 1.10.0 (localforage.min.js) |
|---|---|---|---|
| ungoogled Chromium 155 | 5.47 (0.66x) | 6.10 (0.73x) | 8.31 |
| Firefox 158 | 5.30 (0.86x) | 6.38 (1.03x, about even) | 6.17 |
| WebKitGTK 2.52.6 | 1.13 (0.73x) | 1.57 (1.01x, about even) | 1.55 |

Checks stay on in every save-kit column. Ship the minified file for this speed: the readable file is about even with localForage in Firefox and WebKitGTK. Most of the first call is the browser compiling code (in Chromium the first `create()` takes about 1.2 ms and the next one 0.1 ms), so a smaller file opens faster; a lean build cut to the small-save parts opened in 4.52 / 4.10 / 1.10 ms. Making the kit and loading the save cost the same in every build; the time saved is the browser reading less script.

**Since 2.5.0, `save-kit-small.min.js`** is that kind of build ready to copy, for a game that only uses `create()`: everything except copy-paste codes, `createLarge()` and the `durable` crash copy (14.0 KB, 5.8 KB gzipped, MIT header kept). Page open as above, 40 fresh pages each, cloud browsers, ms, smaller is better: Chromium 155 4.32 against localForage 8.45 (0.51x), Firefox 158 4.13 against 5.90 (0.70x), WebKitGTK 2.52.6 1.15 against 1.50 (0.77x); `save-kit.min.js` in the same runs 0.62x / 1.00x / 0.87x. The cloud overstates these leads, but the small file still wins clearly on real devices (the owner's laptop and Android phone, tester page, 58 tries per library, mean time divided by localForage's, smaller is better): laptop Chrome 156 0.67x (2.66 against 3.98 ms), laptop Firefox 160 0.65x (3.24 against 4.98 ms), phone Chrome 156 0.72x (5.97 against 8.24 ms). To cut a different set of parts, use `lean.py`. Measured 11.07 on the 2.4.0 code, which 2.4.1 does not change.

The cloud numbers above overstate the lead. On real devices (the owner's laptop and phone, tester page with 58 tries per library, each in a fresh frame; paired median of save-kit's time divided by localForage's, smaller is better):

| Device and browser | save-kit.min.js | save-kit.js (readable) |
|---|---|---|
| Laptop, Chrome 156 | 0.92 (faster in 43 of 58 tries) | 1.11 (slower) |
| Laptop, Firefox 160 | 1.00 (even; its clock counts whole milliseconds) | 1.00 (even) |
| Android phone, Chrome 156 | 0.95 (faster in 36 of 58 tries) | 1.13 (slower) |

So on devices the minified file is a little faster than localForage in Chrome and even in Firefox, and the readable file is about 10% slower in Chrome.

| Alternative | Size (smaller is better) | Features | Where it wins / loses |
|---|---|---|---|
| Plain `JSON.stringify` / `JSON.parse` into `localStorage` (built in) | a few lines, nothing to ship | none of the checks, backup, codes or limits | Wins on size and simplicity. Loses: one broken value can ruin or overwrite the whole save |
| [localForage](https://localforage.github.io/localForage/) 1.10.0 (Apache-2.0) | 29,208 bytes minified, 8,781 gzipped | storage back-ends (localForage: IndexedDB, WebSQL, localStorage); no game-save checks, backup or codes | Wins when you need IndexedDB or large data. Loses: does not protect a game save |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval) 6.3.0 (Apache-2.0) | 4,758 bytes minified, 1,507 gzipped | a small asynchronous key-value store on IndexedDB; no schema, checks, backup slot or codes | Wins when a save is large or must not block the page. Loses: does not protect a game save, and every read and write is asynchronous |
| [zod](https://zod.dev) 3.25.76 (MIT), with JSON in `localStorage` | 59,551 bytes minified, 14,082 gzipped (whole library bundled by esbuild; using only part of it could be smaller, not measured) | schema checks; no backup slot, codes or size limits | Loses: 1.4 to 5.5 times slower than save-kit in all three cloud browsers, and a damaged save throws with nothing loaded |
| [lz-string](https://github.com/pieroxy/lz-string) 1.5.0 (MIT) | 4,814 bytes minified, 1,401 gzipped | URL-safe compressed text; no checksum, schema or size limit | Wins without `CompressionStream`. Loses: a cut-off or hostile code is not caught |
| [fflate](https://github.com/101arrowz/fflate) 0.8.3 (MIT) | 32,794 bytes minified, 12,512 gzipped (whole library; a tree-shaken build is smaller) | real deflate code, could be an old-browser fallback | Wins on old browsers (this module has none). Loses: only the compression piece |
| **save-kit 1.5.2** | 20,647 bytes minified, 7,805 gzipped (terser 5.51.2, `-c passes=2 -m`, same as the rows above; with `createLarge`; 1.2.2 was 12,772 and 5,427); core only without codes 2,967 minified (terser 5.36.0, 1.2.0 file, so not comparable with the first figure) | per-field checks, backup slot, checksummed codes, size limits, other-tab notice, lean builds | Speed (smaller is better): a small save (448 bytes) loads in 3.24 microseconds in ungoogled-chromium 155.0.8059.39-1, 2.6 in Firefox 158.0, 1.95 in WebKitGTK 2.52.6; against the alternatives: see "Large saves" below and the Numbers |

### Large saves against idb-keyval and localForage

A game-like save (a list of small tile objects plus 2,000 named counts), the whole call from start to the data being stored (save) or in hand (load), milliseconds, smaller is better, median of 14 rounds over two passes, one library at a time. idb-keyval 6.3.0 and localForage 1.10.0 store the object as it is (no checks, no backup); `createLarge` also checks, writes the backup slot on the first save and every 60 s, and rebuilds the state on load. Tool: `tests/save-kit-large-browser.js` (`LIBS=<folder with the two libraries>`). Measured in a cloud container, no noise guard, not a laptop or phone.

| Save size, call | Chromium 155 ours / idb-keyval / localForage | Firefox 158 ours / idb-keyval / localForage | WebKitGTK 2.52.6 ours / idb-keyval / localForage |
|---|---|---|---|
| 0.8 MB save | 7.7 / 9.6 / 8.6 | 6 / 21 / 19 | 5 / 15 / 15 |
| 0.8 MB load | 5.7 / 8.2 / 7.8 | 6 / 19 / 18 | 7 / 7 / 8 |
| 4 MB save | 23.5 / 36.4 / 38.4 | 33 / 89 / 87 | 17 / 77 / 69 |
| 4 MB load | 21.7 / 33.5 / 32.9 | 36 / 88 / 79 | 23 / 35 / 34 |
| 16 MB save | 76.2 / 148.3 / 164 | 124 / 354 / 357 | 65 / 328 / 339 |
| 16 MB load | 83.2 / 169.1 / 166.8 | 115 / 328 / 351 | 91 / 123 / 120 |

Measured 11.07 (Chromium on 2.4.0, Firefox and WebKitGTK on 2.3.0, which store the same way there): big arrays are stored in pieces since 2.1.0, and lists of same-shape records as columns since 2.2.0 (Chromium since 2.4.0). save-kit is faster than both from 4 MB up in all three browsers, and equal or faster below that (WebKitGTK 0.8 MB load 7 / 7 / 8 ms is a tie on its 1 ms clock). Older notes below describe how earlier versions got here.

Since 1.6.1 a `createLarge` load spends one pass over the saved text where it spent three and none when the schema has no `raw` field. 

Since 1.6.2 the depth check on a big `raw` field uses `for...in` instead of `Object.keys` (it only ever sees parsed JSON, so the answers are the same), which took 19 ms of a 16 MB load in Chromium: 16 MB load, one library per page, median of 3 pages, ms: Chromium 120 to 87 (0.72x; idb-keyval 144), WebKitGTK 125 to 117 (0.93x; idb-keyval 120, so roughly equal), Firefox unchanged within noise (about 150; idb-keyval 300 to 440). A plain `get` plus `JSON.parse` of the same text with no checks takes 73 / 145 / 105 ms, so the checks are now 14 / 5 / 12 ms of it. These are new runs of the same harness shape, not the 1.3.0 table above.

Where it loses: not in this large-save table; the one tie is the WebKitGTK 0.8 MB load (7 / 7 / 8 ms, a 1 ms clock). Small saves are a different story: with the checks on, a 20 KB `create()` save in WebKitGTK is slower than localForage's localStorage driver (load 1.53x, save 1.28x, ours over theirs), and plain `localStorage` with `JSON.stringify` stays faster for small saves because it checks nothing; `trust: true` removes the gap. A backup write on every save (`backupEveryMs: 0`) is slower on large saves in Firefox (111 vs 41 ms at 4 MB).

Where it loses: larger than a hand-written save (the lean build cuts parts a game does not use); `create()` is `localStorage` only (or any object with synchronous `getItem`/`setItem`); `createLarge()` covers IndexedDB; squeezed codes need `CompressionStream`, with no old-browser fallback.

## What it is not

- Not encryption and not anti-cheat: a code can be edited by anyone, and codes are only as private as the place they are pasted. Checksums catch copy mistakes, not tampering.
- `localStorage` holds about 5 MiB per origin and can be blocked or full (private windows): `save` returns `false` instead of throwing, and `load()` returns `null`. For bigger saves use `createLarge()`.
- Squeezed codes need `CompressionStream`/`DecompressionStream` with `deflate-raw` (Chrome 103, Firefox 113, Safari 16.4); older browsers make plain codes and cannot open squeezed ones.
- Safari may delete script-written storage of a site not visited for a while (the 2020 rule was seven days, not re-verified; the 2023 webkit.org post gives no day count). Offer a save code and call `kit.persist()`.
- Two tabs of one game write to the same slot and the last write wins; use `kit.onOtherTab`.
- Firefox partitions `localStorage` by the top-level site, so an embedded game may not see the save it made on its own page. Chrome and Safari: not checked.
- Phones may close a page with no event at all; autosave keeps the loss small, it cannot remove it.
- The unpack limit is a safety net for one save, not a memory promise: the text itself can still be about 350,000 characters.

## Good to know

- **Counts have no prototype** (`Object.create(null)`), so `owned.hasOwnProperty('a')` fails. Use `SaveKit.has(owned, 'a')`, `'a' in owned` or `Object.keys(owned)`.
- **`seen`** (or your `stamp` name) is stamped on every save and export and removed again by `load()`/`validate()` unless your schema lists it (`seen: 'num'`). Idle games that need the time away should list it. Saving adds `seen` (and `v` with `version`) to your state object; hand it a copy if that matters.
- **`flag` uses its default** when missing or broken, so a new on-by-default setting stays on for players who saved before it existed. A saved `0` stays `0`.
- **Never throws:** `create()`, `load()`, `save()`, `exportCode()`, `importCode()`, `autosave()`. `save(null)` returns `false`; `exportCode(null)` rejects with a message; a `getState()` that throws is skipped for that tick.

## See it in action

Used right now in [Apple Press](https://lfcfoundry.github.io/apple-press/play/), [Fancy, the Banana](https://lfcfoundry.github.io/fancy-banana/play/), [Pineapple Defense](https://lfcfoundry.github.io/pineapple-defense/play/). Checked in each app's shipped file on its main branch on 2026.10.29. The module's own page is `demo.html` in this folder.

## For AI agents

- Call `SaveKit.create({ key, prefix, schema, defaults })` once, then `load()` at start, `autosave()` after, and `exportCode`/`importCode` for a "copy your save" box.
- Always give `defaults` for new fields (a new on-by-default setting's value goes there) and add the field to `schema` or it is dropped on load.
- Show the string a rejected `importCode`/`exportCode` gives. Do not wrap storage calls in your own try/catch.
- After `importCode` succeeds call `stageImport(clean, currentState)` then `location.reload()`; do not call `save()` in between (saving is paused).
- Do not add a second "save codes" module: save-kit already covers it (base64url, FNV-1a checksum, `deflate-raw` with plain fallback, size limits). For several tabs call `kit.onOtherTab` once and `kit.pause(true)` there; add `version`/`migrate` the first time a schema field is renamed.

## Prior art and credits

No code from others; the ideas below are theirs. The base64url alphabet, FNV-1a checksum and raw deflate are standard pieces; the combination for hand-pasted game saves is what this file adds.

- **FNV-1a hash** (Fowler, Noll and Vo, [FNV page](http://www.isthe.com/chongo/tech/comp/fnv/index.html)): the algorithm only, written out here; no code copied.
- **base64url alphabet ([RFC 4648](https://www.rfc-editor.org/rfc/rfc4648)) and raw deflate ([RFC 1951](https://www.rfc-editor.org/rfc/rfc1951))**, the latter through the browser's own `CompressionStream` / `DecompressionStream`: standards used as written; no library code included. `Uint8Array.toBase64` / `fromBase64` are the browser's own functions, used when present.
- **[localForage](https://github.com/localForage/localForage), [store.js](https://github.com/marcuswestin/store.js), [lz-string](https://github.com/pieroxy/lz-string), [fflate](https://github.com/101arrowz/fflate)** and [tiny-inflate](https://github.com/foliojs/tiny-inflate): compared as ideas only, no code from them. **[idb-keyval](https://github.com/jakearchibald/idb-keyval)** (Jake Archibald, Apache-2.0) and localForage (Apache-2.0) were also run as the speed comparison for `createLarge()` (versions 6.3.0 and 1.10.0); no code from them.
- Browser facts in "What it is not" were read from MDN (`StorageManager.persist()`, the `storage` event) and webkit.org ("Updates to Storage Policy"); nothing copied.
- The `plain36` and `hex8` code endings copy the save-code formats of Apple Press and Fancy the Banana (same maker, LFC Foundry), so their old codes keep opening.

**Original sources** (links checked 2026-11-14; ideas only unless the section above says code is included):

- [FNV-1a](http://www.isthe.com/chongo/tech/comp/fnv/index.html) by Glenn Fowler, Landon Curt Noll and Kiem-Phong Vo
- base64url ([RFC 4648](https://www.rfc-editor.org/rfc/rfc4648))
- Deflate: [RFC 1951](https://www.rfc-editor.org/rfc/rfc1951) (Phil Katz; zlib by Jean-loup Gailly and Mark Adler)

## Full research notes

The long version of this page (the exact lean-build command lines for the two game sets, the 1.1.0 reference size, the history of 1.1.0 and 1.2.0, and longer notes on browser storage rules) is kept in the project's private knowledge base. The changelog is `CHANGELOG.md` in this folder.
