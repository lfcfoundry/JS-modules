**Against break_infinity.js, cloud-browser runs.**

Compared: idle-core against break_infinity.js (price of 10 more copies and copies 5,000 buys, microseconds per call, lower is faster).

<!-- title: idle-core prices 10 copies and counts what 5,000 buys 3.5 to 5 times faster than break_infinity.js, in 7,530 bytes against 16,603 -->
| way | Chromium 155 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| idle-core, price of 10 copies | 0.10 | 0.15 | 0.10 |
| break_infinity.js 2.2.0, price of 10 copies | 0.52 | 0.70 | 0.50 |
| idle-core, copies 5,000 buys | 0.17 | 0.25 | 0.20 |
| break_infinity.js 2.2.0, copies 5,000 buys | 0.58 | 0.85 | 0.60 |

Cloud-browser runs (shared machine, not the laptop), median of 5 rounds of 7 timings of 20,000 calls, one library per page. Where it loses: idle-core rounds each copy's price up (464 for 10 copies at base 15, 15% rise, 3 owned) where the plain geometric sum gives 463.19, it does not go past 1e300 where break_infinity.js reaches about 1e9e15, and only these two sums were measured.
