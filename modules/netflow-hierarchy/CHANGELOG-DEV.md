# netflow-hierarchy developer changelog

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
