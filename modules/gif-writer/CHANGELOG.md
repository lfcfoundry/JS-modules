# gif-writer changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
- Busy, photo-like animations now make their GIF about 1.3 to 3 times faster to prepare in the four test browsers, and the pictures are written faster too.

## 1.0.0 · API 1 · 2026-10-17
- New module: turns pictures drawn on a canvas into an animated GIF in the browser or in Node, with no libraries. Colors stay steady from picture to picture and only the changed part of each picture is written, so files stay small.
