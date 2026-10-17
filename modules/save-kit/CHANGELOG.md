# save-kit changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Node checks with a fake storage; no real browser run recorded for the module itself (its demo page loads in Firefox through `tests/firefox.js`: Firefox 158 per the 2026-10-15 note, Firefox 157 on 2026-10-17).

## Before version labels

- Early October 2026: First version: safe saves with a backup slot, and checksummed copy-paste save codes.
- 2026-10-15: Pasted save codes now have a length limit and a limit on what they may unpack to (before, a short paste could unpack to 100 MB).
- 2026-10-15: A save with one bad number keeps its good parts instead of being thrown away; a new on-by-default setting loads as on; a blocked or broken `localStorage` no longer stops the game from starting.
- 2026-10-16: README: documented `pause()` and `forceBackupNext()`.
