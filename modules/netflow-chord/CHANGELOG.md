# netflow-chord changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-11-21
- New module: the chord layout of Netflow Map as one small file with nothing to load first, 1.6 KB gzipped; it takes 0.46 to 0.68 of d3-chord's time in Chromium, Firefox and WebKitGTK.
