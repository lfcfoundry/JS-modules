# save-kit

**Version 1.3.1 · API 1**

**Tested in:** Firefox 158, Chromium 155, WebKitGTK 2.52.6 (two runs each, 11 rounds); Node 45 checks, 16 lean builds, 10 raw equivalence cases.

## What it is and how it works

save-kit stores game or app progress in the browser safely. One file, 5.4 KB gzipped, no dependencies. `createLarge` does the same over IndexedDB for big saves.

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
| `afterValidate` | `function (clean, raw)` at the end of `load()`, `importCode()`, `onOtherTab()`: change `clean`, return a replacement, or `false`/`null` to refuse. A throwing hook is ignored | off |
| `stamp` | Name of the timestamp field written on every save, code and staged import | `'seen'` |
| `maxCodeBytes` | Biggest save a code may unpack to and `exportCode` will write | 262144 (256 KiB) |
| `maxCodeChars` | Longest pasted text `importCode` will look at | `maxCodeBytes` x 4/3 + 1024 (350549) |

Moving a game that already has saves: these options keep existing saves and codes working, but check an old save and an old code through the new code before shipping (field names and order come from your schema and state).

`importCode` reads the unpacked data in pieces and stops once it passes `maxCodeBytes`, so a code that expands 1000 to 1 is cut off early. It rejects with a short string, never an exception. Importing keeps the old game in `<key>-before-load` and pauses saving until the reload.

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
- Quick saves in a row: while one write runs, newer saves wait and only the newest is written; every caller's Promise resolves `true` once its save or a newer one is stored.
- `lock: true`: the first tab to save takes a lock (`navigator.locks`); another tab with the same `name` gets `false` from `save()` until it calls `claim(true)` to take over, and the old holder's `onLost(cb)` runs. Without Web Locks every tab may write.
- `onOtherTab(cb)` uses a `BroadcastChannel` and calls `cb(cleanState)` when another tab stored a save; it does not call in the tab that wrote. `clear()` removes both slots; `close()` closes the database.
- Not included (use `create()` for small saves): codes, `migrate`, `persist()`, `autosave()`. Pass `indexedDB: null` to see the no-IndexedDB path (saves `false`, loads `null`).

Speed in the three test browsers is in the table below ("How it compares").

### Lean builds (new in 1.2.0)

`python3 modules/save-kit/lean.py --without autosave,twoTap,persist` writes `save-kit-lean.js` without those parts (`--list` names every part); kept parts behave exactly as in the full file, a cut method is missing. Minify the result yourself. `lean.py` edits nothing: keep the `//@begin` / `//@else` / `//@end` marker lines in `save-kit.js` balanced.

Minified size with terser 5.36.0 (`-c passes=2 -m`), bytes, smaller is better: 1.2.0 full 8,894; set for Fancy the Banana (keeps codes and `onOtherTab`) 6,341; set for Apple Press (keeps codes and `stageImport`) 6,281; core only (`load`, `save`, `validate`, counts; no codes) 2,967. Cutting `codes` alone saves 3,551 bytes (higher is better); the other parts save 142 to 505 each.

## What it does that plain JSON saves do not

Each field is checked on its own and falls back alone. `__proto__`, `constructor` and `prototype` keys are dropped and counts are capped. A save with a broken number is refused. If the backup write fails because storage is full, the main save still counts and the backup is retried next time. Codes are deflate-squeezed where the browser supports it, only when that is really shorter, and use the browser's own `Uint8Array.toBase64`/`fromBase64` when it exists; words pasted after a code are ignored.

**Loads with a raw field are about 2 to 3 times faster since 1.3.1** (0.8 to 120 KB saves: 2.1 to 3.3x in Firefox 158, Chromium 155 and WebKitGTK 2.52.6; same clean state). When the stored text names no `__proto__`, `constructor` or `prototype` key, the objects `JSON.parse` made are used as they are instead of being copied again, so in `afterValidate(clean, raw)` a raw field of `clean` may be the same object as in `raw`.

## How it compares

Larger than a hand-written `JSON.stringify` save, but the one built for game saves: it checks every field, keeps a backup and makes copy-paste codes with a checksum. Sizes of the others were measured below (whole library builds, same minifier); speed against them in browsers: not measured.

