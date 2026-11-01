# netflow-layers developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.7.2 · API 1 · 2026-10-31

### Quick
Characters above U+00FF in the source are written as \uXXXX escapes (the same strings at run time), so the file is Latin-1 only.

### Deep
Characters above U+00FF in the source are written as \uXXXX escapes (the same strings at run time), so the file is Latin-1 only. Browsers store a script's text at 1 byte per character only when every character is at most U+00FF; research round 33 measured 9% less renderer memory for Netflow Map in Chromium once its whole file was Latin-1. Tests pass.

## 1.7.1 · API 1 · 2026-10-31

### Quick
Embedded base64 decode uses Uint8Array.fromBase64 when present, falling back to the atob loop (or Buffer in Node).

### Deep
Embedded base64 decode uses Uint8Array.fromBase64 when present, falling back to the atob loop (or Buffer in Node). Same bytes: 20 of 20 embedded programs compared in Chromium 155, Firefox 158 and WebKitGTK 2.52.6. Decode time of all embedded programs, fromBase64 / atob loop: Chromium 0.18, Firefox 0.11, WebKitGTK 0.08 (cloud). Tests pass on both paths (Node 22 has no fromBase64, so the new path ran under a Buffer shim).

## 1.7.0 · API 1 · 2026-10-31

### Quick
Owner picked 'Lighter search by default' (2026.10.31 9:52 PM ET).

### Deep
Owner picked 'Lighter search by default' (2026.10.31 9:52 PM ET). Left-out deep now runs a lighter deep search (DEEP.liteMax 12 rounds, liteStall 2) and left-out rows means rows: 'best'; deep: false + rows: 'route' give the old picture; orderRounds: 0 skips both. Row crossings (vs-libs random maps, root n0): 30 items 50 to 44, 100 367 to 273, 400 7,950 to 5,158 (dagre 5,374, ELK 5,313), 1,000 33,763 to 21,440 (dagre 23,965, ELK 22,602). Cloud browsers, best of 5, ms old to new: Chromium 155 0.8/1.0/4.3/17.0 to 1.8/3.1/31.1/80.0; Firefox 158 2/2/7/39 to 1/3/40/83; WebKitGTK 2.52.6 1/1/5/11 to 1/3/31/77. JS and wasm give identical places in all 3 browsers. Never more crossings than the old default on 36 test maps (30 fewer). Old tests pin the old default explicitly.

## 1.6.0 · API 1 · 2026-10-31

### Quick
Three new options, all off by default (deep, rows: 'best', orderRounds). With them off the picture and speed are unchanged. Old code needs no change.

### Details
deep: true: after the usual rounds, rounds with neighbor swaps right after each row's sweep plus a full swap pass (up to 50 passes a row), stopping after 4 rounds with no gain (at most 80); maps over 20,000 stops skip it; never more crossings. rows: 'best' lays out with both row choices and keeps the fewer crossings (a tie keeps the shortest route). orderRounds: N sets the usual rounds (0 keeps the first order). JS and wasm give the same picture to the last digit. Random acyclic maps (Netflow Map's bench data), row crossings, deep + best vs default: 400 items 7,950 to 5,103 (dagre 5,374, ELK 5,313), 1,000 items 33,763 to 21,166 (dagre 23,965, ELK 22,602), 1,500 items 33,117 to 27,353. Time 400 / 1,000 / 1,500 items: Chromium 155 8 / 14 / 23 ms to 51 / 119 / 160 ms; Firefox 158 9 / 21 / 70 to 52 / 121 / 183; WebKitGTK 2.52.6 8 / 16 / 34 to 46 / 122 / 189 (dagre about 0.8 s and 7.2 s). Sankey seeding with orderRounds: 0: same netflow-sankey picture, whole layout of 1,500 items 0.675 (Chromium), 0.82 (Firefox), 0.767 (WebKitGTK) of the time.

