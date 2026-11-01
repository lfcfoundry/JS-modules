# netflow-sankey developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 2.4.0 · API 2 · 2026-10-31

### Quick
Same pictures: faster layering scan (heap scans, same removal order), link ends without per-bar lists, bars and stand-in stops in flat typed arrays (only items keep an object).

### Deep
Same pictures: faster layering scan (heap scans, same removal order), link ends without per-bar lists, bars and stand-in stops in flat typed arrays (only items keep an object). Output identical to 2.3.3 on 669 maps (pins, fixedOrder, wasm off, justifySinks off, autoGap). Laptop (sankey-speed-check-2, ratio vs 2.3.3): Chromium 156 1,500 items 0.798, 1,000 0.919, 400 1.012; Firefox 160 0.797, 0.846, 0.869. Cloud 1,500 items vs the branch before the typed arrays: Chromium 17.3 to 14.5 ms, Firefox 22.5 to 14.9, WebKitGTK 17.2 to 14.5. stopCap/stopCapFrom: new options, off by default (owner picked 'Cap at 500 stops' for Netflow Map maps of 1,000+ items, 2026.10.31 ~9:08 PM ET). Node, 1,500 items: default 24.4 ms / 71,093 center-line crossings, stopCap 500 3.9 ms / 60,423, d3-sankey 18.9 ms / 99,058; 5,000 items: 93.6 / 1,133,257, stopCap 500 15.7 / 462,760, d3-sankey 89.6 / 935,756.

## 2.3.3 · API 2 · 2026-10-31

### Quick
The relaxation (14 rounds of pull and settle) runs in WebAssembly when it is there; same pictures to the last digit. Old code needs no change.

### Details
Whole layout of 1,500 items / 2,331 links (netflow-layers seeding included), new/old: Chromium 155 0.857, Firefox 158 0.958, WebKitGTK 2.52.6 0.970. Graphs under 64 bars keep the JavaScript. wasm: false turns it off with the order search.

### Deep
Brief from the Netflow Map thread: relaxation was 11 of about 26 ms per layout at 1,500 items. relax() in wasm/order.c, same arithmetic in the same order (-ffp-contract=off), alphas computed in JS and passed in. Lists placed at the start of free wasm memory once the order search is done. Same pictures at 30 to 1,500 items in three browsers; module tests compare wasm on and off. Early-stop A/B as above.

## 2.3.2 · API 2 · 2026-10-30

### Quick
Small graphs lay out about 15% faster with the same pictures.

### Deep
The neighbor-swap step of the order search keeps each pair's decision for the rest of the pass and skips layers that already settled with unchanged neighbors. Same pictures as 2.3.1 on 6,000 random layouts (wasm and JavaScript paths). Chromium container, medians of 9 ABBA rounds: 72 nodes 4.1-4.2 ms down to 3.4-3.5 ms; 200 and 500 nodes level. order.wasm 6,376 to 8,254 bytes.

## 2.3.1 · API 2 · 2026-10-30

### Quick
The order search skips repeating itself: same pictures, up to 2x faster when you ask for many restarts.

### Deep
The order search now remembers the orderings it has already followed and stops a restart as soon as it reaches one (in JavaScript and in the WebAssembly, wasm/order.c rebuilt, 6,376 bytes). The search from an ordering is always the same, so the finished picture is unchanged: 600 of 600 layouts (300 random graphs, WebAssembly and plain JavaScript, some with loops) are identical in every field to 2.3.0. Container timing, direction only: default 8 restarts about the same (506 ms against 509 ms over 80 graphs, 3 runs each); 40 restarts on a 50-bar graph 3.70 ms down to 1.86 ms. No new settings and no default change.

## 2.3.0 · API 2 · 2026-10-18

### Quick
Small and medium flow charts lay out up to 1.9 times faster in Chromium and Firefox with WebAssembly, same pictures; the two WebKit browsers are about even. The wasm compiles in the background at load. Needs 'wasm-unsafe-eval'.

