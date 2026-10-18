# sticker-text changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
- Lettering now wraps, keeps line breaks and keeps the fill on letters like g, p and y, with a smoother outline.
- Applying it is about 18 times faster, and a new watch call keeps text current by itself.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- Early October 2026: First version: die-cut sticker lettering in plain CSS text-shadow rings.
- 2026-10-15: Text changed after `apply()` is now handled by `update(el)` (documented); the ring color follows the `--st-outline` CSS variable.
