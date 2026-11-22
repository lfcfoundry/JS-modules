# netflow-engine developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 2.6.3 · API 2 · 2026-11-21

### Quick
Same positions as 2.6.2 to the last digit, less time on maps with long paths (meshes, trees). The hop-count table of the every-pair fit picks its 64 start items as a ball of near neighbors when that is cheaper. No API change, no new option, saved layouts stay valid. stress.wasm grows from 18,043 to 21,984 bytes.

### Details
Median build time of 2.6.2 against 2.6.3 (a guess on the first half of the rows, not counted, then one final build), fresh page, one browser at a time, the two versions taking turns. 6 builds per case (2 page loads x 3); cases that first read slower were repeated with 15 to 20 more builds per version and everything is pooled (up to 46 builds per version). Lower is better. The 22,500-item mesh takes 19 to 26% less and the 20,000-item tree 9 to 21% less. The other 36 cases sit between 12% less and 5% more, middle 2% less, which is the noise of this machine (about 8% between page loads): the only step that changed was timed on its own in Chromium on the maps that read slower (bigshufB 52 to 44 ms, tree1500 7 to 4 ms, ba3k 33 to 26 ms) and is shorter on every map tried.

| Browser | Map | Build ms 2.6.2 | Build ms 2.6.3 | Change | Same picture numbers |
|---|---|---|---|---|---|
| Chromium 156 | big50k | 829 | 741 | -11% | yes |
| Chromium 156 | shuffled50k | 664 | 644 | -3% | yes |
| Chromium 156 | communities10k | 216 | 209 | -3% | yes |
| Chromium 156 | communities50k | 750 | 731 | -3% | yes |
| Chromium 156 | bigshufB | 693 | 725 | +5% | yes |
| Chromium 156 | commshuf10k | 209 | 185 | -12% | yes |
| Chromium 156 | mesh22k | 533 | 402 | -25% | yes |
| Chromium 156 | ba30k | 347 | 351 | +1% | yes |
| Chromium 156 | tree20k | 269 | 228 | -15% | yes |
| Chromium 156 | smallworld20k | 349 | 357 | +2% | yes |
| Chromium 156 | ba3k | 260 | 258 | -1% | yes |
| Chromium 156 | tree1500 | 104 | 106 | +2% | yes |
| Chromium 156 | mesh1600 | 83 | 82 | -1% | yes |
| Chromium 156 | comm3500 | 347 | 338 | -3% | yes |
| Firefox 158 | big50k | 756 | 754 | -0% | yes |
| Firefox 158 | shuffled50k | 696 | 699 | +0% | yes |
| Firefox 158 | communities10k | 217 | 198 | -9% | yes |
| Firefox 158 | communities50k | 774 | 775 | +0% | yes |
| Firefox 158 | bigshufB | 741 | 675 | -9% | yes |
| Firefox 158 | commshuf10k | 217 | 206 | -5% | yes |
| Firefox 158 | mesh22k | 491 | 398 | -19% | yes |
| Firefox 158 | ba30k | 345 | 351 | +2% | yes |
| Firefox 158 | tree20k | 287 | 228 | -21% | yes |
| Firefox 158 | smallworld20k | 349 | 345 | -1% | yes |
| Firefox 158 | ba3k | 260 | 237 | -9% | yes |
| Firefox 158 | tree1500 | 102 | 103 | +1% | yes |
| Firefox 158 | mesh1600 | 84 | 79 | -6% | yes |
| Firefox 158 | comm3500 | 341 | 330 | -3% | yes |
| WebKitGTK 2.52.6 | big50k | 795 | 766 | -4% | yes |
| WebKitGTK 2.52.6 | shuffled50k | 683 | 669 | -2% | yes |
| WebKitGTK 2.52.6 | communities10k | 243 | 221 | -9% | yes |
| WebKitGTK 2.52.6 | communities50k | 757 | 724 | -4% | yes |
| WebKitGTK 2.52.6 | bigshufB | 592 | 584 | -1% | yes |
| WebKitGTK 2.52.6 | commshuf10k | 245 | 229 | -6% | yes |
| WebKitGTK 2.52.6 | mesh22k | 544 | 402 | -26% | yes |
| WebKitGTK 2.52.6 | ba30k | 338 | 328 | -3% | yes |
| WebKitGTK 2.52.6 | tree20k | 286 | 260 | -9% | yes |
| WebKitGTK 2.52.6 | smallworld20k | 363 | 373 | +3% | yes |
| WebKitGTK 2.52.6 | ba3k | 339 | 352 | +4% | yes |
| WebKitGTK 2.52.6 | tree1500 | 142 | 141 | -1% | yes |
| WebKitGTK 2.52.6 | mesh1600 | 115 | 108 | -6% | yes |
| WebKitGTK 2.52.6 | comm3500 | 460 | 454 | -1% | yes |

### Deep
The hop table (wasm `dense()`) took 43% of a build on the mesh map and 27% on the tree map in 2.6.2: with start items taken in index order, the 64 searches of a batch reach an item at many different levels, and every level made three passes over all items.
- Ring batches: the 64 start items are the first 64 unused items found by a search from a seed (a ball), and seeds follow one search order over the whole map so the balls tile it. The searches of a ball travel together as a thin ring, and only items on the ring are visited (lists of the newest level). In 2.6.1 the same lists were slower than plain passes because the start items were scattered; the ball is what makes them pay.
- Plain batches (the 2.6.1 way: the next 64 items in order, plain passes) stay cheaper when everything is a few hops apart. Batches start as rings and count "items times levels" against "newly reached items"; if one batch is clearly on the plain side (ratio under 2.2), or the running ratio is under 3 from the third batch on, the rest run plain from item 0 (redoing up to 192 start items costs less than working around them). Measured on the shrunken copies of 14 maps: mesh 6.2 and tree 5.4 run as rings, all others (1.5 to 2.8) run plain.
- Both ways now write the counts of a batch by item (64 bytes per item, one cache line for a newly reached item) and then copy them into the by-offset table, along diagonals for plain batches. This replaced the items-by-offsets scratch table and its turn-on-its-side pass, and is why plain maps are a little faster too (hop step alone up to about 30% shorter in a development timing).
- Hop counts are whole numbers and do not depend on the batching, so the table is the same byte for byte (checked by hash on 14 maps against 2.6.2) and positions are identical.
- The many-at-once search idea is from Then and others, "The More the Merrier: Efficient Multi-Source Graph Traversal" (2014); paper sites could not be reached from the build machine, so there is no link.
Tests: the module tests (20 checks, including WebAssembly against JavaScript positions), 14 big-map position comparisons and 120 position comparisons over all arrangements against 2.6.2: 0 differences.

