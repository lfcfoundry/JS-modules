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
|  | netflow-hierarchy | 41 | 44 | 40 |
| Tree | d3-hierarchy | 100 | 100 | 100 |
|  | netflow-hierarchy | 44 | 35 | 48 |

The lead is smaller on smaller charts. At 10,000 items netflow-hierarchy takes 43 to 94% of d3-hierarchy's time, and at 1,000 items 53 to 86%; in no view and no browser is it behind. Cloud test browsers only; laptop numbers are still to come.

Size is the one place d3-hierarchy is smaller, and the two are not the same job. d3-hierarchy 3.1.3 minified is 14.8 KB (5.8 KB gzipped) and does layout only. netflow-hierarchy ships a minified copy of 31.7 KB (14.1 KB gzipped) that does layout and drawing in one file (the readable file is 22.6 KB gzipped), and its layout part alone is about 16.3 KB (7.4 KB gzipped). So d3-hierarchy is smaller and no size win is claimed.
