**Measured on real trees: cloud Chromium 156.0.8078.79, Firefox 158.0 and WebKitGTK 2.52.6 against d3-hierarchy 3.1.3, one browser at a time, 2026.11.22.** The trees are real: the SEC 2026 Q1 numbers file (filing, then statement tag, then each value row) and the retail e-commerce file (country, then item, then each order line), cut to the first 1,000, 10,000 and 100,000 rows, sizes from the real value and quantity columns. Same job both ways: build the tree from rows, sum, sort, lay out (the method of `testers/hierarchy-icicle-vs-d3-tester.html`, 7 alternating rounds, 3 at 100,000 items). Whole milliseconds are all Firefox and WebKitGTK report, so small cells carry a rounding of up to 1 ms. This replaces the earlier generated trees.

Compared: netflow-hierarchy against d3-hierarchy on real trees (layout of 100,000 rows, percent of d3-hierarchy's time, lower is faster; Chromium / Firefox / WebKitGTK).

<!-- title: netflow-hierarchy lays out 100,000 real rows in 21% to 80% of d3-hierarchy's time in all five views and all three browsers -->
| real tree | view | Chromium | Firefox | WebKitGTK |
|---|---|---:|---:|---:|
| SEC filing > tag > row | Icicle | 52 | 35 | 58 |
|  | Treemap | 36 | 26 | 52 |
|  | Sunburst | 37 | 31 | 28 |
|  | Pack | 43 | 36 | 33 |
|  | Tree | 80 | 24 | 62 |
| Retail country > item > line | Icicle | 25 | 27 | 21 |
|  | Treemap | 40 | 32 | 27 |
|  | Sunburst | 26 | 21 | 23 |
|  | Pack | 40 | 35 | 37 |
|  | Tree | 51 | 22 | 38 |

Across all 108 cells (2 real trees x 3 sizes x 6 layouts x 3 browsers) netflow-hierarchy is faster in 106, at 21% to 125% of d3's time; the two cells that are not faster are small (WebKitGTK tree at 1,000 SEC rows 1.25, Firefox unsorted icicle at 1,000 retail rows 1.13, within the clock steps). Harness and raw results: `tools/real-corpus`.

**Against d3-hierarchy 3.1.3 on generated trees (earlier measurement, not re-run on real trees here).** The same job from the same rows: build the tree, sum, sort the children and lay out 100,000 items into positioned boxes, all five views. A fresh page for every library, one browser at a time, shared 4-core cloud machine. Time is shown as a percent of d3-hierarchy's time, so d3-hierarchy is always 100 and lower is faster.

Compared: netflow-hierarchy against d3-hierarchy 3.1.3 (layout of 100,000 items, percent of d3-hierarchy's time, lower is faster).

<!-- title: netflow-hierarchy lays out 100,000 items in 31 to 72% of d3-hierarchy's time in all five views and all three browsers -->
| view | way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---|---:|---:|---:|
| Icicle | d3-hierarchy | 100 | 100 | 100 |
|  | netflow-hierarchy | 57 | 31 | 38 |
| Treemap | d3-hierarchy | 100 | 100 | 100 |
|  | netflow-hierarchy | 41 | 34 | 42 |
| Sunburst | d3-hierarchy | 100 | 100 | 100 |
|  | netflow-hierarchy | 72 | 37 | 49 |
| Circle pack | d3-hierarchy | 100 | 100 | 100 |
|  | netflow-hierarchy | 50 | 33 | 32 |
| Tree | d3-hierarchy | 100 | 100 | 100 |
|  | netflow-hierarchy | 44 | 35 | 48 |

The lead is smaller on smaller charts. At 10,000 items netflow-hierarchy takes 43 to 94% of d3-hierarchy's time, and at 1,000 items 53 to 86%; in no view and no browser is it behind. Circle pack was measured again at version 1.8.2 on a mixed tree. On a tree with two children per item, a shape where earlier versions were slower than d3-hierarchy, circle pack now takes 0.60 to 0.70, 0.55 and 0.55 of d3-hierarchy's time at 1,000, 10,000 and 100,000 items in Chromium, 0.95, 0.67 and 0.66 in Firefox, and 0.71, 0.56 and 0.53 in WebKitGTK. Cloud test browsers only; laptop numbers are still to come.

Compared: netflow-hierarchy against d3-hierarchy 3.1.3 on an Android phone (Chrome 157), run by the owner on 2026-11-21 (layout of 100,000 items, percent of d3-hierarchy's time, middle tree shape, lower is faster).

<!-- title: On an Android phone netflow-hierarchy was faster than d3-hierarchy in all 90 races, at 33 to 47% of its time at 100,000 items -->
| view | way | Android Chrome 157 |
|---|---|---:|
| Icicle | d3-hierarchy | 100 |
|  | netflow-hierarchy | 33 |
| Treemap | d3-hierarchy | 100 |
|  | netflow-hierarchy | 40 |
| Sunburst | d3-hierarchy | 100 |
|  | netflow-hierarchy | 41 |
| Circle pack | d3-hierarchy | 100 |
|  | netflow-hierarchy | 36 |
| Tree | d3-hierarchy | 100 |
|  | netflow-hierarchy | 47 |

The phone run covers five views, icicle without sorting, five tree shapes and 1,000, 10,000 and 100,000 items: 90 races, all won by netflow-hierarchy. The best result was 0.32 of d3-hierarchy's time and the closest 0.93. At 10,000 items the middle tree shape takes 43 to 71% and at 1,000 items 47 to 78%. In this test netflow-hierarchy's items are made with their seven output fields already present, as the netflow-hierarchy README advises. This is one phone, so it shows direction rather than a guarantee.

A second phone run, on version 1.10.0 (the owner's Quick run of 31 races on the same phone, 2026-11-21, 4:59 PM Detroit, rows fed untouched to both libraries), was faster than d3-hierarchy 3.1.3 in all 31 races: the best result was 0.34 of d3-hierarchy's time and the closest 0.87. The chart above is the earlier run on 1.8.2.

Size is the one place d3-hierarchy is smaller, and the two are not the same job. d3-hierarchy 3.1.3 minified is 14.8 KB (5.8 KB gzipped) and does layout only. netflow-hierarchy ships a minified copy of 32.5 KB (14.6 KB gzipped) that does layout and drawing in one file (the readable file is 22.6 KB gzipped), and its layout part alone is about 16.3 KB (7.4 KB gzipped). So d3-hierarchy is smaller and no size win is claimed.
