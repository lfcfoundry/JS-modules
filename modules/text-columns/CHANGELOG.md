# text-columns changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 0.1.1 · API 0 · 2026-10-27
- toRows() keeps a column named __proto__ as its own data, and a header with a repeated name now throws instead of silently dropping a column. Same speed.

## 0.1.0 · API 0 · 2026-10-26
- First version: reads CSV and TSV into number and text columns with a WebAssembly SIMD scan, 3 to 11 times faster than common parsers.

## 0.1.0 · API 0 · 2026-10-27
- First version: reads CSV and TSV into Float64Array number columns and text columns with a WebAssembly SIMD scan (3 to 11 times faster than common parsers in the container), plain JavaScript fallback with the same answers.
