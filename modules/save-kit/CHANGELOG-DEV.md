# save-kit developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.4.0 · API 1 · 2026-10-31

### Quick
durable: true mirrors each save to IndexedDB (strict); recover() returns the newer copy after a crash. SaveKit.durableCopy(name) does the same for any text.

### Details
create({durable:true}) keeps the synchronous localStorage load. Each save is also put in IndexedDB with durability 'strict', newest only while a write runs. The record present at page open is read once before any write, so an early save cannot hide it. recover() compares the copy's stamp with the save load() returned (no parse when nothing was lost) and writes a newer copy back. flushed() resolves when the newest save is on disk. SaveKit.durableCopy(name) exposes the same copy for any text: write(text, seq), newer(seq), flushed(); a 3.9 MB text is on disk 11-25 ms after write() and newer() answers in 10-24 ms. Real crash test (SIGKILL after 8 s of saves every 100 ms): Chromium lost 29 of 80 saves in localStorage, Firefox 30; recover() lost 0 in both. Page cost within noise; copy on disk 2 ms (2 KB) to 8-12 ms (200 KB) later. lean.py part 'durable'.

### Deep
New opt-in durable option with recover() and flushed(), plus SaveKit.durableCopy() for any text: saves survive a browser crash.

## 1.4.0 · API 1 · 2026-10-31

### Quick
durable: true mirrors each save to IndexedDB (strict); recover() returns the newer copy after a crash.

### Details
create({durable:true}) keeps the synchronous localStorage load. Each save is also put in IndexedDB with durability 'strict', newest only while a write runs. The record present at page open is read once before any write, so an early save cannot hide it. recover() compares the copy's stamp with the save load() returned (no parse when nothing was lost) and writes a newer copy back. flushed() resolves when the newest save is on disk. Real crash test (SIGKILL after 8 s of saves every 100 ms): Chromium lost 29 of 80 saves in localStorage, Firefox 30; recover() lost 0 in both. Page cost within noise; copy on disk 2 ms (2 KB) to 8-12 ms (200 KB) later. lean.py part 'durable'.

### Deep
New opt-in durable option with recover() and flushed(): saves survive a browser crash.

## 1.3.1 · API 1 · 2026-10-30

### Quick
Raw-field load prefilter (research thread brief A, 2026.10.31): when a slot's text has no __proto__/constructor/prototype and nesting is at most 32 deep, raw fields reuse JSON.parse objects instead of deep copy + scrub.

### Deep
Raw-field load prefilter (research thread brief A, 2026.10.31): when a slot's text has no __proto__/constructor/prototype and nesting is at most 32 deep, raw fields reuse JSON.parse objects instead of deep copy + scrub. Load time per call, 2 runs, old->new us: Chromium small raw 13.9->6.1, medium 196->82, large 2020->810; Firefox 18.7->6.0, 225->67, 2450->750; WebKitGTK 17.6->7.9, 264->107, 2450->1100. Saves without raw fields: prefilter skipped (0.92-1.00x). Same clean state on all cases; test/raw-equivalence.js compares against 1.3.0 (poisoned keys, 40-deep, migrate, afterValidate). Note: afterValidate's raw and clean may share raw-field objects.

## 1.3.0 · API 1 · 2026-10-30

### Quick
New SaveKit.createLarge(): big saves in IndexedDB with a backup slot and an optional cross-tab lock. Up to 4x faster than idb-keyval and localForage on 16 MB; slower in a few cases (README). create() is unchanged.

### Deep
New, off unless used: SaveKit.createLarge() for saves of a few MB and up (localStorage holds about 5 MB per site). Stores the JSON text and its length in an IndexedDB main slot and backup slot in one transaction; load() falls back to the other slot when a slot is cut short or not a JSON object; a broken number refuses the save; quick saves in a row write only the newest; lock:true lets one tab write (claim(true) takes over, onLost tells the old holder); onOtherTab uses a BroadcastChannel; raw fields skip the deep copy when the text names no __proto__, constructor or prototype key. A 32-bit check of our own was built and dropped: it cost 8 to 54 ms on 16 MB (JSON text 16 MB: encode 54 ms, check 8 ms in Chromium 155) and the save was 2x slower than idb-keyval with it. Speed against idb-keyval 6.3.0 and localForage 1.10.0, ms for the whole call, median of 14 over two passes, cloud container, no noise guard (ours / idb-keyval / localForage): 16 MB save Chromium 155 182.5 / 190.6 / 174.4, Firefox 158 191 / 405 / 441, WebKitGTK 2.52.6 102 / 375 / 405; 16 MB load Chromium 126.6 / 224.5 / 206.3, Firefox 199 / 389 / 386, WebKitGTK 157 / 130 / 167; 4 MB save Chromium 36.6 / 41.0 / 46.9, Firefox 41 / 91 / 90, WebKitGTK 26 / 79 / 73; 4 MB load Chromium 27.5 / 39.5 / 34.8, Firefox 40 / 97 / 95, WebKitGTK 39 / 34 / 35. Slower: Chromium 0.8 MB save (11.6 vs 9.4 ms), Chromium 16 MB save 5% slower than localForage, WebKitGTK loads 15 to 22% slower than idb-keyval (6% faster than localForage at 16 MB). The old create() is unchanged: node test 45 of 45 and all 16 lean builds pass; lean.py gained the part large (file 37,123 bytes with comments, 26,321 without large). Not measured: minified size, phones, a laptop.

