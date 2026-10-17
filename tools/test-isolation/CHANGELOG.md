# test-isolation changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-17
New tool, cut from Apple Press's speed-test page. It puts a prefix in front of every localStorage (and, if asked, sessionStorage) key on a test page, so a speed test, a random-play run or any test build never reads or overwrites the real saved game; its own keys never mix with the real ones. 4.7 KB; `snippet()` gives the same thing as a 641-character inline script for the top of `<head>`. Real localStorage check in Firefox 158 and ungoogled Chromium 155: the real save stayed untouched while the page wrote its own, and `clear()` removed only the prefixed keys. 6 checks on a fake Storage. Found while testing: Firefox does not keep keys in the order they were written, so `key(i)` order must not be relied on (documented).