## 2.6.2 · API 2 · 2026-11-21

### Quick
Same output as 2.6.1 to the last digit (positions, item and link records, groups), less time. The work around the Distances layout (reading the links, finding groups, picking the start item, folding links) no longer builds one small list per item. No API change, no new option, saved layouts stay valid.

### Details
Median build time of 2.6.1 against 2.6.2 (a guess on the first half of the rows, not counted, then one final build), fresh page, one browser at a time, the two versions taking turns. First table: 6 builds per case (2 page loads x 3). Second table: 5 builds per case, and 20 per case in Chromium 156 for the eight maps from mesh22k down, because the first single pass there was noisy (it read 14% slower to 8% faster on the same code) and was repeated three more times with the versions taking turns; all runs are pooled. Lower is better. 39 of 42 cases are faster, the middle case 10% less, best 31% less, worst 4% more (two small maps in Chromium, inside the noise of this machine, about 8%).

| Browser | Map | Build ms 2.6.1 | Build ms 2.6.2 | Change | Same picture numbers |
|---|---|---|---|---|---|
| Chromium 156 | big50k | 844 | 802 | -5% | yes |
| Chromium 156 | shuffled50k | 787 | 679 | -14% | yes |
| Chromium 156 | communities10k | 264 | 211 | -20% | yes |
| Chromium 156 | communities50k | 982 | 794 | -19% | yes |
| Firefox 158 | big50k | 901 | 824 | -9% | yes |
| Firefox 158 | shuffled50k | 780 | 702 | -10% | yes |
| Firefox 158 | communities10k | 289 | 252 | -13% | yes |
| Firefox 158 | communities50k | 1083 | 747 | -31% | yes |
| WebKitGTK 2.52.6 | big50k | 855 | 774 | -9% | yes |
| WebKitGTK 2.52.6 | shuffled50k | 817 | 687 | -16% | yes |
| WebKitGTK 2.52.6 | communities10k | 300 | 254 | -15% | yes |
| WebKitGTK 2.52.6 | communities50k | 1018 | 727 | -29% | yes |

| Browser | Map | Build ms 2.6.1 | Build ms 2.6.2 | Change | Same picture numbers |
|---|---|---|---|---|---|
| Chromium 156 | bigshufB | 924 | 716 | -23% | yes |
| Chromium 156 | commshuf10k | 265 | 231 | -13% | yes |
| Chromium 156 | mesh22k | 624 | 551 | -12% | yes |
| Chromium 156 | ba30k | 410 | 361 | -12% | yes |
| Chromium 156 | tree20k | 364 | 336 | -8% | yes |
| Chromium 156 | smallworld20k | 408 | 399 | -2% | yes |
| Chromium 156 | ba3k | 303 | 290 | -4% | yes |
| Chromium 156 | tree1500 | 117 | 115 | -2% | yes |
| Chromium 156 | mesh1600 | 91 | 95 | +4% | yes |
| Chromium 156 | comm3500 | 389 | 400 | +3% | yes |
| Firefox 158 | bigshufB | 874 | 790 | -10% | yes |
| Firefox 158 | commshuf10k | 356 | 258 | -28% | yes |
| Firefox 158 | mesh22k | 581 | 537 | -8% | yes |
| Firefox 158 | ba30k | 423 | 325 | -23% | yes |
| Firefox 158 | tree20k | 325 | 287 | -12% | yes |
| Firefox 158 | smallworld20k | 413 | 366 | -11% | yes |
| Firefox 158 | ba3k | 277 | 285 | +3% | yes |
| Firefox 158 | tree1500 | 121 | 116 | -4% | yes |
| Firefox 158 | mesh1600 | 98 | 91 | -7% | yes |
| Firefox 158 | comm3500 | 390 | 382 | -2% | yes |
| WebKitGTK 2.52.6 | bigshufB | 868 | 706 | -19% | yes |
| WebKitGTK 2.52.6 | commshuf10k | 315 | 271 | -14% | yes |
| WebKitGTK 2.52.6 | mesh22k | 596 | 530 | -11% | yes |
| WebKitGTK 2.52.6 | ba30k | 386 | 361 | -6% | yes |
| WebKitGTK 2.52.6 | tree20k | 375 | 332 | -11% | yes |
| WebKitGTK 2.52.6 | smallworld20k | 426 | 382 | -10% | yes |
| WebKitGTK 2.52.6 | ba3k | 436 | 405 | -7% | yes |
| WebKitGTK 2.52.6 | tree1500 | 161 | 144 | -11% | yes |
| WebKitGTK 2.52.6 | mesh1600 | 115 | 115 | +0% | yes |
| WebKitGTK 2.52.6 | comm3500 | 487 | 472 | -3% | yes |