### Deep
Brief from the Netflow Map thread (2026.10.31): Flow view had about 1.5x the crossings of dagre and ELK. Prototype ideas moved into the module: neighbor swaps after each row's sweep was the big one; a full swap pass with 50 passes a row; stall stop 4, max 80; restarts from the best without a shake gave nothing. Median schedule variants (average first, median first, median always, none) tried on 5 more graphs: within 2% of each other, so the prototype's alternation stays. Starting deep from the initial order instead of the best of the usual rounds: no better on average. Default path A/B (options off, flow 1,000 items): Chromium 0.999 inconclusive (noisy), Firefox 0.906, WebKitGTK 1.000 inconclusive (noisy, two runs); same results everywhere. orderRounds: 0 + netflow-sankey: identical pictures at 12 to 1,500 items; Chromium 0.675 / 0.775 / 0.897 at 1,500 / 400 / 100 items, Firefox 0.82 / 0.866 / 0.667 (noisy), WebKitGTK 0.767 / 1.000 / 1.000. Deep search cost grows with stops; at 35,000 stops (3,000 items, shortest-route rows) it gave no gain, hence the 20,000 cap. Tests: deep never worse and JS = wasm on 24 maps x options, best = min of the two, cap keeps the old picture.

## 1.5.1 · API 1 · 2026-10-27

### Quick
maxVertices: 0 is now a real cap (it used to fall back to 90000), and a bad value (NaN, negative, fractional, not a number) throws a clear error; Infinity still means no cap.

## 1.5.0 · API 1 · 2026-10-24

### Quick
The row-order search and row placement now run in WebAssembly (8 KB embedded, 'wasm-unsafe-eval' only), 18-48% faster at 100 to 5,000 pages in three browsers; same pictures to the last digit; plain JavaScript stays as the fallback.

### Deep
netflow-layers 1.5.0 moves the three hot loops of layered() (crossBetween with its crossing count, sweep with the neighbor swaps, placeLayer) into WebAssembly (new wasm/order.c, built by wasm/build.sh, embedded by wasm/embed.py as 8,040 bytes, 10,720 base64 characters; the file grows from 33.9 to 50.5 KB: 10.7 KB of it is the embedded wasm, the rest the loader and the JavaScript glue; gzipped 10.9 to 17.9 KB). The plain JavaScript loops stay unchanged as the fallback, used when WebAssembly is missing, blocked by the page rule (a page needs only 'wasm-unsafe-eval' in script-src, nothing else loosened, no network), the map has under 100 stops (NetflowLayers.wasm.min), NetflowLayers.wasm.on is false, or a call fails (NetflowLayers.wasm.error says why). New export NetflowLayers.wasm = { on, min, calls, error }. The crossing count no longer sorts the links (links are already grouped by upper place), the same integer. Same rows, places, links and crossing count to the last digit: 56 pictures (8 maps x 7 option sets incl. lanes, wide, better, wrap, bundle, tags, story rows) compared with Object.is on every number with wasm on and off, 300 random maps in a scratch fuzz, and an 800-stop picture byte-identical in Chromium 155, Firefox 158 and WebKitGTK 2.52.6 with wasm allowed, blocked by the page rule and off; Node vm with code generation refused falls back to the same JSON. Speed, median of 3 passes x 40 turns, every candidate once per turn, a fresh browser per pass, ms per call, lower is better, wasm off vs wasm on in the same 1.5.0 file (Chromium / Firefox / WebKitGTK): layout 5,000 pages 37.7 to 26.9 (-29%) / 55 to 41 (-25%) / 53 to 43 (-19%); layout 1,000 pages 6.65 to 4.8 (-28%) / 10 to 8 (-20%) / 8.5 to 7 (-18%); netflow-engine build 600 pages flow 3.45 to 2.70 (-22%) / 4.5 to 3.67 (-19%) / 4.0 to 3.5 (-13%), arc 3.63 to 2.95 (-19%) / 5.0 to 4.0 (-20%) / 4.5 to 4.0 (-11%), matrix 3.9 to 3.2 (-18%) / 5.0 to 4.5 (-10%) / 4.5 to 4.0 (-11%). Against the 1.4.0 file from main the same cells are -34 / -26 / -19% (5,000 pages) and -18 to -30% (engine views); the harness shows up to 15% difference between two copies of the same code depending on the candidate's place in a turn (wasm-off 1.5.0 vs 1.4.0, and a same-file control of +13% in Chromium at 5,000 pages in 2 of 3 passes), so read the wasm-off vs wasm-on columns as the clean comparison. One pass of 40 turns at small sizes, main / wasm off / wasm on: 300 pages 4.45 / 4.52 / 2.34 (Chromium), 5.75 / 5.67 / 3.0 (Firefox), 5.0 / 4.8 / 3.14 (WebKitGTK); 100 pages 1.10 / 1.10 / 0.60, 1.30 / 1.30 / 0.70, 1.25 / 1.10 / 0.75. The engine shape view does not use the layered code and is unchanged within noise (1.2 / 1.2 ms Chromium, 1.5 / 1.38 Firefox, 1.5 / 1.5 WebKitGTK). Nothing measured slower than 5%. Cost: the first map of 100 stops or more compiles the module once on the main thread: first layout of a 40-stop map with min 0, wasm off vs on, median of 15 fresh loads, Chromium 0.6 to 0.7 ms, Firefox 5 to 4-5 ms (whole-ms clock, no visible cost), WebKitGTK 1 to 5 ms; maps under 100 stops stay on JavaScript and never pay it. Details in js-modules-research/netflow-layers-wasm/RESULT-three-browsers.md.

