# test-runner changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-18
- The picture gate now passes a picture that is 99.5% identical or better and prints the exact percentage; exact matches still count as same.

## 1.0.0 · API 1 · 2026-10-18
- Shared pieces for browser checks: warm browsers that cut the start of each check from seconds to well under a second, fair timing, skipped rebuilds, a wasm-versus-JavaScript twin test, a picture gate and an automatic bisect.
