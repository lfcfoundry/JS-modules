**Against d3-hierarchy 3.1.3, cloud-browser runs.** The same job from the same rows: build the tree, sum, sort the children and lay out 100,000 items into positioned boxes, all five views. A fresh page for every library, one browser at a time, shared 4-core cloud machine. Time is shown as a percent of d3-hierarchy's time, so d3-hierarchy is always 100 and lower is faster.

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
