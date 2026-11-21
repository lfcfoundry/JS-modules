# netflow-hierarchy changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.8.2 · API 1 · 2026-11-21
- Circle pack is faster, most of all on trees where items have two children; same picture.

## 1.8.1 · API 1 · 2026-11-21
- Treemap pictures are built about 10% faster in Firefox and WebKit; same picture.

## 1.8.0 · API 1 · 2026-11-20
- New netflow-hierarchy.min.js: the same module minified, 14.1 KB gzipped instead of 22.6; same pictures.

## 1.7.2 · API 1 · 2026-11-20
- Sorting each item's children is faster on small charts; same picture.

## 1.7.1 · API 1 · 2026-11-20
- Every nested view is laid out faster, icicle most: 100,000 items take 0.66 (Chromium 156), 0.35 (Firefox 158) and 0.43 (WebKitGTK 2.52.6) of d3-hierarchy 3.1.3's time. Same picture.

## 1.7.0 · API 1 · 2026-11-15
- typedRects: true keeps treemap and icicle tiles as typed arrays

## 1.6.1 · API 1 · 2026-11-14
- Treemap, icicle and sunburst scenes are built without 50,000 invisible dots: the 50,000-item scene takes 0.55 (Chromium), 0.95 (Firefox) and 0.85 (WebKitGTK) of the time; same picture, smaller SVG.

## 1.6.0 · API 1 · 2026-11-08
- New optional NetflowHierarchy.warm() makes the first treemap or sunburst draw much sooner.

## 1.5.1 · API 1 · 2026-11-07
- Chord and treemap amounts written as '1,200' are read as 1,200.

## 1.5.0 · API 1 · 2026-11-07
- A treemap is laid out at the width and height you pass.

## 1.4.2 · API 1 · 2026-11-05
- Tiles that neither dark nor white names read on get a shade darker (white names) or lighter, the smallest change that reaches 4.5:1.

## 1.4.1 · API 1 · 2026-11-05
- Group boxes follow the scene's opt-in families colors.

## 1.4.0 · API 1 · 2026-11-05
- Names on treemaps and circle packs read on the colors actually drawn; group boxes get a name strip and their items' color.

## 1.3.1 · API 1 · 2026-11-05
- Chord, bundle and radial tree names on the left side are no longer cut off at the picture edge.

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