## 1.2.2 · API 1 · 2026-10-27

### Quick
A zero limit in a schema now means zero: max 0 or maxKeys 0 rejects nonempty text and count entries.

## 1.2.1 · API 1 · 2026-10-17

### Quick
Loading and saving is a little faster. Nothing a game sees changes.

### Deep
Speed only; nothing a game sees changes. The field rules (the schema) were read again for every save and load; they are now read once when the kit is made. One game-sized save (13 fields and 3 lists, like Apple Press), smaller is better, old to new: a small save (448 bytes) loads 1.40x as fast in Chromium (4.54 to 3.24 microseconds), 1.65x in Firefox (4.3 to 2.6), 1.72x in WebKitGTK (3.35 to 1.95) and 1.73x in GNOME Web (3.55 to 2.05); a medium save (about 2.5 KB) loads 1.07x, 1.54x, 1.20x and 1.17x as fast in the same four; saving a small one is 1.05 to 1.20x as fast; a large save (about 25 KB, far beyond a real game) is within 4% either way because its time is the real checking of 2,000 list entries, not the rules. The same stored text and the same loaded save came out of the old and new file in all four browsers and in Node, and 0 of 4,000 random saves differed. Size cost (terser 5.51.2 -c passes=2 -m): 12,475 to 12,725 bytes minified (+250, about 2%) and 5,296 to 5,409 gzipped (+113); the readable file goes from 26,506 to 27,186 bytes.

## 1.2.0 · API 1 · 2026-10-17

### Quick
Six new options (all off unless given) so a game with saves already in the wild can move to save-kit, including support for old save-code endings.

### Deep
Six new options, all off unless given, so a game with saves already in the wild can move to save-kit: codeCheck (write and read the 8-hex ending Fancy the Banana's old codes use, or the base-36 ending without padding Apple Press's use; the default ending is unchanged), backupKey (name of the backup slot), damagedKey (keeps main-slot text that could not be used), readBackupWithoutMain:false (an empty main slot never brings back a leftover backup), afterValidate(clean, raw) (the game's own checks after the schema, in load, importCode and onOtherTab; may change, replace or refuse the save), and stamp (name of the timestamp field instead of seen). New tool lean.py makes a smaller file without the parts a game does not use: with the parts Fancy the Banana needs the file is 6,341 bytes instead of 8,894 (29% smaller, minified with terser 5.36.0), with Apple Press's set 6,281 (29% smaller); the full file grew by 558 bytes for the new options (8,336 in 1.1.0, 8,894 now; smaller is better). Same behavior as 1.1.0 when no new option is given (all 35 old checks pass, plus 8 new ones).

## 1.1.0 · API 1 · 2026-10-17

### Quick
Two fixes: default values are now copied for each state, and a default for counts is used when the field is missing. Loading is about a third faster or more.

### Deep
Two fixes: a "raw" default is now copied for each state (before, editing the state edited the defaults, so a later reset gave back the edited data), and a "counts" default is now used when the field is missing (before it was ignored and started empty). load() reads the backup slot only when the main slot is missing or has a broken number: about 37% less time to load a 500-name save in Chromium (210 to 133 microseconds), 28% in Firefox (97 to 70) and 36% in WebKitGTK (323 to 207), and about 38% to 50% less for a 20-name save (medians of 5 runs, 3 in WebKitGTK). Exporting and importing a code ask the browser once whether compression exists instead of building two streams each time: in Chromium about 30% less per call (export 3.2 to 2.2 ms, import 1.2 to 0.7 ms for a 20-name save), no change in WebKitGTK. New: kit.onOtherTab(cb) tells a tab when another tab of the same site wrote or cleared the save (checked with a real second page in all three browsers) so an old tab can stop overwriting newer progress; kit.persist() asks the browser to keep the storage (Chromium answers false by itself, Firefox 158 asks the player and waits, WebKitGTK 2.52.6 has no persist and answers false); options version + migrate upgrade old saves and codes; skipUnchangedMs skips rewriting a save that did not change (40 unchanged saves make 1 storage write instead of 40, same in all three browsers; default off); compactCodes makes shorter codes (a 5-field save went from 116 to 48 characters, 59% shorter; a 20-name save about 9% shorter, a 500-name save about 1%; default off). The file grew from 9,292 to 11,245 bytes minified (4,036 to 4,771 gzipped). The module test also no longer fails about 1 run in 15 (it compared a code letter that depends on the clock). The API is unchanged and every new option is off unless you set it.

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