| Alternative | Size (smaller is better) | Features | Where it wins / loses |
|---|---|---|---|
| Plain `JSON.stringify` / `JSON.parse` into `localStorage` (built in) | a few lines, nothing to ship | none of the checks, backup, codes or limits | Wins on size and simplicity. Loses: one broken value can ruin or overwrite the whole save |
| [localForage](https://localforage.github.io/localForage/) 1.10.0 (Apache-2.0) | 29,208 bytes minified, 8,781 gzipped | storage back-ends (localForage: IndexedDB, WebSQL, localStorage); no game-save checks, backup or codes | Wins when you need IndexedDB or large data. Loses: does not protect a game save |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval) 6.3.0 (Apache-2.0) | 4,758 bytes minified, 1,507 gzipped | a small asynchronous key-value store on IndexedDB; no schema, checks, backup slot or codes | Wins when a save is large or must not block the page. Loses: does not protect a game save, and every read and write is asynchronous |
| [lz-string](https://github.com/pieroxy/lz-string) 1.5.0 (MIT) | 4,814 bytes minified, 1,401 gzipped | URL-safe compressed text; no checksum, schema or size limit | Wins without `CompressionStream`. Loses: a cut-off or hostile code is not caught |
| [fflate](https://github.com/101arrowz/fflate) 0.8.3 (MIT) | 32,794 bytes minified, 12,512 gzipped (whole library; a tree-shaken build is smaller) | real deflate code, could be an old-browser fallback | Wins on old browsers (this module has none). Loses: only the compression piece |
| **save-kit 1.2.2** | 12,772 bytes minified, 5,427 gzipped (terser 5.51.2, `-c passes=2 -m`, same as the rows above); core only without codes 2,967 minified (terser 5.36.0, 1.2.0 file, so not comparable with the first figure) | per-field checks, backup slot, checksummed codes, size limits, other-tab notice, lean builds | Speed (smaller is better): a small save (448 bytes) loads in 3.24 microseconds in ungoogled-chromium 155.0.8059.39-1, 2.6 in Firefox 158.0, 1.95 in WebKitGTK 2.52.6, 2.05 in GNOME Web 46.5; against the alternatives: not measured |

### Large saves against idb-keyval and localForage

A game-like save (a list of small tile objects plus 2,000 named counts), the whole call from start to the data being stored (save) or in hand (load), milliseconds, smaller is better, median of 14 rounds over two passes, one library at a time. idb-keyval 6.3.0 and localForage 1.10.0 store the object as it is (no checks, no backup); `createLarge` also checks, writes the backup slot on the first save and every 60 s, and rebuilds the state on load. Tool: `tests/save-kit-large-browser.js` (`LIBS=<folder with the two libraries>`). Measured in a cloud container, no noise guard, not a laptop or phone.

| Save size, call | Chromium 155 ours / idb-keyval / localForage | Firefox 158 ours / idb-keyval / localForage | WebKitGTK 2.52.6 ours / idb-keyval / localForage |
|---|---|---|---|
| 0.8 MB save | 11.6 / 9.4 / 9.7 | 9 / 21 / 24 | 7 / 19 / 15 |
| 0.8 MB load | 7.2 / 7.9 / 8.0 | 7 / 19 / 20 | 11 / 9 / 8 |
| 4 MB save | 36.6 / 41.0 / 46.9 | 41 / 91 / 90 | 26 / 79 / 73 |
| 4 MB load | 27.5 / 39.5 / 34.8 | 40 / 97 / 95 | 39 / 34 / 35 |
| 16 MB save | 182.5 / 190.6 / 174.4 | 191 / 405 / 441 | 102 / 375 / 405 |
| 16 MB load | 126.6 / 224.5 / 206.3 | 199 / 389 / 386 | 157 / 130 / 167 |

Where it loses: Chromium 0.8 MB save (about 2 ms slower than idb-keyval), Chromium 16 MB save (5% slower than localForage, 4% faster than idb-keyval), WebKitGTK loads at 0.8, 4 and 16 MB (up to 21% slower than idb-keyval, 6% faster than localForage at 16 MB). Everywhere else it is faster, up to 4.0x (WebKitGTK 16 MB save against localForage). A backup write on every save (`backupEveryMs: 0`) is slower on large saves in Firefox (111 vs 41 ms at 4 MB).

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

- **FNV-1a hash** (Fowler, Noll and Vo): the algorithm only, written out here; no code copied.
- **base64url alphabet (RFC 4648) and raw deflate (RFC 1951)**, the latter through the browser's own `CompressionStream` / `DecompressionStream`: standards used as written; no library code included. `Uint8Array.toBase64` / `fromBase64` are the browser's own functions, used when present.
- **localForage, store.js, lz-string, fflate** and tiny-inflate: compared as ideas only, no code from them. **idb-keyval** (Jake Archibald, Apache-2.0) and localForage (Apache-2.0) were also run as the speed comparison for `createLarge()` (versions 6.3.0 and 1.10.0); no code from them.
- Browser facts in "What it is not" were read from MDN (`StorageManager.persist()`, the `storage` event) and webkit.org ("Updates to Storage Policy"); nothing copied.
- The `plain36` and `hex8` code endings copy the save-code formats of Apple Press and Fancy the Banana (same maker, LFC Foundry), so their old codes keep opening.

## Full research notes

The long version of this page (the exact lean-build command lines for the two game sets, the 1.1.0 reference size, the history of 1.1.0 and 1.2.0, and longer notes on browser storage rules) is kept in the project's private knowledge base. The changelog is `CHANGELOG.md` in this folder.
