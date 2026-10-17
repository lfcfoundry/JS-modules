# save-kit changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
Two fixes: a "raw" default is now copied for each state (before, editing the state edited the defaults, so a later reset gave back the edited data), and a "counts" default is now used when the field is missing (before it was ignored and started empty). load() reads the backup slot only when the main slot is missing or has a broken number: about 37% less time to load a 500-name save in Chromium (210 to 133 microseconds), 28% in Firefox (97 to 70) and 36% in WebKitGTK (323 to 207), and about 38% to 50% less for a 20-name save (medians of 5 runs, 3 in WebKitGTK). Exporting and importing a code ask the browser once whether compression exists instead of building two streams each time: in Chromium about 30% less per call (export 3.2 to 2.2 ms, import 1.2 to 0.7 ms for a 20-name save), no change in WebKitGTK. New: kit.onOtherTab(cb) tells a tab when another tab of the same site wrote or cleared the save (checked with a real second page in all three browsers) so an old tab can stop overwriting newer progress; kit.persist() asks the browser to keep the storage (Chromium answers false by itself, Firefox 158 asks the player and waits, WebKitGTK 2.52.6 has no persist and answers false); options version + migrate upgrade old saves and codes; skipUnchangedMs skips rewriting a save that did not change (40 unchanged saves make 1 storage write instead of 40, same in all three browsers; default off); compactCodes makes shorter codes (a 5-field save went from 116 to 48 characters, 59% shorter; a 20-name save about 9% shorter, a 500-name save about 1%; default off). The file grew from 9,292 to 11,245 bytes minified (4,036 to 4,771 gzipped). The module test also no longer fails about 1 run in 15 (it compared a code letter that depends on the clock). The API is unchanged and every new option is off unless you set it.

Tested in: ungoogled-chromium 155.0.8059.39, Firefox 158.0 and WebKitGTK 2.52.6 (one at a time): the timings above, and a check with a real second page (storage events across tabs), real compression, migrate and write counts; 35 Node checks with a fake storage. The real-browser check and the demo page were run again on this build (2026-10-17) in the same three browsers and in GNOME Web (Epiphany) 46.5 (storage events across tabs, code lengths 116 to 48 characters, migrate, 1 write instead of 40, demo page without errors), and the whole repo run in ungoogled Chromium 155 passed. Not tested: a real second browser window, Safari itself, a real phone, persist() after a real user answer.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Node checks with a fake storage; no real browser run recorded for the module itself (its demo page loads in Firefox through `tests/firefox.js`: Firefox 158 per the 2026-10-15 note, Firefox 157 on 2026-10-17).

## Before version labels

- Early October 2026: First version: safe saves with a backup slot, and checksummed copy-paste save codes.
- 2026-10-15: Pasted save codes now have a length limit and a limit on what they may unpack to (before, a short paste could unpack to 100 MB).
- 2026-10-15: A save with one bad number keeps its good parts instead of being thrown away; a new on-by-default setting loads as on; a blocked or broken `localStorage` no longer stops the game from starting.
- 2026-10-16: README: documented `pause()` and `forceBackupNext()`.
