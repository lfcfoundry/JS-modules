# save-kit

Safe `localStorage` saves, a rolling backup slot, and checksummed copy-paste save codes. About 11 KB.

## Use
```js
var kit = SaveKit.create({ key: 'mygame', prefix: 'MG1',
  schema: { score: 'num', level: 'int:99', sound: 'flag', name: 'str:20', owned: { type: 'counts', max: 20 } } });
var state = kit.load() || {};            // main slot, else the backup slot, else null
kit.save(state);                         // false (and nothing written) if a number is NaN/Infinity/negative
var stop = kit.autosave(function () { return state; }, 2000);   // timer + pagehide + visibilitychange
kit.exportCode(state).then(show);        // 'MG1z.<data>.<7-char check>'
kit.importCode(pasted).then(function (clean) { kit.stageImport(clean, state); location.reload(); }, showMessage);
```
`SaveKit.validate(schema, defaults, untrusted)` is also exported. `SaveKit.twoTap(fn, ms, onArm)` gives "tap again to confirm" for destructive buttons. Schema types are listed at the top of `save-kit.js`.

## What makes it different
Many save helpers just `JSON.stringify` into storage. This one assumes the data is hostile or broken:
- Every field is checked **on its own** and falls back alone, so one bad number never costs the whole save.
- `__proto__`, `constructor` and `prototype` keys are dropped; counts are capped.
- A save with a broken number is **refused**, so a bug cannot overwrite good progress.
- A backup of the last good save is kept (at most once a minute, and when the page is hidden).
- Codes carry a checksum, so a code cut off while copying says "not complete" instead of loading garbage, and words pasted after a code are ignored. They are deflate-squeezed where the browser supports it.
- Importing keeps the old game in `<key>-before-load` and pauses saving until the reload.

## Limits
Not encryption and not anti-cheat: a save code can be edited by anyone who wants to. Codes are only as private as the place they are pasted. `localStorage` can be blocked or full (private windows): `save` returns `false` instead of throwing.

## Prior art
Generic storage wrappers (for example [localForage](https://localforage.github.io/localForage/), store.js) deal with storage back-ends, not game-save safety, backups or copyable codes.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Apple Press](https://github.com/JNFoo/apple-press)
