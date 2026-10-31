# netflow-scene developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.3.1 · API 1 · 2026-10-26

### Quick
Big maps with plain links build their link looks once per group pair and width, a little faster in the first picture; the picture is the same.

### Deep
Firefox profile follow-up (link loop 58 vs 34 ms). Container unguarded, 30,000 items: plain links Firefox 105 to 94 ms, WebKitGTK 86 to 73, Chromium 77 to 62 to 79 (noise); other cases within noise.

## 1.3.0 · API 1 · 2026-10-25

### Quick
New optional file netflow-scene-index.js: on maps of 100,000+ items, box selects and picks read a sorted Z-order index (Elias-Fano): small boxes about 150x faster, picks 3 to 4x. Nothing changes under 100,000 items.

### Deep
Added netflow-scene-index.js (Morton codes of item centers, 3-pass radix sort, kept as Elias-Fano) and the o.spatial option: make() builds the index instead of the grid when it applies; pick and inRect use it (inRect declines boxes over 10% of the area and the scan answers). refreshGrid rebuilds either after moves. Design from the Netflow Map thread's brief 2026.10.26; the radix sort replaced a float sort and cut the build to about the grid's cost (Firefox +20 ms, Chromium and WebKitGTK faster). 1,000,000 items, Firefox/Chromium/WebKitGTK: 3000 picks 76/51/49 -> 18/16/19 ms; 20 small boxes 398/596/391 -> 2/3/3 ms; big boxes fall back to the scan (588/621/603 vs 562/648/604). Answers equal the scan and grid in test/index.js. Memory 1.8 MB codes + 4 MB order vs ~1.25 M grid entries.

## 1.2.0 · API 1 · 2026-10-25

### Quick
Optional look-settings file: one small object says how a map is colored and set in type.

### Deep
Shipped in JS-modules PR 179.
New optional file netflow-scene-look.js (global NetflowSceneLook), cut from Netflow Map: a look object sets background and other color slots, the 12 group colors, a color ramp, the font and the node size; clean() makes any outside object safe, register() puts it into this module's theme, palette and ramp tables under a name made from a hash of the look (no change to netflow-scene.js needed), 12 presets, and warnings when text contrast is under 4.5 or link contrast under 2. netflow-scene.js itself is unchanged.

## 1.1.1 · API 1 · 2026-10-24

### Quick
Rebuilding a big map after a move keeps arrowhead work out of the per-link path, to remove a small slowdown Netflow Map saw in one browser; the picture is the same.

### Deep
netflow-scene 1.1.1: in the flat link writer, the flag word is written as in 1.0.0 (no per-link arrow test inside the long expression) and the rare arrowhead is recorded by a small separate function (flatArrow) only when a link has an arrow; output unchanged (Node: 4,385 and 4,607 links equal the object build, 754 arrowheads packed; page check passes in Firefox 158.0, Chromium 155.0.8059.39-1, WebKitGTK 2.52.6). Why: Netflow Map measured a rebuild of 30,000 items 8 to 12% slower in WebKitGTK with 1.1.0 (old/new 0.88 to 0.92, controls 1.00 to 1.01) and asked for this change. Measured here in WebKitGTK 2.52.6, old 1.0.0 against 1.1.1 alternating in one page, 21 turns, rebuild with look plan on a plain 93,211 link map, lower is better: 1.07, 1.06 and 0.93 times (127 to 119, 138 to 130, 124 to 134 ms), plain map without plan 0.94, 1.10, 0.96; the same bench on 1.1.0 gave 0.81, 0.99 and 1.07. A separate fresh-page bench was too noisy to use: even 1.0.0 against itself read 0.87 in WebKitGTK (14 fresh pages each). So a steady 8 to 12% slowdown could not be reproduced or proven gone here; Netflow Map's own page bench (bench/rebuild-ab.js) is the judge and should be run on 1.1.1 before it adopts.

Shipped in JS-modules PR 169.

## 1.1.0 · API 1 · 2026-10-24

### Quick
Big maps now also keep link rules, dashes, arrowheads and bent links in fast lists, so rebuilding such a map after a move is faster; the picture is the same.

### Deep
netflow-scene 1.1.0 (brief from Netflow Map, applied on 1.0.0): a flat map of 2,000 or more links is also built straight into the packed typed lists when it has link rules (linkStyle), dashes, arrowheads or bent (curve) links; the lists gain a TIP list (flag bit 32) for arrowhead tips; plainLink accepts a 2-number tip; makeOne and eachCurveView restore and provide tip; an internal option flat:false forces the object build (the tests use it). curvesStraight() stays false for any dash, arrow or bend, so WebGL tessellation of such maps still wakes the objects as before (reading them from the lists in tessellate is the next stage). Links equal the object build to 32-bit precision: Node tests 4,385 links (rules) and 4,607 links (bends, and both) equal, 754 arrowheads packed; the same equality passes as a page check in Firefox 158.0, ungoogled Chromium 155.0.8059.39-1 and WebKitGTK 2.52.6. Speed, make() of a 30,000 item network (88,741 links with rules and arrowheads; 93,211 bent), old 1.0.0 against 1.1.0 taking turns, median of 7, lower is better: Chromium 155 rules+arrows 139 to 121 ms (1.15 times faster; a second run of 11 turns 191 to 164 and 136 to 125), bent 103 to 98 (1.05); Firefox 158 rules+arrows 345 to 304 (1.13), bent 245 to 202 (1.21); WebKitGTK 2.52.6 rules+arrows 216 to 201 (1.07), bent 190 to 186 (1.02). Control, a plain map that takes the unchanged path: 0.96 to 1.09 in Chromium across three runs, 1.02 Firefox, 1.04 WebKitGTK, so differences under about 10% are noise here. Nothing is more than 5% slower beyond that noise. Pictures were not compared here (the link lists are equal, a stronger check); Netflow Map checks pictures when it adopts this version.

Shipped in JS-modules PR 168 (replaces PR 167).

## 1.0.0 · API 1 · 2026-10-24

### Quick
New module: turns a laid-out Netflow Map into plain drawing lists for Canvas, WebGL or SVG, with fast rebuilds of big maps after a move.

### Deep
New module netflow-scene 1.0.0: the whole Netflow Map scene builder (src/scene.js at netflow-map 06d88de, 114 KB, all scenes) as a single file with no dependencies, wrapped as a browser global (NetflowScene) and CommonJS. Code is unchanged except the UMD wrapper and a number-format lookup that uses netflow-engine's formatter when NFMColumns is absent. Includes Netflow Map's look cache (PR 55 there: 1.11 to 1.24 times faster rebuilds at 30,000 items in three browsers, identical pictures) and flat link lists (PR 57 there: 1.19 to 1.41 times faster at 30,000 items, identical pictures); those timings were measured in Netflow Map, not re-timed here. Public link accessors: curveCount, curvesPacked, curvesStraight, eachCurveView, curveView, curveAt, curveFlat, packNow, autoPack. Checks: Node run.js 3 pass (look plan 3,661 looks once then 0; 4,607 flat links equal a styled build; accessors read without waking the list); equal output to Netflow Map's own scene.js on 12 scenes (6 views x light and dark) in Node; browser page check in Firefox 158.0, Chromium 155, WebKitGTK 2.52.6 passes (4,607 links equal, 4,607 looks then 0). Demo opened in Chromium 155.

Shipped in JS-modules PR 164.
