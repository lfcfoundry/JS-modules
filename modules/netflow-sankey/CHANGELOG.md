# netflow-sankey changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 2.3.0 · API 2 · 2026-10-18
- Small and medium flow charts lay out up to 1.9 times faster in Chromium and Firefox with WebAssembly, same pictures; the two WebKit browsers are about even. The wasm compiles in the background at load. Needs 'wasm-unsafe-eval'.

## 2.2.1 · API 2 · 2026-10-18
- Fix: an empty drawing now has height 0 instead of -Infinity. Drawings with items are unchanged.

## 2.2.0 · API 2 · 2026-10-18
- Very long links no longer blow up big charts: past a limit, the lightest long links are drawn as one straight band. The crossing count is now always a real number.

## 2.1.0 · API 2 · 2026-10-18
- Two new calls so a flow chart can be wired into Netflow Map's engine, one for settings and one for applying a result.

## 2.0.0 · API 2 · 2026-10-17
- Renamed to netflow-sankey (new folder, file and browser name), so a project using 1.x only has to change those three names.
- Faster, with the same pictures.

## 1.0.0 · API 1 · 2026-10-17
- New module: lays out a flow chart (Sankey diagram) and draws it as SVG, with no libraries. Backward links are drawn instead of causing an error, and it leaves far fewer crossings than d3-sankey.
