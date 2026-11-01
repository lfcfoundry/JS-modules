# netflow-hierarchy changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-11-01
- Names on treemap, icicle, sunburst and circle pack shapes now pick dark or white text per shape so they read at 4.5:1 contrast or better (2,432 of 19,056 names in our test pictures fell short before, 10 now, all where a name overlaps a smaller circle).

## 1.0.1 · API 1 · 2026-11-01
- Changing a look (theme, colors, names) on a big treemap, icicle, sunburst, pack or tree is 2.2 to 6.9 times faster; pictures are the same.

## 1.0.0 · API 1 · 2026-11-01
- First version: the nested views of Netflow Map (Treemap, Sunburst, Icicle, Circle pack, Tree) as an add-on for netflow-engine, plus the tree helpers netflow-circular builds on.