## 1.4.0 · API 1 · 2026-10-22

### Quick
Same layouts, up to 77% less time (moderate 3000 boxes: 47 to 37 ms in Chromium). The lane option is now called once per stop and must give the same answer each time.

### Deep
Placement and crossing counting read flat typed arrays; stand-in chains live in a side list rather than on your links. opts.lane is called once per stop, so it must be pure. Layouts byte-identical on 90 generated graphs. Median of 15 fresh-page turns (41 looped turns for WebKit small cases), ms, lower is better.

## 1.3.1 · API 1 · 2026-10-22

### Quick
Layouts are 1.2 to 2.1 times faster on maps of 2,000 to 20,000 pages in all four test browsers; the drawing is exactly the same. Inner work now runs on flat number lists instead of many small lists.

### Deep
Same drawing, less work. The crossing count, the row placement and the lists of neighbors that every step reads now run on flat number lists (typed arrays) instead of one small list per link and per row, which made the garbage collector the biggest cost (about 19 to 24 percent of the time in a profile of a 20,000-page map). The arithmetic is done in the same order, so every position, every crossing count and every SVG is exactly what 1.3.0 gave: whole result and SVG text identical in all four test browsers on 14 map-and-option combinations (300 to 20,000 pages: plain, story rows with tags and bundles, better and wide, columns, lanes), 600 random graphs in Node (self links, repeated links, loops, a missing start page, previous order, every option; errors match too), and 16 new pinned fingerprints in the module test. mapPlaceLine, mapCrossPairs and layered() keep their results; the two helpers are still exported and unchanged. Layout time, ms, lower is better, 1.3.0 / 1.3.1, versions in turns, best of 3 to 25 turns (WebKit and Firefox timers read whole milliseconds, so small sizes are rough): ungoogled Chromium 155.0.8059.39-1: 300 pages story rows 3.0 / 2.3, 2,000 pages 12.6 / 9.9, 2,000 pages better and wide 49.5 / 29.7, 8,000 pages 78.1 / 59.7, 20,000 pages 239.7 / 153.7, 20,000 pages in columns 469.3 / 324.5. Firefox 158.0: 3 / 2, 19 / 14, 59 / 32, 101 / 98, 357 / 293, 811 / 592. WebKitGTK 2.52.6: 4 / 2, 20 / 12, 56 / 28, 96 / 70, 250 / 156, 495 / 320. GNOME Web 46.5: 3 / 2, 18 / 12, 56 / 27, 84 / 56, 267 / 193, 633 / 307. Nothing is slower beyond noise (Firefox at 8,000 pages is level, 101 / 98). Where it does not help: the first steps that read the ids (rows, depth-first order) still use objects keyed by page name, about a third of the time on the biggest maps; they were left alone because the old behavior for repeated page names must stay exactly the same. File size: 29,807 to 33,611 bytes (+3,804). A profile with Node was used only to see where the time goes, not for any speed number (research: js-modules-research/netflow-layers/profile-2026-10-22/RESULT.md).

