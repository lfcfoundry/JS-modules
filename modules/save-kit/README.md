# save-kit

**Version 1.2.1 · API 1**

**Tested in:** ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time (tests/save-kit-browser.js 13 of 13 full and 13 of 13 lean in each; tests/save-kit-speed-browser.js: old and new store and load the same in each); 43 Node checks and 15 of 15 lean builds pass; 4,000 random saves give identical results old versus new. Not run: a phone, Safari itself

Safe `localStorage` saves, a rolling backup slot, and checksummed copy-paste save codes. About 27 KB with its comments, about 12.7 KB minified (5.4 KB gzipped), no dependencies.

How it works: you describe your save as a schema (each field's name and type). On load it reads the main slot and a backup slot and rebuilds the state field by field from the better one, so one damaged number costs only that number. On save it refuses to write when a number is broken and copies the last good save to the backup slot at most once a minute. A save code is the save packed into text with a short checksum at the end, so a code that was cut off while copying is caught.

## Why it exists

A game's progress lives in the browser's `localStorage`, where one bad value or one buggy save can ruin or overwrite everything, and phones close hidden pages without warning. The obvious alternative is writing `JSON.stringify` and `JSON.parse` by hand; that is smaller, but it has none of these protections (see "How it compares"). This module also gives players a way to copy their save out as text and paste it back, and it checks pasted text before trusting it.

## Use
```js
var kit = SaveKit.create({ key: 'mygame', prefix: 'MG1',
  schema: { score: 'num', level: 'int:99', sound: 'flag', name: 'str:20', owned: { type: 'counts', max: 20 } },
  defaults: { sound: 1 } });
var state = kit.load() || kit.validate({});   // rebuilt from the better of the main and backup slots, else null
kit.save(state);                         // false (and nothing written) if a number is NaN/Infinity/negative
var stop = kit.autosave(function () { return state; }, 2000);   // timer + pagehide + visibilitychange
kit.exportCode(state).then(show, showMessage);   // 'MG1z.<data>.<7-char check>' (or 'MG1p...')
kit.importCode(pasted).then(function (clean) { kit.stageImport(clean, state); location.reload(); }, showMessage);
```
`SaveKit.validate(schema, defaults, untrusted)` is also exported, plus `SaveKit.has(obj, key)` (see counts below) and `SaveKit.twoTap(fn, ms, onArm)` for "tap again to confirm" on destructive buttons. Two small methods on the kit: `kit.pause(true)` switches saving off (and `kit.pause(false)` on again), which `stageImport` uses while a loaded save waits for a reload; `kit.forceBackupNext()` makes the next `save()` also refresh the backup slot, whatever the backup interval.

Since 1.1.0:
- `kit.onOtherTab(function (state, event) {...})` is called when **another tab** of the same site writes the save (`state` is the clean new save, or `null` if it was removed). The browser never tells the tab that wrote it. Use it so an old tab does not overwrite newer progress: `kit.pause(true)` and show "This game changed in another tab. Reload." Returns a function that stops listening. Does nothing outside a browser.
- `kit.persist()` asks the browser not to delete this site's storage when space runs low. Resolves `true`/`false`, never rejects. The browser decides: Chrome answers by itself (often `false` for a page nobody installed), **Firefox 158 asks the player and the promise waits for the answer**, and WebKitGTK 2.52.6 has no `persist()` (so `false`). Call it after the player did something that shows they care (a first save), never at page load.
- `kit.save(state, true)` writes even when `skipUnchangedMs` would skip it (autosave does this by itself when the page is hidden or closed).
- Schema types are listed at the top of `save-kit.js`.

## How it compares
Larger than a hand-written `JSON.stringify` save, but among the alternatives listed here it is the one built for game saves: it checks every field, keeps a backup and makes copy-paste codes with a checksum. The sizes of the libraries and speed in browsers against all of them: not measured.

| Alternative | Size (smaller is better) | Speed (faster is better) | Features | Where it wins / loses |
|---|---|---|---|---|
| Plain `JSON.stringify` and `JSON.parse` into `localStorage` (the usual hand-written way; built in) | a few lines, nothing to ship | not measured | none of the checks, backup, codes or size limits | Wins on size and simplicity. Loses: one broken value can ruin or overwrite the whole save. |
| Storage wrappers: [localForage](https://localforage.github.io/localForage/) (Apache-2.0), store.js (MIT); versions not checked | not measured | not measured | deal with storage back-ends (localForage: IndexedDB, WebSQL, localStorage); no game-save checks, backup or codes | Wins when you need IndexedDB or large data. Loses: does not protect a game save. |
| [lz-string](https://github.com/pieroxy/lz-string) (MIT); version not checked | not measured | not measured | URL-safe compressed text; no checksum, schema or size limit | Wins on working in browsers without `CompressionStream`. Loses: a cut-off or hostile code is not caught. |
| [fflate](https://github.com/101arrowz/fflate) (MIT); version not checked | not measured | not measured | real deflate code that could be an old-browser fallback | Wins on old browsers (this module does not include a fallback). Loses: it is only the compression piece. |
| **save-kit 1.2.1** | 12,725 bytes minified, 5,409 gzipped (terser 5.51.2, `-c passes=2 -m`); core only without codes 2,967 minified (terser 5.36.0, 1.2.0 file, so not comparable with the first figure) | small save (448 bytes) loads in 3.24 microseconds in ungoogled-chromium 155.0.8059.39-1, 2.6 in Firefox 158.0, 1.95 in WebKitGTK 2.52.6, 2.05 in GNOME Web 46.5 (smaller is better; compared with the alternatives: not measured) | per-field checks, backup slot, checksummed codes, size limits, other-tab notice, lean builds | see below |

Where it loses:
- It is larger than a hand-written save (see the table). The lean build below cuts the parts a game does not use.
- It stores in `localStorage` (or any object with synchronous `getItem`/`setItem`), not IndexedDB; `localStorage` holds about 5 MiB per origin.
- Squeezed codes need `CompressionStream`; older browsers get plain codes only and cannot open squeezed ones. There is no old-browser fallback.
- Not encryption and not anti-cheat; a code can be edited.
- Not measured: speed against the alternatives in any browser, and the sizes of the other libraries.

What it does that a plain `JSON.stringify` save does not. Many save helpers just `JSON.stringify` into storage. This one assumes the data is hostile or broken:
- Every field is checked **on its own** and falls back alone, so one bad number never costs the whole save. If a slot has a broken number, `load()` still rebuilds the rest from it; if both slots have problems it uses the one with fewer broken numbers.
- `__proto__`, `constructor` and `prototype` keys are dropped (in `counts` names and anywhere inside a `raw` field); counts are capped in size and in number of names.
- A save with a broken number is **refused**, including a broken value inside a `counts` field, so a bug cannot overwrite good progress.
- A backup of the last good save is kept (at most once a minute, and when the page is hidden). If the backup write fails because storage is full, the main save still counts as saved and the backup is tried again next time.
- Codes carry a checksum, so a code cut off while copying says "not complete" instead of loading garbage, and words pasted after a code are ignored. They are deflate-squeezed where the browser supports it, but only when that is really shorter (small saves stay plain). The browser's own `Uint8Array.toBase64`/`fromBase64` is used when it exists.
- Pasted codes have size limits (see below), so a small hostile or damaged code cannot swell into hundreds of megabytes.
- Importing keeps the old game in `<key>-before-load` and pauses saving until the reload.

## Options for `create()`
| Option | Meaning | Default |
|---|---|---|
| `key`, `schema`, `defaults` | Storage key, field types, fallback values | required (`defaults` optional) |
| `prefix` | Start of a save code | `'SK1'` |
| `storage` | Any object with `getItem`/`setItem` | `localStorage`; `null` if the browser blocks it |
| `soundKeys` | Numbers that must be sound to write a save | every `num` and `int` field |
| `backupEveryMs` | Least time between backup writes | 60000 |
| `version`, `migrate` | `version: 2` stamps every save and code with `v: 2`. When a save with a lower `v` (or none) is loaded or imported, `migrate(copyOfOldSave, fromVersion)` is called first and its returned object is then checked as usual. A `migrate` that throws leaves the save as it was. | off |
| `skipUnchangedMs` | If every field is the same as in the last write (only `seen` differs), `save()` returns `true` without touching storage until this many ms have passed. Pages that hide or close still write. Idle games that read `seen` for the time away should pick a small value (the stored `seen` can be this old). | `0` (every save writes, as before) |
| `compactCodes` | `exportCode` leaves out fields equal to their default and a `seen` the schema does not list. Opens in any 1.x of save-kit. Only safe if a field's default never changes later (a code made while `sound` was on and defaulted to 1 would turn it on again after the default flips to 0). | `false` |
| `codeCheck` | The ending of a save code. `'padded36'` (default): 7 base-36 characters. `'plain36'`: base 36 without leading zeros, 1 to 7 characters (Apple Press's old codes). `'hex8'`: 8 hex characters (Fancy the Banana's old codes). It is used to write and to read, and the same FNV-1a hash is behind all three, so only the look of the ending differs. Words pasted after a code are still ignored. | `'padded36'` |
| `backupKey` | Name of the backup slot. | `<key>-backup` |
| `damagedKey` | If the main slot has text that `load()` could not use (unreadable, refused by `afterValidate`, or worse than the backup), the text is copied to this slot first, so it can be looked at later. Off unless given. | off |
| `readBackupWithoutMain` | `false`: when the main slot does not exist, `load()` returns `null` and never brings back a leftover backup. A main slot that exists but is damaged still falls back to the backup. | `true` |
| `afterValidate` | `function (clean, raw)` called at the end of `load()`, `importCode()` and `onOtherTab()` with the schema-checked save and the untrusted object as read. Change `clean` in place, return a replacement object, or return `false`/`null` to refuse the save (`load()` then tries the other slot, `importCode()` says "damaged"). A hook that throws is ignored. For rules the schema cannot say (nested objects, rules between fields). | off |
| `stamp` | Name of the timestamp field written on every save, code and staged import. | `'seen'` |
| `maxCodeBytes` | Biggest save a code may unpack to, and the biggest one `exportCode` will write | 262144 (256 KiB) |
| `maxCodeChars` | Longest pasted text `importCode` will look at (the text around the code counts too) | `maxCodeBytes` x 4/3 + 1024 (350549) |

`importCode` reads the unpacked data in pieces and stops as soon as it passes `maxCodeBytes`, so a code that expands 1000 to 1 is cut off early. It rejects with a short message (a string), never an exception. Raise the two limits only if your saves are really large.

## Lean builds: leave out what a game does not use (new in 1.2.0)

`save-kit.js` stays the full file. `python3 modules/save-kit/lean.py --without autosave,twoTap,persist` writes `save-kit-lean.js` without those parts (`--list` names every part). A part you keep behaves exactly as in the full file; a method you cut is simply missing (`kit.autosave` is `undefined`). Minify the result with your own minifier as usual. Every single cut, and the two sets below, run through the same checks as the full file (`node modules/save-kit/test/lean.js`, 15 builds); the checks that need a cut part are skipped.

Minified size with terser 5.36.0 (`-c passes=2 -m`), in bytes, smaller is better:

| Build | Minified | Cut from the full file |
|---|---|---|
| 1.1.0 full (for reference) | 8,336 | |
| 1.2.0 full | 8,894 | the new options added 558 bytes |
| Set for Fancy the Banana (keeps codes and `onOtherTab`) | 6,341 | -2,553 (29% smaller) |
| Set for Apple Press (keeps codes and `stageImport`) | 6,281 | -2,613 (29% smaller) |
| Core only (`load`, `save`, `validate`, counts; no codes) | 2,967 | -5,927 |

What each part costs when cut from the full 1.2.0 file alone (bytes saved, higher is better): `codes` 3,551 (export/import and everything only they use), `autosave` 505, `onOtherTab` 431, `raw` 387, `migrate` 342 (`version` + `migrate`), `persist` 235, `nativeBase64` 220 (the plain base64 loops stay), `stageImport` 205, `twoTap` 185, `streamLimit` 173 (a simpler unpacker that checks the size only after unpacking, so a hostile tiny code can briefly fill memory), `skipUnchanged` 162, `compact` 142.

Set for Fancy: `--without autosave,twoTap,persist,stageImport,migrate,skipUnchanged,compact,raw,nativeBase64,streamLimit`. Set for Apple Press: `--without autosave,twoTap,persist,onOtherTab,migrate,skipUnchanged,compact,raw,nativeBase64`. The codes part is about 3.5 KB of the file because it also does what a game's own code usually skips: stops a hostile code as soon as it passes the size limit, picks the shorter of squeezed and plain, and uses the browser's own base64 when it has it.

## Moving a game that already has saves (new in 1.2.0)

The options above exist so that saves and codes already on players' devices keep working. For example, a game whose codes end in 8 hex characters, whose backup is `bf1-bak` and which keeps broken text in `bf1-damaged`:

```js
SaveKit.create({ key: 'bf1', prefix: 'BF1', schema: ..., defaults: ...,
  codeCheck: 'hex8', backupKey: 'bf1-bak', damagedKey: 'bf1-damaged', readBackupWithoutMain: false, stamp: 'savedAt',
  afterValidate: function (clean, raw) { /* the game's own rules; return false to refuse the save */ } });
```

A game whose codes end in base 36 without padding uses `codeCheck: 'plain36'`. What the options do not do: they do not change what a save looks like inside (field names and the order the fields are written in come from your schema and your state object), so check an old save and an old code of your own through the new code before shipping. The two games this was made for will run that check on their saves.

## Good to know
- **Counts have no prototype.** A `counts` field comes back as `Object.create(null)`, so `owned.hasOwnProperty('a')` fails. Use `SaveKit.has(owned, 'a')`, `'a' in owned`, or `Object.keys(owned)`. This is on purpose: a name like `constructor` can never reach a real prototype.
- **`seen` (or the name you give `stamp`) is stamped on every save and export** (a `Date.now()` timestamp written into the stored data) and is **removed again by `load()`/`validate()`** unless your schema lists it (for example `seen: 'num'`). Idle games that need the time away should list it.
- **`flag` uses its default** when the field is missing or broken, so a new on-by-default setting (`defaults: { sound: 1 }`) stays on for players who saved before it existed. A saved `0` stays `0`.
- **Failing safely:** `create()`, `load()`, `save()`, `exportCode()`, `importCode()` and `autosave()` never throw. `save(null)` returns `false`; `exportCode(null)` rejects with a message; a `getState()` that throws is skipped for that tick.
- **Saving mutates your state object** by adding `seen` (and `v` when you set `version`). Hand it a copy if that matters.
- **Defaults are copied.** Since 1.1.0 a `raw` default is copied for each state (in 1.0.0 the state held the default object itself, so editing the state edited the defaults and a later reset gave back the edited data), and a `counts` default is used when the field is missing or not a map (1.0.0 always started those from an empty map).

## Limits
- Not encryption and not anti-cheat: a save code can be edited by anyone who wants to. Codes are only as private as the place they are pasted.
- `localStorage` is about 5 MiB per origin and can be blocked or full (private windows): `save` returns `false` instead of throwing, and `load()` returns `null`.
- **Safari may delete script-written storage** (localStorage, IndexedDB) of a site the player has not visited for a while. The 2020 rule was seven days; the 2023 "Updates to Storage Policy" post on webkit.org I read for this review says only "not interacted with by the user for some time" and gives no day count, and says home-screen web apps get the normal quotas and that `persist()` is granted by heuristics such as being a home-screen app. So treat seven days as the old figure, not re-verified. Offer the player a save code, and call `kit.persist()`.
- **Two tabs of one game** write to the same slot and the last write wins, so an old tab's autosave can erase newer progress. `kit.onOtherTab` lets you notice (the browser's `storage` event fires only in the other tabs, never in the writer).
- **Third-party frames:** Firefox partitions `localStorage` by the top-level site, so a game embedded in another site may not see the save it made when opened on its own page. Chrome and Safari behavior is not checked here.
- Pages may be closed with no event at all on phones. Autosave keeps the loss small, it cannot remove it.
- Squeezed codes need `CompressionStream`/`DecompressionStream` with `deflate-raw` (Chrome 103, Firefox 113, Safari 16.4). An older browser makes plain codes and says "cannot open that code" for squeezed ones.
- The unpack limit is a safety net for one save, not a promise about memory use: the text itself can still be about 350,000 characters.
- Code checksums catch copy mistakes, not tampering.

## Prior art and credits
Generic storage wrappers (for example [localForage](https://localforage.github.io/localForage/), store.js) deal with storage back-ends, not game-save safety, backups or copyable codes. [lz-string](https://github.com/pieroxy/lz-string) makes URL-safe compressed text but has no checksum, schema or size limit; [fflate](https://github.com/101arrowz/fflate) and tiny-inflate are real deflate code that could serve as an old-browser fallback (not included). The base64url alphabet, FNV-1a checksum and raw deflate are all standard pieces; the combination for hand-pasted game saves is what this file adds.

Credits, what was taken from others:
- FNV-1a hash (Fowler, Noll and Vo): the algorithm only, written out here; no code copied.
- base64url alphabet (RFC 4648) and raw deflate (RFC 1951, through the browser's own `CompressionStream` / `DecompressionStream`): standards used as written; no library code included.
- `Uint8Array.toBase64` / `fromBase64`: the browser's own functions, used when present.
- Browser facts in "Limits" were read from MDN (`StorageManager.persist()`, the `storage` event) and from webkit.org ("Updates to Storage Policy"); nothing copied.
- The `plain36` and `hex8` code endings copy the save-code formats of Apple Press and Fancy, the Banana (same maker, LFC Foundry), so their old codes keep opening.
- localForage, store.js, lz-string and fflate: ideas compared only, no code from them.
No code from others; the ideas above are theirs.

## For AI agents
- Copy `save-kit.js` (keep its header), call `SaveKit.create({ key, prefix, schema, defaults })` once, then `load()` at start, `autosave()` after, and `exportCode`/`importCode` for a "copy your save" box.
- Always give `defaults` for new fields; put a new setting's on-by-default value there, and add the field to `schema` or it is dropped on load.
- Treat every promise as possibly rejected: show the string a rejected `importCode`/`exportCode` gives. Do not wrap the calls in your own try/catch for storage; they already return `false`/`null`.
- After `importCode` succeeds call `stageImport(clean, currentState)` then `location.reload()`; do not call `save()` in between (saving is paused).
- Use `SaveKit.has(counts, name)` for counts objects. Do not add a second "save codes" module: the candidate "save codes" module on the task board is already covered by save-kit (base64url, FNV-1a checksum, `deflate-raw` with plain fallback, size limits).
- Several tabs: call `kit.onOtherTab` once and `kit.pause(true)` there; add `version`/`migrate` the first time a schema field is renamed.
- Run the checks with `node modules/save-kit/test/run.js` (plain Node, no browser). `OLD_REF=<commit>` compares against an older file; `OLD_REF=none` skips that. `node modules/save-kit/test/lean.js` checks the lean builds; `tests/save-kit-browser.js` runs the new options in a real browser (see the file's first lines). `lean.py` edits nothing: change `save-kit.js` and keep its `//@begin` / `//@else` / `//@end` marker lines balanced (a part is cut by removing the lines between them).

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
