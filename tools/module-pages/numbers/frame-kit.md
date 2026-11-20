**Against stats.js, cloud-browser runs.** The cost of the frame meter, 200,000 simulated frames in a loop, median of 3 passes, shared 4-core cloud machine. Lower is better.

Compared: frame-kit's FrameMeter against stats.js 0.17.0 (microseconds per frame).

<!-- title: frame-kit's FrameMeter costs 0.03 microseconds per frame against 7 to 12 for stats.js, which also draws a graph -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| stats.js | 11.6 | 6.6 | 11.9 |
| frame-kit FrameMeter | 0.03 | 0.03 | 0.02 |

This is not like for like: stats.js draws its own small graph every frame, while FrameMeter only counts (frames per second, slowest frame, hitches with a cause, tap delay) and draws nothing. Against a 16.7 ms frame both are tiny (stats.js is about 0.07%), so the fair claim is no measurable cost, not faster. Size is a tie: FrameMeter 1.2 KB gzipped, stats.js 1.1 KB.
