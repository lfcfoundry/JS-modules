# netflow-layers changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.7.1 · API 1 · 2026-10-31
- Starts a little faster: the built-in WebAssembly program is now turned back into bytes by the browser's own base64 decoder (Uint8Array.fromBase64) where there is one; older browsers use the old way. Nothing else changes.

## 1.7.0 · API 1 · 2026-10-31
- Fewer crossings by default (deep: false and rows: 'route' keep the old picture): 3 to 11% fewer than dagre and ELK on random maps; 1,000 items take 77 to 83 ms instead of 11 to 39.

## 1.6.0 · API 1 · 2026-10-31
- New options, all off by default: deep: true untangles links further, rows: 'best' tries both row choices, orderRounds: 0 skips the order search. Deep with 'best' cuts crossings 17 to 37%, below dagre and ELK.

## 1.5.1 · API 1 · 2026-10-27
- maxVertices: 0 is now a real cap (it used to fall back to 90000), and a bad value (NaN, negative, fractional, not a number) throws a clear error; Infinity still means no cap.

## 1.5.0 · API 1 · 2026-10-24
- The row-order search and row placement now run in WebAssembly (8 KB embedded, 'wasm-unsafe-eval' only), 18-48% faster at 100 to 5,000 pages in three browsers; same pictures to the last digit; plain JavaScript stays as the fallback.

## 1.4.0 · API 1 · 2026-10-22
- Same layouts, up to 77% less time (moderate 3000 boxes: 47 to 37 ms in Chromium). The lane option is now called once per stop and must give the same answer each time.

## 1.3.1 · API 1 · 2026-10-22
- Layouts are 1.2 to 2.1 times faster on maps of 2,000 to 20,000 pages in all four test browsers; the drawing is exactly the same. Inner work now runs on flat number lists instead of many small lists.

## 1.3.0 · API 1 · 2026-10-18
- New tight or wide option: wide draws a looser, more tree-like picture that reads better on wide screens. Tight stays the same as before.

## 1.2.0 · API 1 · 2026-10-17
- Advanced entry points for apps that run the layered engine themselves. Nothing changes for other users.

## 1.1.0 · API 1 · 2026-10-17
- New bundling option shares stand-in stops between links that start or end in the same place, which means fewer crossings and less clutter on big maps.

## 1.0.0 · API 1 · 2026-10-17
- New module, cut from Netflow Map's layered engine, which draws story maps top to bottom, left to right, and more. Extra options are all off by default.
