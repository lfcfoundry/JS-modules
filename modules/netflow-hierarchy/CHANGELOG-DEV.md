# netflow-hierarchy developer changelog

## 1.7.2 · API 1 · 2026-11-20

### Quick
Children are sorted by a quicksort written out in the file instead of a call back per comparison. Same order, same layout. Old code keeps working.

### Details
sums(): lists of 3 or more children go through kidSort (quicksort over the typed child list, insertion for 12 or fewer). Every pair has one right order (bigger value first, ties by lower number), so the result is the same.

### Deep
Icicle from rows at 1,000 items in Chromium 156, both sorting: 0.24 ms against d3-hierarchy 3.1.3 at 0.28 (0.86); 1.7.1 on the same page was between 0.95 and 1.12. 10,000 and 100,000 items and the other two browsers unchanged within noise (Firefox 0.67/0.47/0.31, WebKitGTK 0.60/0.47/0.38 of d3). Also measured in this round, against d3-hierarchy 3.1.3 doing the same job (stratify, sum, sort, layout), share of d3's time at 1,000 / 10,000 / 100,000 items: treemap Chromium 0.74/0.59/0.41, Firefox 0.61/0.50/0.34, WebKitGTK 0.62/0.58/0.42; sunburst 0.74/0.94/0.72, 0.73/0.59/0.37, 0.80/0.67/0.49; pack 0.62/0.61/0.41, 0.53/0.46/0.44, 0.55/0.51/0.40; tree 0.76/0.62/0.44, 0.76/0.43/0.35, 0.82/0.71/0.48. Size: layout part minified 16.3 KB (7.4 KB gzip), whole module minified 31.5 KB (13.8 KB gzip), as shipped 66 KB (22.6 KB gzip); d3-hierarchy 3.1.3 minified 14.8 KB (5.8 KB gzip), layouts only.

## 1.7.1 · API 1 · 2026-11-20

### Quick
The tree behind every view is built in typed lists with about half the passes; child lists, names and groups are made only when read. Same layout and same SVG as 1.7.0. Old code keeps working.

### Details
hierarchy(): one working list instead of ten; child lists kept as kidOff/kidList (the plain kids, label, group and idx are made on first read); only the names links use go into the lookup table, and a link that ends at the next item in the list needs no lookup. sums() and the partition read typed lists. New fields on the tree: kidOff, kidList, at, F, cap, szOk, ownV. One edge case differs: when two items share a name (not valid input), a link may now end at the item in its place in the list instead of the last item of that name.

### Deep
Icicle layout from rows (building nodes and links, then layout), median ms, against d3-hierarchy 3.1.3 doing the same job (stratify, sum, sort, partition). Chromium 156: 1,000 items 0.26 vs d3 0.29; 10,000 2.53 vs 3.18; 100,000 43.6 vs 66.2. Firefox 158: 0.25 vs 0.38; 2.25 vs 4.50; 35 vs 99. WebKitGTK 2.52.6: 0.20 vs 0.28; 2.25 vs 3.50; 36 vs 84. Version 1.7.0 on the same race took 1.11/1.06/0.98 (Chromium), 1.10/1.04/0.83 (Firefox) and 1.17/1.33/1.06 (WebKitGTK) of d3's time. Without sorting on both sides it is ahead in Firefox and WebKitGTK at every size and in Chromium from 10,000 items; Chromium at 1,000 items without sorting is still behind d3 (0.24 vs 0.20 ms), open. Treemap, sunburst, pack and tree at 1,000 and 10,000 items: 0.6 to 0.9 of the time in all three browsers (tree at 1,000 in WebKitGTK even, within the 0.025 ms clock step). Same layout: 24,192 comparisons against 1.7.0 (every view, nest mode, sort on and off, item numbers and names, loops, start items, bad links); same SVG: 896 pictures.

## 1.7.0 · API 1 · 2026-11-15

### Quick
New option typedRects: true (treemap, icicle): the tiles are written to S.rectsT (typed arrays) instead of one object each in S.rects.

### Deep
New option typedRects: true (treemap, icicle): the tiles are written to S.rectsT (typed arrays) instead of one object each in S.rects. Same picture text; the object form stays the default. Needs netflow-scene 1.14.0; with an older scene the option is ignored.

## 1.6.1 · API 1 · 2026-11-14

### Quick
Treemap, icicle and sunburst no longer build one zero-size dot per item through the scene module: the scene gives the item colors in a list (dotFills) and the hierarchy reads them from there.

### Deep
Treemap, icicle and sunburst no longer build one zero-size dot per item through the scene module: the scene gives the item colors in a list (dotFills) and the hierarchy reads them from there. The first copy of the items uses object spread instead of a for-in loop (Chromium: 104-153 ms to 9 ms for 50,000 items). 50,000-item treemap scene (cold, first picture): Chromium 156 275.7 to 166.1 ms (0.548, 9 paired fresh pages, 9 of 9 faster), Firefox 158 164 to 147 ms (0.945, 7 pages), WebKitGTK 2.52.6 115 to 98 ms (0.852, 5 pages). Pictures pixel-identical in Chromium on 6 pictures; the SVG export is 16-33% smaller because the invisible r=0 circles are no longer written (nothing is drawn by them). 35,840 equality checks against 1.6.0 on scene fields, item records, dots, SVG text apart from the zero-size circles, and 25 hover answers per picture.

