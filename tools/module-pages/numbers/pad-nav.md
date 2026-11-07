**Against js-spatial-navigation, cloud-browser runs.**

Compared: pad-nav against js-spatial-navigation (one focus move among 1,000 buttons in a 25 by 40 grid, ms, lower is faster).

<!-- title: One focus move among 1,000 buttons: pad-nav takes 0.69 of js-spatial-navigation's time in Chromium, 0.80 in Firefox and 0.95 in WebKitGTK -->
| way | Chromium 155 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| pad-nav 1.1.1 | 1.52 | 0.86 | 3.45 |
| js-spatial-navigation 1.0.1 | 2.21 | 1.07 | 3.62 |

Cloud-browser runs (shared machine, not the laptop), right then left, alternating, median of 5 rounds, one library per page. The WebKitGTK margin is small. Both libraries are dominated by reading the position of every button. Run on one desktop, not on a phone. js-spatial-navigation is more complete (named sections, nested rules); pad-nav is the small, panel-scoped one that reads the gamepad itself, and is 13,170 bytes against 11,211 minified.