### Deep
Where a 2.6.1 build spent its time on a 50,000-item map with groups: about half was outside the layout. Changes, each checked to give identical output:
- Network layout: links are kept as two flat number rows (a start offset per item and the neighbors), not one array per item; the pieces of the map are found over those rows; per-item arrays are built only for the Force and Radial arrangements, which still read them.
- prepare: the link columns are typed rows filled in place.
- Start-item search: the reach counts of the first 40 candidates are found in one pass with two 32-bit words per item (the same many-at-once idea as the 2.6.1 hop table), not 40 separate searches.
- Groups finder: items are ordered with a counting sort, neighbors are read from one combined row, and an item is looked at again only if its own or a neighbor's label changed in the last round (the answer of a round cannot change otherwise).
- Folding links: the merge key is a number, and it is built only when something is folded.
- Item and link records: fast paths for one item per page and one source per link.
- fitScale (2D): the hop search goes level by level and switches direction when the frontier is large; same hop counts.
Tests: the module tests (20 checks), 120 position comparisons over all arrangements, 36 whole-output comparisons on file maps (with and without a start item, 3 option sets) and 480 story-map comparisons over all views with folding, all against 2.6.1: 0 differences.

## 2.6.1 · API 2 · 2026-11-21

### Quick
Same positions as 2.6.0 to the last digit, less time. The hop-count table used by the every-pair fit is now found from 64 items at once. No API change, no new option, saved layouts stay valid.

### Details
Median build time of 2.6.0 against 2.6.1 (a guess on the first half of the rows, not counted, then one final build), 6 builds per case (2 page loads x 3), fresh page, one browser at a time, the two versions taking turns. Lower is better. "Same picture numbers" means stress and crossings are equal to the last printed digit; separately, a Node check found 0 different positions on ten of these maps.

| Browser | Map | Build ms 2.6.0 | Build ms 2.6.1 | Change | Same picture numbers |
|---|---|---|---|---|---|
| Chromium 156 | big50k | 1089 | 771 | -29% | yes |
| Chromium 156 | shuffled50k | 994 | 824 | -17% | yes |
| Chromium 156 | communities10k | 415 | 246 | -41% | yes |
| Chromium 156 | communities50k | 1019 | 1011 | -1% | yes |
| Firefox 158 | big50k | 1045 | 771 | -26% | yes |
| Firefox 158 | shuffled50k | 1002 | 784 | -22% | yes |
| Firefox 158 | communities10k | 419 | 270 | -36% | yes |
| Firefox 158 | communities50k | 1092 | 1061 | -3% | yes |
| WebKitGTK 2.52.6 | big50k | 1163 | 848 | -27% | yes |
| WebKitGTK 2.52.6 | shuffled50k | 1024 | 832 | -19% | yes |
| WebKitGTK 2.52.6 | communities10k | 450 | 280 | -38% | yes |
| WebKitGTK 2.52.6 | communities50k | 921 | 884 | -4% | yes |

| Browser | Map | Build ms 2.6.0 | Build ms 2.6.1 | Change | Same picture numbers |
|---|---|---|---|---|---|
| Chromium 156 | bigshufB | 1052 | 798 | -24% | yes |
| Chromium 156 | commshuf10k | 483 | 256 | -47% | yes |
| Chromium 156 | mesh22k | 731 | 587 | -20% | yes |
| Chromium 156 | ba30k | 444 | 368 | -17% | yes |
| Chromium 156 | tree20k | 330 | 297 | -10% | yes |
| Chromium 156 | smallworld20k | 612 | 388 | -37% | yes |
| Chromium 156 | ba3k | 375 | 274 | -27% | yes |
| Chromium 156 | tree1500 | 123 | 106 | -14% | yes |
| Chromium 156 | mesh1600 | 91 | 85 | -7% | yes |
| Chromium 156 | comm3500 | 659 | 356 | -46% | yes |
| Firefox 158 | bigshufB | 1082 | 889 | -18% | yes |
| Firefox 158 | commshuf10k | 457 | 265 | -42% | yes |
| Firefox 158 | mesh22k | 693 | 608 | -12% | yes |
| Firefox 158 | ba30k | 433 | 416 | -4% | yes |
| Firefox 158 | tree20k | 364 | 326 | -10% | yes |
| Firefox 158 | smallworld20k | 602 | 414 | -31% | yes |
| Firefox 158 | ba3k | 378 | 268 | -29% | yes |
| Firefox 158 | tree1500 | 165 | 109 | -34% | yes |
| Firefox 158 | mesh1600 | 139 | 147 | +6% | yes |
| Firefox 158 | comm3500 | 631 | 454 | -28% | yes |
| WebKitGTK 2.52.6 | bigshufB | 1082 | 804 | -26% | yes |
| WebKitGTK 2.52.6 | commshuf10k | 490 | 290 | -41% | yes |
| WebKitGTK 2.52.6 | mesh22k | 777 | 581 | -25% | yes |
| WebKitGTK 2.52.6 | ba30k | 434 | 398 | -8% | yes |
| WebKitGTK 2.52.6 | tree20k | 380 | 305 | -20% | yes |
| WebKitGTK 2.52.6 | smallworld20k | 630 | 398 | -37% | yes |
| WebKitGTK 2.52.6 | ba3k | 552 | 364 | -34% | yes |
| WebKitGTK 2.52.6 | tree1500 | 179 | 142 | -21% | yes |
| WebKitGTK 2.52.6 | mesh1600 | 143 | 123 | -14% | yes |
| WebKitGTK 2.52.6 | comm3500 | 775 | 586 | -24% | yes |

The three smallest maps were measured again with 14 builds each because a 3-build reading had Firefox 6% slower on the 1,600-item mesh: Firefox 158 mesh1600 99 to 95 ms, tree1500 141 to 115, ba3k 372 to 267; Chromium 156 97 to 87, 122 to 107, 378 to 279; WebKitGTK 2.52.6 114 to 116, 146 to 138, 447 to 364. With those, 41 of 42 cases are faster, the middle case takes 21% less time, the best 47% less, and the one slower case is 2% (WebKitGTK, 1,600-item mesh, inside noise). stress.wasm 17,913 to 18,043 bytes.