## 1.3.0 · API 1 · 2026-10-18

### Quick
New tight or wide option: wide draws a looser, more tree-like picture that reads better on wide screens. Tight stays the same as before.

### Deep
Tight or wide. New option `spread`: `"wide"` draws a looser, more tree-like picture for wide screens; `"tight"`, or nothing, is the same compact picture as before. Wide does three things: boxes beside each other get more room (2.4 times the gap top to bottom, 1.4 times left to right), rows sit further apart left to right (1.7 times; top to bottom they stay as they were), and a box that leads to several boxes sits over the middle of them instead of over their weighted average. On a 120-page story map the picture grows from 1,353 to 1,618 pixels wide top to bottom (1.2 times; height unchanged at 4,650) and from 9,480 x 558 to 11,832 x 626 left to right (1.25 times wide, 1.1 times tall). Nothing that was there changed: the 8 pinned fingerprints of the old pictures are the same with `spread: "tight"` or any other value, and the file grew by 939 bytes (28,868 to 29,807).

## 1.2.0 · API 1 · 2026-10-17

### Quick
Advanced entry points for apps that run the layered engine themselves. Nothing changes for other users.

### Deep
Advanced entry points for apps that run the layered engine themselves. The module now also exports layered (the engine layout() calls), mapPlaceLine and mapCrossPairs, so an app can use the module's copy instead of carrying its own. Nothing else changes: with every option off the picture is exactly the 1.1.0 one (Netflow Map drew 1,344 test builds, 7 views x 12 option sets x 16 maps, with 0 differences against its own copy). 16 checks (was 15). The file grows by 76 bytes (28,792 to 28,868, smaller is better); an app that carries only the engine pieces pays about 5.7 KB (0.76%) more than its own copy, because layout() and toSvg() ride along.

## 1.1.0 · API 1 · 2026-10-17

### Quick
New bundling option shares stand-in stops between links that start or end in the same place, which means fewer crossings and less clutter on big maps.

### Deep
Bundling and tapered links. New option bundle: links that start at the same page share one run of stand-in stops, and links that end at the same page and are alone at their start share one run from the end upward. On a 5,002-page story with shortest-route rows stand-in stops go 33,087 to 30,654 (7% fewer) and crossings 1,216 to 1,065 (12% fewer); on a loop-free random map of 1,000 pages stops go 531 to 326 (39% fewer); on the demo's big map stops go 1,456 to 1,356 (7% fewer); smaller is better in all of these. With tags on there is little left to bundle. toSvg option taper draws forward links as shapes that narrow from 5 px to 1 px, so direction shows without arrowheads (about 80 KB against 45 KB of SVG for a 120-page story, so plain strokes stay the default). With every option off the picture is exactly the 1.0.0 one (the same 8 pinned fingerprints); 15 checks (was 13).

## 1.0.0 · API 1 · 2026-10-17

### Quick
New module, cut from Netflow Map's layered engine, which draws story maps top to bottom, left to right, and more. Extra options are all off by default.

### Deep
New module, cut from Netflow Map's layered engine (the code that draws Flow, Top-down, Spine, Lanes, Arc and Matrix). With every option off it draws exactly what the app drew before (8 pinned pictures made by the app's own engine). New options, all off by default: story order (on a 5,002-page story the links drawn as back or sideways drop from 1,027 to 97, the real loops), tags for very long links (stand-in stops 33,087 to 11 and build time 392 to 60 ms on that story, 6.5 times faster; a 20,000-page story the plain drawing refuses draws in about 0.4 s), a column for the must-pass pages (width 5,816 to 1,913 px), six more untangling rounds (never worse; 27% fewer crossings on that story), tall maps cut into columns (38 times taller than wide down to 0.8), step positions for a ruler, one band per group, plus a plain SVG drawer. Input is never changed.
