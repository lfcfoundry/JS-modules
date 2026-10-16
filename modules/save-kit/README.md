# save-kit

**Version 1.0.0 · API 1**

Safe `localStorage` saves, a rolling backup slot, and checksummed copy-paste save codes. About 17 KB with its comments, no dependencies.

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
`SaveKit.validate(schema, defaults, untrusted)` is also exported, plus `SaveKit.has(obj, key)` (see counts below) and `SaveKit.twoTap(fn, ms, onArm)` for "tap again to confirm" on destructive buttons. Two small methods on the kit: `kit.pause(true)` switches saving off (and `kit.pause(false)` on again), which `stageImport` uses while a loaded save waits for a reload; `kit.forceBackupNext()` makes the next `save()` also refresh the backup slot, whatever the backup interval. Schema types are listed at the top of `save-kit.js`.

## What makes it different
Many save helpers just `JSON.stringify` into storage. This one assumes the data is hostile or broken:
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
| `maxCodeBytes` | Biggest save a code may unpack to, and the biggest one `exportCode` will write | 262144 (256 KiB) |
| `maxCodeChars` | Longest pasted text `importCode` will look at (the text around the code counts too) | `maxCodeBytes` x 4/3 + 1024 (350549) |

`importCode` reads the unpacked data in pieces and stops as soon as it passes `maxCodeBytes`, so a code that expands 1000 to 1 is cut off early. It rejects with a short message (a string), never an exception. Raise the two limits only if your saves are really large.

## Good to know
- **Counts have no prototype.** A `counts` field comes back as `Object.create(null)`, so `owned.hasOwnProperty('a')` fails. Use `SaveKit.has(owned, 'a')`, `'a' in owned`, or `Object.keys(owned)`. This is on purpose: a name like `constructor` can never reach a real prototype.
- **`seen` is stamped on every save and export** (a `Date.now()` timestamp written into the stored data) and is **removed again by `load()`/`validate()`** unless your schema lists it (for example `seen: 'num'`). Idle games that need the time away should list it.
- **`flag` uses its default** when the field is missing or broken, so a new on-by-default setting (`defaults: { sound: 1 }`) stays on for players who saved before it existed. A saved `0` stays `0`.
- **Failing safely:** `create()`, `load()`, `save()`, `exportCode()`, `importCode()` and `autosave()` never throw. `save(null)` returns `false`; `exportCode(null)` rejects with a message; a `getState()` that throws is skipped for that tick.
- **Saving mutates your state object** by adding `seen`. Hand it a copy if that matters.

## Limits
- Not encryption and not anti-cheat: a save code can be edited by anyone who wants to. Codes are only as private as the place they are pasted.
- `localStorage` is about 5 MiB per origin and can be blocked or full (private windows): `save` returns `false` instead of throwing, and `load()` returns `null`.
- **Safari deletes script-written storage** (localStorage, IndexedDB) after seven days of use without the player visiting that site (WebKit's 2020 storage policy; home-screen web apps count separately). A long break can erase a save in Safari. Offer the player a save code, or ask the browser for persistent storage.
- **Third-party frames:** Firefox partitions `localStorage` by the top-level site, so a game embedded in another site may not see the save it made when opened on its own page. Chrome and Safari behavior is not checked here.
- Pages may be closed with no event at all on phones. Autosave keeps the loss small, it cannot remove it.
- Squeezed codes need `CompressionStream`/`DecompressionStream` with `deflate-raw` (Chrome 103, Firefox 113, Safari 16.4). An older browser makes plain codes and says "cannot open that code" for squeezed ones.
- The unpack limit is a safety net for one save, not a promise about memory use: the text itself can still be about 350,000 characters.
- Code checksums catch copy mistakes, not tampering.

## Prior art
Generic storage wrappers (for example [localForage](https://localforage.github.io/localForage/), store.js) deal with storage back-ends, not game-save safety, backups or copyable codes. [lz-string](https://github.com/pieroxy/lz-string) makes URL-safe compressed text but has no checksum, schema or size limit; [fflate](https://github.com/101arrowz/fflate) and tiny-inflate are real deflate code that could serve as an old-browser fallback (not included). The base64url alphabet, FNV-1a checksum and raw deflate are all standard pieces; the combination for hand-pasted game saves is what this file adds.

## For AI agents
- Copy `save-kit.js` (keep its header), call `SaveKit.create({ key, prefix, schema, defaults })` once, then `load()` at start, `autosave()` after, and `exportCode`/`importCode` for a "copy your save" box.
- Always give `defaults` for new fields; put a new setting's on-by-default value there, and add the field to `schema` or it is dropped on load.
- Treat every promise as possibly rejected: show the string a rejected `importCode`/`exportCode` gives. Do not wrap the calls in your own try/catch for storage; they already return `false`/`null`.
- After `importCode` succeeds call `stageImport(clean, currentState)` then `location.reload()`; do not call `save()` in between (saving is paused).
- Use `SaveKit.has(counts, name)` for counts objects. Do not add a second "save codes" module: the candidate "save codes" module on the task board is already covered by save-kit (base64url, FNV-1a checksum, `deflate-raw` with plain fallback, size limits).
- Run the checks with `node modules/save-kit/test/run.js` (plain Node, no browser). `OLD_REF=<commit>` compares against an older file; `OLD_REF=none` skips that.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