### Deep
The order search (crossing counts, column sorts, swaps) now runs as WebAssembly (5,319 bytes, wasm/order.c); the restarts and random numbers stay JavaScript. 48 test layouts identical to the last digit with and without the CSP word in every one of 12 browser runs (4 browsers x 3 passes). Median of 3 passes, JavaScript to WebAssembly in ms (lower is better): small 70 bars Chromium 3.0 to 1.9, Firefox 3.2 to 1.7, WebKitGTK 2.1 to 1.7, GNOME Web 2.2 to 1.9; medium 240 bars 19.3 to 11.7, 23.1 to 14.0, 14.8 to 14.2, 14.5 to 13.8; dense 320 bars 7.6 to 6.5, 7.3 to 7.0, 6.0 to 6.1, 5.9 to 5.8; large 640 bars 5.9 to 5.1, 6.4 to 6.1, 4.8 to 4.9, 4.9 to 5.0; big 1000 bars 7.2 to 6.5, 8.9 to 8.3, 6.3 to 6.3, 6.3 to 6.4 (the WebKit columns are 3 passes of 9 rounds; a first 5-round run had shown WebKitGTK medium 0.91x and GNOME Web dense 0.90x, which did not repeat). Compile early (the owner's decision of 2026-10-19 replacing storing compiled wasm): the wasm compiles in the background when the file loads; wasmReady() and wasmModule() are new. First layout on a fresh page, median of 11, JavaScript to WebAssembly: right after load Chromium 40.4 to 30.7, Firefox 34 to 22, WebKitGTK 31 to 29, GNOME Web 33 to 37 (0.89x, about 4 ms slower, the only cell over the 5% guard); 250 ms after load 43.4 to 29.4, 36 to 22, 26 to 26, 34 to 34. Flows that are negative, not numbers or above 1e100 use the JavaScript code. Adds wasmAvailable(), wasmReady(), wasmModule() and opts.wasm=false. Size: +11,578 bytes as written (37,790 to 49,368), +9,493 minified, +4,301 gzipped.

## 2.2.1 · API 2 · 2026-10-18

### Quick
Fix: an empty drawing now has height 0 instead of -Infinity. Drawings with items are unchanged.

### Deep
Fix: laying out a drawing with nothing in it gave a picture height of `-Infinity` (it is 0 now), which Netflow Map's own copy never did; found when Netflow Map moved onto this file and its empty-chart check failed (height -Infinity instead of 0). Nothing else changes: the 23 earlier checks give the same results, and charts with at least one item are untouched (the line only differs when there is nothing to draw).

## 2.2.0 · API 2 · 2026-10-18

### Quick
Very long links no longer blow up big charts: past a limit, the lightest long links are drawn as one straight band. The crossing count is now always a real number.

### Deep
Very long links no longer blow up big charts. A long link needs one stand-in point in every column it crosses; past 20,000 stand-ins in all, the lightest long links are now drawn as one straight band from end to end instead (every link is still drawn, and `result.note` says how many, in `result.simplified`). Netflow Map's own copy always did this; this file now matches it. A 400-item chain with a link from the first item to every other: 80,198 bands become 20,697 (lower is better) and the build takes about 44 to 126 ms against 126 to 375 ms before (lower is better; ungoogled Chromium 155, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5, taking turns old/new, median of 5, timings are noisy: Chromium gave 188 to 276 against 52 to 106 in two runs); a 1,100-item random network goes from 40,347 to 22,694 bands and from about 90 to 179 ms to about 55 to 84 ms. Charts that stay under the cap are unchanged: the Node pictures hashed by version 1.0.0 still match, and 33 layouts gave exactly the same pictures as Netflow Map's own engine.
The order search now counts only links between neighboring columns. A link drawn straight through reaches a bar further away; counted as if it were next door it made the crossing count read past the end of its table (`NaN` in Netflow Map's copy), and the first call differed from the second in one page. Fixed the same way in Netflow Map (its PR 26): on the 1,100-item network the crossing count is 433.0 (it was `NaN`), the same twice in a row. Without straight-through links nothing runs differently, so charts under the cap are not slower.
New in the result: `simplified` (how many long links were drawn straight through, 0 when none) and `note` (a sentence for the picture, empty when none). Nothing else was removed or renamed, so this is a minor release and the API number stays 2. The 2.0.0 "same pictures" hashes in the checks leave these two new fields out, since they are not part of the picture.

## 2.1.0 · API 2 · 2026-10-18

### Quick
Two new calls so a flow chart can be wired into Netflow Map's engine, one for settings and one for applying a result.

### Deep
Two calls added so a flow chart can be wired into Netflow Map's engine (netflow-engine 1.0.0), which hands its drawing to a Sankey add-on in three steps and found only one of them here. New: `options(sk)` turns a person's settings (bar width, space between columns, space between bars, picture height, pinned bars, a saved order, sinks at the right edge) into the options `layout()` reads, keeping each value inside its limits; `apply(L, r)` writes a `layout()` result into the engine's drawing (bar positions and size, the picture's width and height, and the bands, loops, order and crossing weight under `L.sk`). Nothing that was there changed: the 15 earlier checks give the same results, every picture and every export is the same, and the file grew by 1.5 KB (34,081 to 35,650 bytes).

Known difference, not changed here: Netflow Map's own copy draws the lightest very long links straight through once a map needs more than 20,000 stand-in points (a map of about 1,100 items with many long links), and says so in `result.note`; this file still routes every long link, so on such maps the two pictures differ. See the brief for why this copy does not take that cap yet.

## 2.0.0 · API 2 · 2026-10-17

### Quick
Renamed to netflow-sankey (new folder, file and browser name), so a project using 1.x only has to change those three names. Faster, with the same pictures.

### Deep
Renamed (the module is part of Netflow Map's family now; its earlier name is retired): the folder, the file (netflow-sankey.js) and the browser global (NetflowSankey) changed, nothing else was removed, so a project using 1.x only has to change those three names. That is why this is 2.0.0 · API 2. Faster, same pictures: for the same links every bar, band, loop and the SVG text equal what 1.0.0 drew (450 random charts with 40,001 bars and 140,445 bands compared in full, the hand-edit path included, plus 120 hand-made drawings, 7 test charts under 3 option sets and 4 pinned tests). Charts of 66, 102 and 194 links: 7.7, 13.1 and 16.5 ms to 2.0, 3.2 and 4.4 ms in Node (3.7 to 4.1 times faster). A chart of 12,600 links, layout: 666 to 168 ms in ungoogled Chromium 155 (4.0 times), 608 to 105 in Firefox 158 (5.8 times), 558 to 94 in WebKitGTK 2.52.6 (5.9 times), 547 to 91 in GNOME Web 46.5 (6.0 times); drawing it with toSvg: 237 to 100 ms in Chromium (2.4 times), 171 to 78 in Firefox (2.2 times), 165 to 40 in WebKitGTK (4.1 times), 161 to 49 in GNOME Web (3.3 times). Over seven test charts (60 to 31,500 links) layout is 2.8 to 9.2 times faster and toSvg 1.6 to 5.7 times faster in all four browsers. A chart with 400 backward links gains most: 1,046 to 229 ms in Chromium (4.6 times) and 963 to 105 ms in GNOME Web (9.2 times). Fixed: an item named like "d1" (a letter d and a layer number) that also had a link running across that layer drew one of its bands from the wrong spot on its bar, overlapping the others; that is the only picture that changes. Bigger: the file grows from 26,952 to 34,081 bytes (8.9 to 11.6 KB gzipped). 15 checks, 3 more than the 12 before.

## 1.0.0 · API 1 · 2026-10-17

### Quick
New module: lays out a flow chart (Sankey diagram) and draws it as SVG, with no libraries. Backward links are drawn instead of causing an error, and it leaves far fewer crossings than d3-sankey.

### Deep
New module, cut from Netflow Map's flow chart. It lays out a flow chart (Sankey diagram) and draws it as SVG, with no libraries. On three made-up charts of 64, 118 and 222 links it left 47%, 49% and 58% of the weighted crossings d3-sankey 0.12.3 left (2,147 against 4,608; 10,840 against 22,131; 35,454 against 61,492), taking 17 to 26 ms against 4 to 7 ms. A chart with a backward link makes d3-sankey throw "circular link"; here it is drawn under the picture. New compared with the Netflow Map original, which took the app's own drawing format: `layoutFlows` takes a plain list of `{ from, to, value }` links, says how many it ignored, and tells you which of your links each band is; `toSvg` draws it (colors, labels and a title, with all text escaped). 12 checks, about 0.2 s.
