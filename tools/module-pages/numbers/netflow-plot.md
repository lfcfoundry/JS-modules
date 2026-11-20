**Against uPlot and Chart.js, cloud-browser runs.** One line chart of 100,000 points (900 x 500), a fresh page for every library, median of 3 passes, shared 4-core cloud machine with no GPU, so treat gaps smaller than the pass-to-pass spread (5 to 45%) as ties. Lower is faster. This is where netflow-plot loses.

Compared: netflow-plot against uPlot 1.6.32 and Chart.js 4.6.1 (build a 100,000-point line chart, ms).

<!-- title: netflow-plot loses on a 100,000-point line chart: 75 to 106 ms against 27 to 39 for Chart.js and 1 for uPlot -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| uPlot | 0.9 | 1.0 | 1.0 |
| Chart.js (all points) | 34 | 39 | 27 |
| netflow-plot (finished SVG in the page) | 75 | 98 | 106 |

netflow-plot is built for pictures you can export (SVG with axes, tick labels and a key), not for 100,000-point live canvases, and it does not win here. Chart.js and uPlot draw straight onto a canvas. Drawing list only, without the SVG text, netflow-plot takes 46, 63 and 54 ms. To a painted frame, uPlot adds nothing, Chart.js 17 to 21 ms, and netflow-plot about 50 (Chromium), 86 (Firefox) and 232 ms (WebKitGTK), because a 1.3 MB SVG must be laid out and painted. Chart.js with its decimation on draws only about 900 points (a different picture) and takes 6 to 9 ms. The Chromium run for netflow-plot spread widely (132, 75, 76 ms).

Compared: netflow-plot against uPlot and Chart.js (gzipped size in KB, smaller is better).

<!-- title: netflow-plot with netflow-scene is 62 KB gzipped, smaller than Chart.js (71 KB) and bigger than uPlot (22 KB) -->
| way | gzip KB |
|---|---:|
| uPlot | 22.0 |
| netflow-plot with netflow-scene | 61.6 |
| Chart.js | 70.9 |

Same minifier for ours and uPlot; the rivals' own minified files otherwise. netflow-scene (33.3 KB of the total) is needed to draw.
