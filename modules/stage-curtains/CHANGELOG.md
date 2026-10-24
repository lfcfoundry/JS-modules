# stage-curtains changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.4.0 · API 1 · 2026-10-24
- The curtain's velvet paints 60 to 70% faster in a browser with WebAssembly SIMD. The picture matches the plain-JavaScript one to within 5 of 255 on 99.99% of pixels; stepped curtains are unchanged.

## 1.3.1 · API 1 · 2026-10-24
- The curtain's velvet paints 27 to 34% faster (WebAssembly loop reads per-column tables). Same picture, byte for byte.

## 1.3.0 · API 1 · 2026-10-18
- New option create({ worker: true }) paints the curtain in a background worker: the page does 3 to 7 ms of work instead of 21 to 36 ms. Same picture.

## 1.2.0 · API 1 · 2026-10-18
- A curtain half paints about 1.4 to 1.6 times faster on a freshly loaded page (same picture) using a small WebAssembly painter. Pages with a content policy need 'wasm-unsafe-eval'; without it, plain JavaScript is used.

## 1.1.0 · API 1 · 2026-10-17
- On a very busy page the curtain now lifts about 3.6 to 5.7 times sooner. A quiet page is unchanged.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- Early October 2026: First version, cut from the games.
- 2026-10-15: `prepare()` now finishes in browsers that lack `requestIdleCallback`; before, it could wait forever.
- 2026-10-15: The finished curtain half is no longer cancelled, which made the curtain jump a hair on a phone.
- 2026-10-15: README: added prior art (View Transitions, Motion `curtains()`) and removed the link to the source game.
