**Against uPlot and Chart.js, cloud-browser runs.** One line chart of 100,000 points (900 x 500), a fresh page for every library, median of 3 passes, shared 4-core cloud machine with no GPU, so treat gaps smaller than the pass-to-pass spread (5 to 45%) as ties. Lower is faster. This is where netflow-plot loses.

Compared: netflow-plot against uPlot 1.6.32 and Chart.js 4.6.1 (build a 100,000-point line chart, ms).

<!-- title: netflow-plot's drawing list for a 100,000-point line takes 13 to 23 ms, under Chart.js (27 to 39), but a finished SVG takes 46 to 63 ms, still behind -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| uPlot | 0.9 | 1.0 | 1.0 |
| Chart.js (all points) | 34 | 39 | 27 |
| netflow-plot, finished SVG in the page | 46 | 63 | 63 |
| netflow-plot, drawing list only | 17 | 23 | 13 |

The drawing list is the finished picture as data (lines, text and shapes), before it is turned into SVG text, so it is not the same job as a canvas draw: netflow-plot is faster than Chart.js at that step and slower once the SVG is in the page and laid out. uPlot, which draws one canvas path, is far ahead of both. netflow-plot is built for pictures you can export (SVG with axes, tick labels and a key), not for 100,000-point live canvases, so the honest total for a picture in the page is the SVG row, and it loses to Chart.js and uPlot. Chart.js with its decimation on draws only about 900 points (a different picture) and takes 6 to 9 ms.

Compared: netflow-plot against uPlot and Chart.js (gzipped size in KB, smaller is better).

<!-- title: netflow-plot with netflow-scene is 62 KB gzipped, smaller than Chart.js (71 KB) and bigger than uPlot (22 KB) -->
| way | gzip KB |
|---|---:|
| uPlot | 22.0 |
| netflow-plot with netflow-scene | 61.6 |
| Chart.js | 70.9 |

Same minifier for ours and uPlot; the rivals' own minified files otherwise. netflow-scene (33.3 KB of the total) is needed to draw.
