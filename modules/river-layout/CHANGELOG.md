# river-layout changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-17
New module, cut from Net Flow Map's flow chart. It lays out a flow chart (Sankey diagram) and draws it as SVG, with no libraries. On three made-up charts of 64, 118 and 222 links it left 47%, 49% and 58% of the weighted crossings d3-sankey 0.12.3 left (2,147 against 4,608; 10,840 against 22,131; 35,454 against 61,492), taking 17 to 26 ms against 4 to 7 ms. A chart with a backward link makes d3-sankey throw "circular link"; here it is drawn under the picture. New compared with the Net Flow Map original, which took the app's own drawing format: `layoutFlows` takes a plain list of `{ from, to, value }` links, says how many it ignored, and tells you which of your links each band is; `toSvg` draws it (colors, labels and a title, with all text escaped). 12 checks, about 0.2 s.

Tested in: Node checks; the demo page in Firefox 158 and ungoogled Chromium 155, one at a time (`tests/flow-demos.js`, 2026-10-17). Not run: WebKitGTK, a phone.
