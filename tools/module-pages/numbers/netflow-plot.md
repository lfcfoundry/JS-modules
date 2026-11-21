**Against uPlot and Chart.js, cloud-browser runs.** One line chart of 100,000 points (900 x 500), a fresh page for every library, shared 4-core cloud machine with no GPU, so treat gaps smaller than the pass-to-pass spread (5 to 45%) as ties. Lower is faster.

Compared: netflow-plot against uPlot 1.6.32 and Chart.js 4.6.1 (build a 100,000-point line chart, finished picture in the page, ms).

<!-- title: netflow-plot builds a 100,000-point line chart in 16 to 19 ms, faster than Chart.js (27 to 39 ms) and well behind uPlot (1 ms) -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| uPlot | 0.9 | 1.0 | 1.0 |
| Chart.js (all points) | 34 | 39 | 27 |
| netflow-plot | 16.4 | 18.6 | 16 |

The netflow-plot time is the call plus putting the finished SVG in the page and laying it out. Chart.js draws onto a canvas, and on top of its 27 to 39 ms the browser then needs 11 to 16 ms to paint. uPlot, which draws one canvas path, is far ahead of both. Fairness note: above 5,000 points on a line, netflow-plot keeps for each whole-pixel column its first, lowest, highest and last point, so the SVG is about 39 KB instead of 1.4 MB and the picture looks the same apart from a few shades on stroke edges at 2x zoom. Chart.js here draws all 100,000 points; with its own decimation on it draws about 900 points and takes 6 to 9 ms, a different picture. Chart.js and uPlot come from the 3-pass rivals test (median of 3); netflow-plot comes from alternating-page runs on the same machine (median of 5, 2 in WebKitGTK). WebKitGTK timings vary about 20% from run to run on this machine.

Compared: netflow-plot against uPlot and Chart.js (gzipped size in KB, smaller is better).

<!-- title: netflow-plot with netflow-scene is 62 KB gzipped, smaller than Chart.js (71 KB) and bigger than uPlot (22 KB) -->
| way | gzip KB |
|---|---:|
| uPlot | 22.0 |
| netflow-plot with netflow-scene | 61.6 |
| Chart.js | 70.9 |

Same minifier for ours and uPlot; the rivals' own minified files otherwise. Sizes were measured at netflow-plot 2.17.0 and not re-measured since; the module has grown by about 1.5% (shipped file). netflow-scene (33.3 KB of the total) is needed to draw.