### Deep
A stage timing of a 2.6.0 build of the 50,000-item drop showed the hop-count table for the refit of a 3,400-item copy taking about a quarter of the build, more than the fitting sweeps themselves: one search per item, each walking every link. The table is now filled by a search that starts from 64 items at once: every item keeps one bit per start item, and a level is one pass over the links that ORs the newest level's bits into the neighbors (the idea is from Then and others, "The More the Merrier: Efficient Multi-Source Graph Traversal", 2014; named without a link because the paper's page could not be opened from the build machine). Hop counts are whole numbers, so the table, and with it every position, is the same as before; the plain-JavaScript path keeps its one-item search and still gives the same positions (the 20 checks pass unchanged).

Tried and left out: visiting only the newest level's items through lists, alone and mixed with plain passes. Both were slower on mesh-like maps (a 22,500-item mesh went from 20% less time back to no gain), because start items are spread over the map and most levels are wide.

Looked at and not changed: whether the refit should be skipped below 20,000 items, as Netflow Map does after porting 2.6.0. With 2.6.1 the refit costs 0 to 49% of a build on 10,000 to 22,500-item maps (three browsers) for stress 0 to 4% lower; it stays on at every size because that is the look the owner approved for 2.6.0.

The laptop tester (`tests/laptop-warm/`) now follows the standard tester layout: Quick run, Full run, Stop, Copy and Download results, time left, score tiles and live charts, light and dark.

## 2.6.0 · API 2 · 2026-11-21

### Quick
`build()` with `view: 'network', arrange: 'stress'` is much faster on big maps and its picture changes (other arrangements and Distances 3D are unchanged). No API change and no new option. Saved layouts made by older versions no longer match (new layout fingerprint `nfm-layout-3`), so they are laid out again once.

### Details
What is compared: the flow a page uses today, an early picture of the whole map (`previewOnly`) and then the final build, with 2.5.0, against the flow this version makes possible, a guess from the first half of the rows while the file is still read (not counted, it is hidden in the read) and then one final build with 2.6.0. Median of 6 builds (2 page loads x 3, the two versions taking turns), fresh page, one browser at a time, on the four tester drops; "fastest" is 2.6.0 with `refitMax: 0` and is not what ships. Lower is better everywhere.

| Browser | Drop | Build ms: today / new / fastest | new vs today | fastest vs today | Stress: today / new / fastest | Crossings per link: today / new / fastest | Touching |
|---|---|---|---|---|---|---|---|
| Chromium 156 | big50k | 3035 / 1164 / 965 | -62% | -68% | 0.203 / 0.191 / 0.204 | 248.9 / 144.1 / 152.8 | 0 |
| Chromium 156 | shuffled50k | 2904 / 1105 / 887 | -62% | -69% | 0.201 / 0.195 / 0.207 | 248.0 / 133.6 / 139.6 | 0 |
| Chromium 156 | communities10k | 624 / 424 / 259 | -32% | -59% | 0.136 / 0.133 / 0.136 | 566.7 / 525.5 / 539.7 | 0 |
| Chromium 156 | communities50k | 3177 / 1105 / 1126 | -65% | -65% | 0.142 / 0.141 / 0.141 | 2709.8 / 2667.5 / 2667.5 | 0 |
| Firefox 158 | big50k | 3502 / 1241 / 905 | -65% | -74% | 0.205 / 0.192 / 0.207 | 261.9 / 143.8 / 151.4 | 0 |
| Firefox 158 | shuffled50k | 3221 / 1069 / 911 | -67% | -72% | 0.207 / 0.197 / 0.209 | 228.9 / 132.4 / 138.0 | 0 |
| Firefox 158 | communities10k | 683 / 477 / 297 | -30% | -56% | 0.136 / 0.133 / 0.136 | 559.5 / 527.0 / 543.6 | 0 |
| Firefox 158 | communities50k | 3738 / 1351 / 1255 | -64% | -66% | 0.141 / 0.140 / 0.140 | 2752.2 / 2634.3 / 2634.3 | 0 |
| WebKitGTK 2.52.6 | big50k | 3107 / 1460 / 874 | -53% | -72% | 0.202 / 0.195 / 0.204 | 247.4 / 143.9 / 151.6 | 0 |
| WebKitGTK 2.52.6 | shuffled50k | 3085 / 1148 / 880 | -63% | -71% | 0.201 / 0.202 / 0.203 | 250.6 / 139.4 / 137.8 | 0 |
| WebKitGTK 2.52.6 | communities10k | 667 / 541 / 328 | -19% | -51% | 0.136 / 0.133 / 0.136 | 567.7 / 524.9 / 535.4 | 0 |
| WebKitGTK 2.52.6 | communities50k | 3702 / 1026 / 1151 | -72% | -69% | 0.141 / 0.141 / 0.141 | 2798.0 / 2652.4 / 2652.4 | 0 |

Twelve more maps that were not used while tuning (shuffled copies, a mesh, preferential-attachment maps, a tree, a small-world map, and four small ones), median of 2 builds each:

