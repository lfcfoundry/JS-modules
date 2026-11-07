**Against driver.js, Shepherd.js and Intro.js, cloud-browser runs.**

Compared: spotlight-tour against driver.js, Shepherd.js and Intro.js (six-step tour, ms, lower is faster).

<!-- title: spotlight-tour moves to the next step 2.7 to 3.8 times as fast as the nearest tour libraries in Chromium and WebKitGTK -->
| way | Chromium 155 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| spotlight-tour, next step | 0.4 | 1.9 | 0.6 |
| driver.js 1.10.2, next step | 1.2 | 2.6 | 1.8 |
| Shepherd.js 15.3.0, next step | 1.4 | 2.9 | 1.6 |
| Intro.js 8.6.0, next step | 1.5 | 2.6 | 1.8 |

Cloud-browser runs (shared machine, not the laptop), medians of 5 fresh pages by 11 tours (Firefox: mean of 39 tours), eight targets. Firefox and WebKitGTK clocks step 1 ms, so read differences under 1 ms there as ties. spotlight-tour is about 23% of the size of driver.js (7.1 KB against 31.0 KB minified with stylesheets) but has far fewer features. First start was not faster everywhere: WebKitGTK 4.0 ms against 3.0 for driver.js.
