**Guessing during an import, cloud-browser runs.** A simulated progressive Sankey import: 40 chunks of 4 ms of parsing each, a first guess (a full layout of the data so far) when allowed, then the final layout. Total time from start to the final picture, the median of runs, the same page for every way.

Compared: three ways to show guesses during the same import (total ms).

<!-- title: GuessGate at 10% keeps a progressive import at 265 to 288 ms, the same as no guesses, while a guess after every chunk takes 1,448 to 1,542 ms -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| guess after every chunk | 1447.7 | 1489.6 | 1542 |
| no guesses | 282.6 | 266.6 | 264 |
| GuessGate at 10% | 282.7 | 265.0 | 288 |