| Browser | Drop | Build ms: today / new / fastest | new vs today | fastest vs today | Stress: today / new / fastest | Crossings per link: today / new / fastest | Touching |
|---|---|---|---|---|---|---|---|
| Chromium 156 | bigshufB | 3332 / 1300 / 1101 | -61% | -67% | 0.206 / 0.191 / 0.202 | 261.2 / 136.1 / 143.1 | 0 |
| Chromium 156 | commshuf50k | 4005 / 1500 / 1424 | -63% | -64% | 0.142 / 0.141 / 0.141 | 2875.9 / 2656.8 / 2656.8 | 0 |
| Chromium 156 | commshuf10k | 695 / 456 / 301 | -34% | -57% | 0.131 / 0.131 / 0.131 | 573.7 / 517.6 / 555.3 | 0 |
| Chromium 156 | mesh22k | 1074 / 685 / 435 | -36% | -59% | 0.014 / 0.014 / 0.014 | 0.3 / 0.1 / 0.1 | 0 |
| Chromium 156 | ba30k | 1596 / 475 / 553 | -70% | -65% | 0.205 / 0.202 / 0.202 | 3004.0 / 2847.3 / 2847.3 | 0 |
| Chromium 156 | bashuf30k | 1698 / 534 / 567 | -69% | -67% | 0.205 / 0.198 / 0.198 | 3082.1 / 2736.3 / 2736.3 | 0 |
| Chromium 156 | tree20k | 999 / 418 / 277 | -58% | -72% | 0.105 / 0.102 / 0.106 | 9.7 / 8.7 / 8.5 | 0 |
| Chromium 156 | smallworld20k | 862 / 541 / 409 | -37% | -52% | 0.132 / 0.131 / 0.132 | 5.2 / 4.6 / 4.5 | 0 |
| Chromium 156 | ba3k | 1433 / 412 / 360 | -71% | -75% | 0.142 / 0.141 / 0.141 | 321.6 / 321.5 / 321.5 | 0 |
| Chromium 156 | tree1500 | 375 / 125 / 161 | -67% | -57% | 0.075 / 0.076 / 0.076 | 2.1 / 1.9 / 1.9 | 0 |
| Chromium 156 | mesh1600 | 250 / 134 / 95 | -46% | -62% | 0.009 / 0.009 / 0.009 | 0.0 / 0.0 / 0.0 | 0 |
| Chromium 156 | comm3500 | 1858 / 717 / 632 | -61% | -66% | 0.101 / 0.097 / 0.097 | 339.3 / 341.5 / 341.5 | 0 |
| Firefox 158 | bigshufB | 3727 / 1266 / 1006 | -66% | -73% | 0.204 / 0.190 / 0.204 | 268.8 / 140.4 / 143.2 | 0 |
| Firefox 158 | commshuf50k | 4348 / 1676 / 1295 | -61% | -70% | 0.142 / 0.141 / 0.141 | 2763.1 / 2650.4 / 2650.4 | 0 |
| Firefox 158 | commshuf10k | 712 / 534 / 408 | -25% | -43% | 0.133 / 0.132 / 0.132 | 564.4 / 517.5 / 551.6 | 0 |
| Firefox 158 | mesh22k | 951 / 765 / 496 | -20% | -48% | 0.014 / 0.014 / 0.014 | 0.3 / 0.1 / 0.1 | 0 |
| Firefox 158 | ba30k | 1847 / 505 / 509 | -73% | -72% | 0.204 / 0.199 / 0.199 | 3067.4 / 2779.5 / 2779.5 | 0 |
| Firefox 158 | bashuf30k | 1849 / 589 / 664 | -68% | -64% | 0.203 / 0.201 / 0.201 | 3047.3 / 2859.3 / 2859.3 | 0 |
| Firefox 158 | tree20k | 969 / 357 / 362 | -63% | -63% | 0.105 / 0.102 / 0.105 | 10.1 / 8.8 / 8.2 | 0 |
| Firefox 158 | smallworld20k | 914 / 575 / 434 | -37% | -53% | 0.131 / 0.131 / 0.132 | 4.9 / 4.5 / 4.4 | 0 |
| Firefox 158 | ba3k | 1639 / 436 / 361 | -73% | -78% | 0.141 / 0.143 / 0.143 | 311.8 / 310.7 / 310.7 | 0 |
| Firefox 158 | tree1500 | 346 / 100 / 143 | -71% | -59% | 0.076 / 0.076 / 0.076 | 2.0 / 2.1 / 2.1 | 0 |
| Firefox 158 | mesh1600 | 260 / 113 / 118 | -57% | -55% | 0.009 / 0.009 / 0.009 | 0.0 / 0.0 / 0.0 | 0 |
| Firefox 158 | comm3500 | 2182 / 639 / 559 | -71% | -74% | 0.101 / 0.098 / 0.098 | 339.3 / 334.3 / 334.3 | 0 |
| WebKitGTK 2.52.6 | bigshufB | 3122 / 1325 / 1052 | -58% | -66% | 0.203 / 0.193 / 0.200 | 260.6 / 139.9 / 145.7 | 0 |
| WebKitGTK 2.52.6 | commshuf50k | 4683 / 1297 / 1169 | -72% | -75% | 0.142 / 0.142 / 0.142 | 2837.4 / 2692.3 / 2692.3 | 0 |
| WebKitGTK 2.52.6 | commshuf10k | 682 / 455 / 347 | -33% | -49% | 0.134 / 0.132 / 0.131 | 572.8 / 517.9 / 551.5 | 0 |
| WebKitGTK 2.52.6 | mesh22k | 917 / 808 / 466 | -12% | -49% | 0.014 / 0.014 / 0.014 | 0.3 / 0.1 / 0.1 | 0 |
| WebKitGTK 2.52.6 | ba30k | 1550 / 473 / 543 | -69% | -65% | 0.205 / 0.200 / 0.200 | 3028.9 / 2857.2 / 2857.2 | 0 |
| WebKitGTK 2.52.6 | bashuf30k | 1708 / 538 / 513 | -69% | -70% | 0.208 / 0.199 / 0.199 | 3056.6 / 2819.1 / 2819.1 | 0 |
| WebKitGTK 2.52.6 | tree20k | 882 / 390 / 268 | -56% | -70% | 0.105 / 0.101 / 0.106 | 10.0 / 8.6 / 8.5 | 0 |
| WebKitGTK 2.52.6 | smallworld20k | 936 / 583 / 389 | -38% | -58% | 0.131 / 0.134 / 0.132 | 4.9 / 4.8 / 4.4 | 0 |
| WebKitGTK 2.52.6 | ba3k | 1405 / 437 / 450 | -69% | -68% | 0.141 / 0.140 / 0.140 | 317.1 / 317.6 / 317.6 | 0 |
| WebKitGTK 2.52.6 | tree1500 | 360 / 187 / 171 | -48% | -52% | 0.077 / 0.076 / 0.076 | 1.9 / 1.9 / 1.9 | 0 |
| WebKitGTK 2.52.6 | mesh1600 | 268 / 134 / 144 | -50% | -46% | 0.009 / 0.009 / 0.009 | 0.0 / 0.0 / 0.0 | 0 |
| WebKitGTK 2.52.6 | comm3500 | 1849 / 804 / 766 | -57% | -59% | 0.098 / 0.098 / 0.098 | 344.5 / 335.5 / 335.5 | 0 |

