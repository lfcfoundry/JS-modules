# image-decode changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-22
- New module: loads PNG, JPEG, WebP and AVIF pictures without freezing the page at the first draw (a 2048 sheet froze it 44 to 94 ms, now 2 to 9 ms), using the right way for each browser.
