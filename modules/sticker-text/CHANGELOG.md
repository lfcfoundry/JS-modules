# sticker-text changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
Lettering now wraps and keeps line breaks, descenders (g, p, y) keep their fill, and the outline is one ring of 32 shadows instead of 48 (smoother by every measure: about 35% fewer missed edge pixels than before in Chromium and 36% in Firefox and WebKitGTK). apply() no longer writes about 1.9 KB of inline style per word (30 bytes now) and runs about 18 times faster (about 2.6 microseconds against 47 in Chromium). New: StickerText.watch(el) keeps the text current by itself; class st-flat drops the soft shadow (when 40 words change every frame, a frame takes about 40% less time than in 1.0.0 in Chromium and about 37% less in Firefox); class st-stroke draws the outline as one text stroke (about 7% less in Chromium, 65% less in Firefox; sharp corners in Chrome); both classes together: about 54% less in Chromium, 84% in Firefox and 87% in WebKitGTK. The two files grew from about 3.8 KB to about 4.8 KB minified (about 1.8 to 2.1 KB gzipped). Default look and API unchanged.

Tested in: ungoogled Chromium 155.0.8059.39, Firefox 158.0 and WebKitGTK 2.52.6 (one at a time): the 17 Node checks, the demo page loading without errors, and the measurements above. Not tested: a real screen reader, Windows high contrast, Safari itself.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Node checks; Chromium 141 (headless, Linux) in the 2026-10-15 full run of `npm run test:kits` and `tests/run.js`; its demo page loads without errors in Firefox (`tests/firefox.js`: Firefox 158 per the 2026-10-15 task-board note, Firefox 157 on 2026-10-17). Not run: WebKitGTK, a phone.

## Before version labels

- Early October 2026: First version: die-cut sticker lettering in plain CSS text-shadow rings.
- 2026-10-15: Text changed after `apply()` is now handled by `update(el)` (documented); the ring color follows the `--st-outline` CSS variable.