In all 48 cases the new build is faster (12 to 73% less time), no items touch, and crossings per link are equal or lower except three ties inside 5% on maps with about 2 or 340 crossings per link. Stress is lower by up to 7% on sparse maps and inside 2% either way elsewhere; the same map with its rows in another order already moves stress by 1% in 2.5.0, so differences that small are noise. File size: 218 to 241 KB (68 to 78 KB gzipped); stress.wasm 9,199 to 17,913 bytes.

### Deep
Asked for by the owner on 2026-11-21 after the laptop tester showed the first warm-start try (start the final layout from the guess and skip the coarse stage) losing on three of four drops, with 8 to 15 times the crossings. Cause: a guess from part of the rows cannot know the overall shape, and the gentle final passes cannot repair a wrong shape. So this version keeps the whole shrink, lay out, grow back layout on the whole map, which does not care about row order, and makes it fast enough that one final build beats today's two builds. A profile showed where the time went: about 40% pushing touching items apart, 25% choosing which pairs to fit, 10% in the fitting itself, the rest in JavaScript bookkeeping.

What changed:
- Push-apart: one stretch of the whole picture first (found from a histogram of how much each touching pair overlaps, aiming at 0.7 touching pairs per item or fewer), then passes that compare squared distances and revisit only items that still touch. Before, 30 full passes ran on a crowded picture and then the picture grew by 10% per round.
- Pair choice: the near-neighbor walk takes any item two or more hops away, starts at a rotating link and stops at a budget of 16 x near + links, so hubs no longer dominate; hop counts use a search that switches to bottom-up when the frontier has more links than the unvisited part.
- Every-pair fit with no pair list (`stressDense`): for pieces of up to 4,000 items the hop counts live in one byte table laid out by offset, and each sweep walks the offsets in a fresh random order, two lanes at a time.
- Refit: the largest shrunken copy of up to 4,000 items is first laid out from a 1,000-item base and then fitted again with every pair, using half of the offsets per sweep, when its cost (items x (items + links)) is 200 million or less. This is what lowers stress on sparse maps.
- Bookkeeping: typed lists through the recursion, sizes read once, groups counted with a typed tally (same answers), less jitter when growing a level back (0.3 to 0.05).

The WebAssembly and plain-JavaScript paths give the same positions to the last digit (2 new checks: a 6,000-item map, and the new push-apart on its own including when its grid outgrows the first table; 20 checks in all).

Tried and left out, with the reason: starting from the guess and skipping the coarse stage (bad on every unordered drop); a far-apart-pivot base instead of every pair (stress 0.27 against 0.20); a smaller base with no refit (higher stress); stronger passes per level (no stress gain, more crossings); a refit from pivots, also with one-sided moves (worse); sampling far pairs, with and without weights (worse). Starting the base from the guess saves a further 5 to 10% with stress inside 1% either way; it is not in this version because it needs a safety check first.

Known cost: the refit is slower in WebKitGTK (a 22,000-item mesh gains 12% there against 36% in Chromium). Not yet done: Netflow Map's own engine has not taken this change, so the app's "same layout as the module" check will differ for the Network Distances view until it does.

## 2.5.0 · API 2 · 2026-11-21

### Quick
New `NetflowEngine.quickNetwork(G)`: typed lists `{ n, cx, cy, size, width, height, rough }` for a rough Network picture of partial rows. Nothing else changes.

### Details
Input is the plain lists (`nodes: [{ id, traffic?, sizeK? }]`, `edges: [{ from, to }]`); links to unknown ids and self links are ignored; nothing is written into the lists and no build runs first. One piece per connected component, a golden-angle spiral in breadth-first order from the item with most links, pieces placed side by side, sizes by the same rule as the Network view. Median of 7 calls on a random hub-and-leaf graph with 1.4 links per item: 10,000 items 5.9 / 4.6 / 6 ms and 50,000 items 23.5 / 39.5 / 60 ms in Chromium 156 / Firefox 158 / WebKitGTK 2.52.6. For comparison on the same graph in Chromium: build() with `previewOnly` took 291 ms (10,000) and 920 ms (50,000), `arrange: 'radial'` 152 and 1,165 ms, the full Distances layout 666 and 4,094 ms.

### Deep
Asked for by the Netflow Map thread on 2026-11-21 (hide part of the 0.55 s layout of a 50,000-item drop while the 0.3 s read runs). The existing early preview cannot be resumed from partial data, because its saved start is keyed on the exact piece, and `build()` itself spends about 60 ms per 10,000 items on preparing the map before any layout runs (a build with a quick layout took 66 ms for 10,000 items against 5 for the layout alone), so the quick layout stands alone and skips the build. The picture is a tangled disc (items on a spiral, no untangling), so it is a placeholder, not a layout. Tests: 1 new check (6 assertions).

## 2.4.1 · API 2 · 2026-11-06

### Quick
Same layout, smaller force program

### Details
force.wasm 7,260 to 7,094 bytes with the same output.

### Deep
Requested by the owner (card: Ship them).

## 2.4.0 · API 2 · 2026-11-05

### Quick
New NetflowEngine.toSvg(data, options): a list of links [{ from, to, value }] or a { start, nodes, edges } graph in, SVG text out (requested by the owner).

### Deep
New NetflowEngine.toSvg(data, options): a list of links [{ from, to, value }] or a { start, nodes, edges } graph in, SVG text out (requested by the owner). Missing fields are filled in; values set link widths and, in the Sankey view, the band widths; with no groups given the engine colors the groups it finds. Uses netflow-scene, plus netflow-sankey for the Sankey view when it is loaded.

