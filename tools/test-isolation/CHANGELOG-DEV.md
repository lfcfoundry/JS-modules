# test-isolation developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17

### Quick
Test storage now behaves like the real thing when read or written as a property, and looping over many keys is no longer slow.

### Deep
Property-style use now behaves like a real Storage: reading localStorage.save, writing localStorage.save = 'x', 'save' in localStorage, delete, Object.keys and JSON.stringify gave wrong answers in 7 of 7 checks before (a property write was silently lost) and are right in 7 of 7 now, in all three browsers. Looping over the test keys is no longer slow: 3,000 keys took 53.4 s in Firefox 158 (1.55 s in Chromium 155, 4.0 s in WebKitGTK 2.52.6) and now take 13 ms (0.6 ms, 3 ms); 1,000 keys took 2.05 s in Firefox and now take 2 ms. New option fresh: true removes keys an earlier run left behind; new option seed: true starts the test copy with the real save's values (the real keys are only read, never changed). Price: the file grows from 4.7 KB to 6.6 KB (3.2 KB to 4.2 KB minified) and the inline snippet from 641 to about 1,960 characters. Still not covered: instanceof Storage and Storage.prototype calls.

## 1.0.0 · API 1 · 2026-10-17

### Quick
New tool, cut from Apple Press's speed-test page: a test page can no longer read or overwrite the real saved game.

### Deep
New tool, cut from Apple Press's speed-test page. It puts a prefix in front of every localStorage (and, if asked, sessionStorage) key on a test page, so a speed test, a random-play run or any test build never reads or overwrites the real saved game; its own keys never mix with the real ones. 4.7 KB; `snippet()` gives the same thing as a 641-character inline script for the top of `<head>`. Real localStorage check in Firefox 158 and ungoogled Chromium 155: the real save stayed untouched while the page wrote its own, and `clear()` removed only the prefixed keys. 6 checks on a fake Storage. Found while testing: Firefox does not keep keys in the order they were written, so `key(i)` order must not be relied on (documented).
