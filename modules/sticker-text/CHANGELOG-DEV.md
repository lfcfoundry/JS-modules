# sticker-text developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17

### Quick
Lettering now wraps, keeps line breaks and keeps the fill on letters like g, p and y, with a smoother outline. Applying it is about 18 times faster, and a new watch call keeps text current by itself.

### Deep
Lettering now wraps and keeps line breaks, descenders (g, p, y) keep their fill, and the outline is one ring of 32 shadows instead of 48 (smoother by every measure: about 35% fewer missed edge pixels than before in Chromium and 36% in Firefox and WebKitGTK). apply() no longer writes about 1.9 KB of inline style per word (30 bytes now) and runs about 18 times faster (about 2.6 microseconds against 47 in Chromium). New: StickerText.watch(el) keeps the text current by itself; class st-flat drops the soft shadow (when 40 words change every frame, a frame takes about 40% less time than in 1.0.0 in Chromium and about 37% less in Firefox); class st-stroke draws the outline as one text stroke (about 7% less in Chromium, 65% less in Firefox; sharp corners in Chrome); both classes together: about 54% less in Chromium, 84% in Firefox and 87% in WebKitGTK. The two files grew from about 3.8 KB to about 4.8 KB minified (about 1.8 to 2.1 KB gzipped). Default look and API unchanged.

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
