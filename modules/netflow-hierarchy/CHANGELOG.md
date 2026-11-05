# netflow-hierarchy changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.3.0 · API 1 · 2026-11-01
- One call draws a picture: NetflowHierarchy.toSvg(links, { type: 'sunburst' }); each box is as big as what flows into it.

## 1.2.1 · API 1 · 2026-11-01
- Look changes on big treemaps, sunbursts and other chart views are faster, most of all in Chromium.

## 1.2.0 · API 1 · 2026-11-01
- Treemaps, sunbursts, icicles, packs and trees take an optional title, subtitle and source in the scene options.

## 1.1.0 · API 1 · 2026-11-01
- Names on treemap, icicle, sunburst and circle pack shapes pick dark or white text per shape to read at 4.5:1 contrast or better (in test pictures, 2,432 of 19,056 names fell short before, 10 now).

## 1.0.1 · API 1 · 2026-11-01
- Changing a look (theme, colors, names) on a big treemap, icicle, sunburst, pack or tree is 2.2 to 6.9 times faster; pictures are the same.

## 1.0.0 · API 1 · 2026-11-01
- First version: the nested views of Netflow Map (Treemap, Sunburst, Icicle, Circle pack, Tree) as an add-on for netflow-engine, plus the tree helpers netflow-circular builds on.
