**Guessing during an import, cloud-browser runs.** A simulated progressive Sankey import: 40 chunks of 4 ms of parsing each, a first guess (a full layout of the data so far) when allowed, then the final layout. Total time from start to the final picture, the median of 5 pages (9 in Firefox), the same page for every way. The same page against itself differs by about 10%.

Compared: three ways to show guesses during the same import (total ms).

<!-- title: GuessGate at 5% keeps a progressive import at 254 to 258 ms, the same as no guesses within noise, while a guess after every chunk takes 1,359 to 1,607 ms -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| guess after every chunk | 1358.7 | 1456.4 | 1607 |
| no guesses | 267.3 | 270 | 249 |
| GuessGate at 5% | 254.2 | 258.4 | 255 |