## 1.6.0 · API 1 · 2026-11-08

### Quick
New opt-in NetflowHierarchy.warm(): draws two small made-up pictures in an idle callback; the first real treemap/sunburst (250 items) then takes 0.50 (Chromium 156), 0.82 (Firefox 158) and 0.60 (WebKitGTK 2.52.6) of the time. Idle work 6-11 ms. Nothing changes unless you call it.

### Details
New API, opt-in, no change to existing calls. Returns true when it ran, false when NetflowScene is missing. 11 paired fresh pages per browser: 0.50 (11/11), 0.82 (7/11), 0.60 (10/11). Owner approved the card 'Add opt-in warm() to netflow-circular and netflow-hierarchy' ('Yes, add both').

### Deep
netflow-hierarchy 1.6.0: opt-in warm(). First treemap+sunburst of 250 items after an idle warm(): Chromium 156 0.50 (23.1 ms base, idle 11.3 ms), Firefox 158 0.82, WebKitGTK 2.52.6 0.60 (idle 9, 6 ms). 11 pairs. 953 checks pass.

## 1.5.1 · API 1 · 2026-11-07

### Quick
Amounts given as text now read thousands commas, a currency sign ($, pound, yen) and a percent sign, as netflow-plot already does. Before, '1,200' was not a number, so that link was lost or the column was not found. Plain numbers read as before.

### Details
asLinks: a new amount() reader (plot's num rule) for link values and for finding the amount column when none is named. netflow-circular draws through this, so chords get the fix with no change of their own. Approved by the owner on a card.

### Deep
Text amounts with commas read as numbers.

## 1.5.0 · API 1 · 2026-11-07

### Quick
toSvg/layout treemap: with width and height, the boxes are laid out at width-60 by height-60 so the SVG is exactly that size (was always about 960 x 660). Without them nothing changes. netflow-plot auto() and toSvg pass width and height through, so their treemaps now follow too.

### Details
treemap(): W and Ht come from o.width - 60 and o.height - 60 (at least 160 x 120) when both are given. Requested by the owner (card: lay out at that size).

### Deep
Treemaps honor width and height.

## 1.4.2 · API 1 · 2026-11-05

### Quick
Owner's card A (2026.11.05 10:30 PM ET): the violet treemap tile is drawn about 5% darker with white names (4.57:1) instead of pure black names.

### Deep
Owner's card A (2026.11.05 10:30 PM ET): the violet treemap tile is drawn about 5% darker with white names (4.57:1) instead of pure black names. The same rule covers every color, view and theme: a tile, ring piece or circle whose drawn color reads below 4.5:1 with both near-black and white names takes the smallest shade change that fixes it (darker for white names, or lighter for near-black; 2-5% in the 12-color list). New shipped check: no name falls back to pure black, and sunburst names are now read on their drawn ring pieces too.

## 1.4.1 · API 1 · 2026-11-05

### Quick
With families: true, treemap, icicle and pack group boxes take the same family colors as their items (NetflowScene.familyColors).

### Deep
With families: true, treemap, icicle and pack group boxes take the same family colors as their items (NetflowScene.familyColors). Nothing changes without it.

## 1.4.0 · API 1 · 2026-11-05

### Quick
Text color is now picked on the color the reader sees (each tile laid over its parent box, not over the page), so names read at 4.5:1 or better; the violet tile case from the re-score is fixed without changing any tile color.

### Deep
Text color is now picked on the color the reader sees (each tile laid over its parent box, not over the page), so names read at 4.5:1 or better; the violet tile case from the re-score is fixed without changing any tile color. Group boxes in a treemap keep an 18 px strip for their name, so the box name no longer sits on its first tile's name. Group boxes and rings take the same color as their items (both follow the scene's sorted group order). Circle names that cross into an inner circle pick the ink with the best worst-case contrast (3.65:1 or better in the test set). New shipped check computes the drawn blend for every color, both themes, treemap, icicle and pack.

## 1.3.1 · API 1 · 2026-11-05

### Quick
Bug: the picture bounds turned tilted names' angles (kept in degrees for the renderer) through Math.cos as if radians, so names on the left of chords and bundles ran past the frame.

### Deep
Bug: the picture bounds turned tilted names' angles (kept in degrees for the renderer) through Math.cos as if radians, so names on the left of chords and bundles ran past the frame. Bounds now use radians and the name's height. 8 long names, chord: names cut 5 of 8 -> 0 in Chromium 155, Firefox 158 and WebKitGTK 2.52.6; bundles 1 -> 0; radial tree 1 -> 0 (Chromium). Treemap, icicle, pack and tidy tree pictures byte-identical (16 of 16); sunburst frames move by up to about 10 px (bounds now right), shapes unchanged. Requested by the owner (queued chord left-label cutoff fix).