## 2.3.0 · API 2 · 2026-11-01

### Quick
use('circular') and use('hierarchy'); their views join VIEWS and build() lays them out; found on their own as page globals or Node files next to this folder.

### Details
The add-ons are found as globals NetflowCircular / NetflowHierarchy or as ../netflow-circular/netflow-circular.js and ../netflow-hierarchy/netflow-hierarchy.js in Node (tried once, at the first build), or handed over with use(). Their views skip folding, as in Netflow Map. The code VERSION constant said 2.2.2 while the header said 2.2.3 (the version check in the module tests failed on main); both now say 2.3.0.

### Deep
netflow-engine 2.3.0: the circular and nested views as add-ons (use('circular'), use('hierarchy')).

## 2.2.3 · API 2 · 2026-10-31

### Quick
fmt and fmtFull keep one number formatter instead of building a new one on every call. Same text.

### Details
fmt() for 1,000 to 9,999 and fmtFull() now reuse one Intl.NumberFormat each (made on first use) instead of calling toLocaleString('en-US', ...), which builds the locale rules on every call. 20,000 fmt + fmtFull calls, new/old time (lower is better): Chromium 153 0.039 (928 to 44 ms), Firefox 158 0.047 (368 to 14 ms), WebKitGTK 2.52.6 0.023 (1193 to 23 ms); output identical on all 20,000 values.

### Deep
Cached number formatters in fmt and fmtFull: 95 to 98% faster, same text. Found by the Story Editor thread (cached Intl.Collator).

## 2.2.2 · API 2 · 2026-10-22

### Quick
2.2.2: Flow, Down, Spine and Lanes build layered drawings up to 250,000 stops (was 90,000), so maps of about 5,000 to 6,500 pages now draw in 0.5 to 1.6 s instead of being refused.

### Deep
Patch. Flow, Down, Spine and Lanes pass maxVertices: 250000 to netflow-layers (its own default is 90,000), so maps of about 5,000 to 6,500 pages with 3 links each build instead of being refused. Sankey, arc and matrix are untouched; larger maps (8,000 pages, about 367,000 stops) are still refused with the same plain message; layouts below the old limit are unchanged. First Flow layout, ms, lower is better (Chromium 155 / Firefox 158.0 / WebKitGTK 2.52.6 / GNOME Web 46.5): 5,000 pages refused to 576 / 837 / 561 / 513; 6,500 pages refused to 922 / 1,584 / 897 / 837; 3,000 pages unchanged (241 to 237, 497 to 503, 237 to 247, 236 to 225). Netflow Map's own engine gives identical results on 315 builds. Size: netflow-engine.js 209,807 to 210,105 bytes (+298); stress.wasm unchanged.

## 2.2.1 · API 2 · 2026-10-22

### Quick
The two-pair Distances sweeps no longer stop at 20,000 items: they run at any size (1.02 to 1.10 times faster at 30,000 and 60,000 items in the four test browsers), same positions.

### Deep
**The two-pair Distances sweeps now run at any size.** Nothing was removed or renamed, so the API number stays 2. Before, `stressWasm.simdMax` (20,000 items) kept flat Distances on the one-pair sweep above that size; the limit is gone and `sweepsv` runs whenever `stressWasm.simd` is on. Whole-build times of flat Distances on a moderate map, one-pair over two-pair (higher is better), in the order Chromium 155.0.8059.39-1 / Firefox 158.0 / WebKitGTK 2.52.6 / GNOME Web 46.5: 30,000 items 1.07 / 1.04 / 1.10 / 1.06; 60,000 items 1.04 / 1.06 / 1.04 / 1.02 (Netflow Map `docs/BENCHMARKS.md` section 29, alternating, medians). The positions are the same to the last digit (page check: two-pair against one-pair at 1,500, 5,000, 24,000 and 45,000 items, 0 differences in all four browsers). A two-pair Distances 3D sweep was written and measured at 0.95 to 1.08 times in the same browsers, so it is not part of the module (plain WebAssembly stays for 3D). The proposed 2.2.0 short changelog had a duplicate `## 2.2.0` heading; it is fixed. Size: `netflow-engine.js` 209,855 to 209,807 bytes.

## 2.2.0 · API 2 · 2026-10-18

### Quick
A page can keep finished Network map positions and put them back: reopening a big map is 2.4 to 14.9 times faster (higher is better), same picture. Distances sweeps run two pairs of items at a time in WebAssembly up to 20,000 items: 1.0 to 1.44 times faster, same positions.

### Deep
**The engine can hand finished layouts back, and the Distances sweeps run two pairs of items at a time.** Nothing was removed or renamed, so the API number stays 2. (1) Saved layouts: `layoutKey(graph, options)` returns a fingerprint of the data, the options, the tuning and the layout code (`null` for previews and views where saving makes no sense); `build()` takes `saveKey`, `wantSave` (returns `saveLayout`: key, `xy` Float64Array, width, height) and `saved` (a record with a matching key and the right length is put back, `fromSaved` is true, the positions are those of a new layout; a wrong or damaged record is ignored). Netflow Map keeps the records in IndexedDB for maps of 1,500 items or more. Reopening a map, second open against a plain build, higher is better (Chromium 155 / Firefox 158 / WebKitGTK 2.52.6 / GNOME Web 46.5, versions alternating): 3,000 items 13.8 / 14.9 / 9.5 / 10.4 times; 10,000 items 3.1 / 3.6 / 3.0 / 3.1; 30,000 items 2.6 / 2.4 / 2.6 / 2.4. The picture was identical in 12 of 12 cells. The first open of a map not seen before costs more (fingerprint and save), lower is better: -2% to +12%, about +3% in the middle. (2) Two-lane Distances sweeps (`sweepsv` in `wasm/stress.c`, 8,013 to 9,199 bytes): two neighbors in the shuffled order that share no item run side by side, so positions are identical to the one-lane sweeps; flat Distances only, up to `stressWasm.simdMax` (20,000) items, off with `stressWasm.simd = false`. Distances time, one-lane time over two-lane time, higher is better (same four browsers) at 1,000 / 5,000 / 15,000 items: 1.11 / 1.06 / 1.02, 1.14 / 1.13 / 1.00, 1.41 / 1.29 / 1.15, 1.42 / 1.32 / 1.16; "best quality" is about 1.0 beyond 1,000 items. No cell was more than 3% worse. Size: `netflow-engine.js` 205,069 to 209,855 bytes (65,612 gzipped); `stress.wasm` 8,013 to 9,199 bytes.

