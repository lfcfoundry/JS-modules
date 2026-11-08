# netflow-hierarchy developer changelog

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