## 1.3.0 · API 1 · 2026-11-01

### Quick
toSvg(data, o) = layout(o.type || 'treemap', asGraph(data), { nest: 'auto', sized: true, ...o }) + scene + NetflowScene.toSvg, finding NetflowScene on the page (or next door in Node) with a plain error naming the missing script.

### Deep
toSvg(data, o) = layout(o.type || 'treemap', asGraph(data), { nest: 'auto', sized: true, ...o }) + scene + NetflowScene.toSvg, finding NetflowScene on the page (or next door in Node) with a plain error naming the missing script. asGraph(links) makes items from link ends, sizeV = what flows in minus what flows on (so parents hold only what stays). New helpers asGraph and sceneLib. One-call toSvg(data, options) (owner's 11:55 AM ET 11.01 name card; CONSISTENT-SYNTAX-PROPOSAL). Old forms keep working (told apart by shape). Checked in Chromium 155, Firefox 158, WebKitGTK 2.52.6 from page scripts: all six one-call pictures drawn. Requested by the owner.

## 1.2.1 · API 1 · 2026-11-01

### Quick
scene(): each item is copied in full only once per layout (for-in into a plain object); later look changes refresh only w and h instead of Object.assign over every field.

### Deep
scene(): each item is copied in full only once per layout (for-in into a plain object); later look changes refresh only w and h instead of Object.assign over every field. Items that come from a worker are dictionary-mode objects and Object.assign over them cost about 1 s per 100k in Chromium. Cloud, 60,000-item treemap with dictionary-mode items, median of 6 look changes, two alternating runs, one lib per page (lower is better): Chromium 155 1,538-1,602 ms to 327-523 ms (0.27x); Firefox 158 721-739 to 583-586 ms (0.79x); WebKitGTK 2.52.6 1,160-1,255 to 903-1,080 ms (0.82x). Pictures identical: 105 of 105 SVG hashes (7 views, 3 graphs, 5 look changes in a row on one layout). Behavior note: fields other than the size changed by hand on L.nodes after the first picture are not picked up until a new layout (owner's card choice 12:48 PM ET 11.01: ship it). Requested by the owner.

## 1.2.0 · API 1 · 2026-11-01

### Quick
scene(L, o, NS) calls NS.addTitles(S, o) after the chart note.

### Deep
scene(L, o, NS) calls NS.addTitles(S, o) after the chart note. netflow-circular gets it through the same scene.

## 1.1.0 · API 1 · 2026-11-01

### Quick
Owner's card (11:54 AM ET): labels choose dark or white per tile for 4.5:1.

### Deep
Owner's card (11:54 AM ET): labels choose dark or white per tile for 4.5:1. ink(fill, preferred): the fill laid over the background, WCAG contrast; the preferred color (theme text on treemap group boxes and pack circles) when it reaches 4.5:1, else near-black or white, whichever reads better, else pure black (reaches 4.58:1 on every color). Test pictures: 4 views x 4 palettes x 2 themes x 3 group counts, 300 items: 19,056 names on shapes, under 4.5:1 before 2,432, after 10 (pack circle names overlapping a child circle). Everything but label colors is unchanged in every picture; 925 checks; page scripts match Node in 3 browsers.

## 1.0.1 · API 1 · 2026-11-01

### Quick
The cause: each item was handed to netflow-scene as Object.create(item), so every copy had its own hidden class and every read of it was slow (2 to 3.4 times faster alone).

### Deep
The cause: each item was handed to netflow-scene as Object.create(item), so every copy had its own hidden class and every read of it was slow (2 to 3.4 times faster alone). Copies are now plain objects of one shape, kept on the layout and filled in again for the next picture. Also: item-to-dot lookup is an array, the id map is made only when a view asks, box fills are shared per base color, the tree line color is made once, and each tree link's map link is kept on the layout. Look change at 100,000 items, old/new ms (cloud, median of 3 page runs): Chromium treemap 723/157, icicle 695/139, sunburst 632/92, pack 1050/283, tree 1018/195; Firefox 673/245, 533/160, 533/149, 740/291, 707/243; WebKitGTK 571/227, 553/141, 576/175, 736/334, 628/240. 1,000 items: 0.19-0.26 of the old time. Same SVG bytes and scene lists on 3,080 pictures (7 views, 5 sizes, 11 looks, twice in a row).

## 1.0.0 · API 1 · 2026-11-01
- **Quick:** split from Netflow Map src/charts.js (main 35db3f4, build 2026.11.01.1003) by view type, on the owner's ask.
- **Details:** netflow-hierarchy keeps the tree, values, nested layouts and the drawing frame; scene(L, o, NS, ext) takes an extension that draws its own view types. netflow-circular holds chord, bundles, bsplineToBezier and the ribbon drawing and draws inside that frame. Characters above U+007F written as escapes. Layout, SVG, names and the note line identical to the app copy on 756 layouts and pictures (7 views, 9 map sizes up to 3,000 items, 6 option sets, 2 themes); the app's 925 checks pass on the two together.