## 2.1.0 · API 2 · 2026-10-18

### Quick
More of the engine runs as WebAssembly, there is a new Distances 3D arrangement, and big flat Force maps are 1.5 to 2.4 times faster at 5,000 to 10,000 items (higher is better).

### Deep
test

## 2.0.0 · API 2 · 2026-10-18

### Quick
The sixth view is now called "sankey" (the old name is gone), so a page that typed the old name by hand must change it. New tight or wide spread for the story views.

### Deep
**The sixth view is called `sankey`, and the story views take a tight or wide spread.** (1) Changed: the Sankey view's id in `build(graph, { view })` and in `VIEWS` is now `sankey`; the id used in 1.0.0 is gone and draws the Flow picture like any unknown id. That is why this is 2.0.0 · API 2: a page that typed the old id by hand must change it (the README had asked people to read it from `VIEWS[5][0]`, which keeps working). Netflow Map's own engine made the same change (build 2026.10.18.1220). (2) New: option `spread: "wide"` for Flow, Top-down, Spine and Lanes, passed to netflow-layers 1.3.0 (looser, more tree-like, for wide screens; `"tight"` or nothing is the picture as before; an older netflow-layers ignores it). On a 120-page story map with netflow-layers 1.3.0 the Top-down picture goes from 1,353 to 1,618 pixels wide (1.2 times) and Flow from 9,480 x 558 to 11,832 x 626. The Sankey view needs netflow-sankey 2.1.0 or newer for its `sk` options (2.1.0 added the two calls the view makes). Nothing else changed: the file differs from 1.0.0 in 20 lines (the id, the option, two comments), the layout code and the WebAssembly are untouched.

## 1.0.0 · API 1 · 2026-10-18

### Quick
The engine code arrives: the engine of Netflow Map as one file you can adapt, with nine map views and layouts for networks of any size.

### Deep
**The engine code arrives.** This is the engine of Netflow Map (build 2026.10.18.1101), cut out as one file you can adapt. What each part does:
- **Nine views** of a map from `build(graph, options)`: Flow, Top-down, Choke-point spine, Lanes, Shape, Sankey, Arc, Matrix and Network. The story views need netflow-layers 1.2.0 or newer; the Network view does not.
- **Network layouts for any size**: Distances (stress), Closeness, Force, Radial, Circle, Rings, Groups, Grid and three 3D ones. Layout of a 30,000-item network took 42.1 s in the first Netflow Map version and 812 ms now (52×, Firefox 159); 10,000 items 7.25 s to 456 ms (16×); 100,000 items from over 60 s to 4.29 s. In this module's own four-browser run (cold, one run each): 10,000 items in 533 to 810 ms.
- **No two items on top of each other**: checked on 2,000 items in three arrangements (0 touching pairs).
- **WebAssembly twins** for Force and Distances (sources and a reproducible rebuild in `wasm/`; 7,260 and 5,616 bytes), with the plain-JavaScript path giving the same positions (checked). Page policy needs only `'wasm-unsafe-eval'`.
- **Add-on hand-over**: `use('layers', impl)` and `use('sankey', impl)`; both are also found on their own. This is new: in Netflow Map they were fixed script names. Known gap, said plainly: the Sankey view's look needs an add-on with `options`, `layout` and `apply`; the published netflow-sankey 2.0.0 has only `layout`, so the Sankey view works without `sk` options and throws with them until netflow-sankey gains the two calls.
- **The column reader** (numbers as people write them, dates, categories, small formulas) is included as `NetflowEngine.columns`.
- **Size**: 191 KB as one file, 61 KB gzipped.

The file is cut from Netflow Map's engine by a script, and 225 comparison builds (5 maps × 9 views × 5 option sets) give 0 differences.

The demo page (`demo.html`, page policy `script-src 'self' 'wasm-unsafe-eval'`, nothing else loosened) was run in all four browsers, one at a time, with `test/demo-browsers.js`: 3,000 items, Stress and Force, WebAssembly on and off. Every run laid out, drew (the same number of pixels is drawn with and without WebAssembly), used the WebAssembly twin only when it was on, and showed no console or page error. Layout time in ms, one cold run each, lower is better (a first look, not a benchmark; gaps under about 20% are noise, and Stress is a tie):

| Browser | Stress, WebAssembly on / off | Force, WebAssembly on / off |
|---|---|---|
| ungoogled Chromium 155.0.8059.39-1 | 1,465 / 1,661 | 1,348 / 2,442 |
| Firefox 158.0 | 1,434 / 2,084 | 1,473 / 3,486 |
| WebKitGTK 2.52.6 | 1,083 / 1,119 | 1,217 / 1,968 |
| GNOME Web 46.5 | 1,167 / 968 | 1,610 / 2,436 |

Force is faster with WebAssembly in all four browsers (about 1.6 to 2.4 times). Not done yet, said plainly: no comparison against general graph-layout libraries (that section is left out rather than guessed), and the Sankey view's look cannot be used with the published netflow-sankey 2.0.0 (see the add-on note above).

## 0.1.0 · API 0 · 2026-10-18

### Quick
Placeholder with no engine code yet.

### Deep
New placeholder module for the engine of Netflow Map, so other people can adapt it later. It had no engine code: the file only had `NetflowEngine.status()`, which said `placeholder: true`. Nothing to measure: 0 layouts, 0 bytes of engine (the file was under 1 KB).
