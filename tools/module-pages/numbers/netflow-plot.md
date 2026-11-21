**Against uPlot and Chart.js, cloud-browser runs.** One line chart of 100,000 points (900 x 500), a fresh page for every library, shared 4-core cloud machine, one browser at a time, so treat gaps smaller than the pass-to-pass spread (5 to 20%) as ties. Lower is faster.

Compared: netflow-plot against uPlot 1.6.32 and Chart.js 4.6.1 (a finished 100,000-point line chart on screen, ms per chart).

<!-- title: netflow-plot finishes a 100,000-point line chart in 3.4 to 6.6 ms, ahead of uPlot (8 to 17 ms) and Chart.js (12 to 15 ms with its own thinning) -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| uPlot | 11.3 | 7.6 | 17.3 |
| Chart.js (its own thinning) | 13.4 | 12.3 | 14.7 |
| Chart.js (all points) | 41.7 | 36.1 | 32.6 |
| netflow-plot | 3.4 | 3.9 | 6.6 |

How it is measured: every frame the page throws away its charts and builds new ones, 5 at a time and then 20 at a time, for 1.8 seconds each; the cost of one chart is the extra frame time per extra chart. A frame cannot start before the one before it is on screen, so this counts everything: the library's script, layout, painting and turning the shapes into pixels. Median of 2 passes (6 for netflow-plot in WebKitGTK). netflow-plot 2.20.0 and uPlot were raced together on 2026-11-21; the Chart.js rows are from the 2026-11-20 race. All four are given the same 100,000 points; netflow-plot reads them from 100,000 row objects, uPlot from two number columns, Chart.js from a list of x, y pairs.

Why not just time the call: uPlot's call returns in 1 to 3 ms, because it only schedules its drawing for a moment later. Counting that drawing, the page is busy for 5.5 ms in Chromium and 9.5 ms in Firefox, and until the canvas holds its pixels 10.9 ms in Chromium. netflow-plot's call (with the finished SVG in the page and laid out) takes 5.4 to 5.9, 6 and 7 to 12 ms in the three browsers, and Chart.js with thinning 7.2, 14.5 and 19. Earlier versions of this page compared netflow-plot's whole call with uPlot's 1 ms and so showed uPlot far ahead.

Given the same points as two number columns instead of rows (since 2.19.0), netflow-plot's own call drops from 5.5 to 3.9 ms in Chromium, one chart reaches the screen in about 11 ms instead of 12, and the steady-redraw cost per chart falls to 2.0 to 2.3 ms in Chromium, 2.5 to 2.6 in Firefox and 4.3 to 5.1 in WebKitGTK.

One chart alone, from the call to the frame the browser reports as shown: Chromium 11.7 to 12.7 ms against uPlot's 21.7 to 24.5; Firefox 21 to 23 against 21 to 22, a tie inside one screen refresh (from number columns Firefox showed it in 10 to 22 ms; WebKitGTK has no such report). Fairness notes: above 5,000 points on a line, netflow-plot keeps for each whole-pixel column its first, lowest, highest and last point, and since 2.20.0 draws them as a filled band, one piece per pixel column (97.5% of the pixels match the stroked line it replaced, which cost 4.0 to 5.5 ms per chart); uPlot also draws the lowest and highest of each pixel column, and Chart.js's min-max thinning does much the same, so those three draw about the same picture, while "all points" draws every one. WebKitGTK timings vary about 20% from run to run on this machine.

Compared: netflow-plot against uPlot and Chart.js (gzipped size in KB, smaller is better).

<!-- title: netflow-plot with netflow-scene is 62.5 KB gzipped, smaller than Chart.js (71 KB) and bigger than uPlot (22 KB) -->
| way | gzip KB |
|---|---:|
| uPlot | 22.0 |
| netflow-plot with netflow-scene | 62.5 |
| Chart.js | 70.9 |

Same minifier for ours and uPlot; the rivals' own minified files otherwise. Measured at netflow-plot 2.20.0 and netflow-scene's current file, minified and gzipped (30.0 KB and 32.5 KB). netflow-scene is needed to draw.
