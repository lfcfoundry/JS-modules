**Measured on a real laptop.** Laptop (Windows, 16 cores, screen scale 1.25), single runs with apps open, 2026.10.31 11:10 PM ET. First decode in a fresh frame, load and wasm compile included, median of 7. The input is a 569,513-byte slice of the current Pineapple Defense page, with 193,108 bytes of LZMA. That is newer than the README's page (141,872 bytes of LZMA), so the times are not directly comparable. Lower is better.

| Browser | Plain JS | Default (wasm) | Times as fast |
|---|---:|---:|---:|
| Laptop Firefox 160 | 63.0 ms | 29.0 ms | 2.17x |
| Laptop Chromium 156 | 58.5 ms | 19.7 ms | 2.97x |

**New in 1.5.0: faster JavaScript and WebAssembly decoders, same bytes out.** Owner's laptop runs (Firefox 160, Chromium 156), new time divided by old time, so lower is faster.

<!-- title: lzma-decode 1.5.0 unpacks the second time in 0.56 to 0.64 of the old time with the JavaScript decoder, and 0.87 to 0.88 with WebAssembly -->
| way | Firefox 160 | Chromium 156 |
|---|---:|---:|
| JavaScript decoder, first unpack | 0.78 | 0.93 |
| JavaScript decoder, second unpack | 0.56 | 0.64 |
| WebAssembly build, first unpack | 0.90 | 0.86 |
| WebAssembly build, second unpack | 0.88 | 0.87 |

Where it is not a win: in WebKitGTK the first big unpack with the JavaScript decoder is 5 to 14% slower than before, then about a third faster on later unpacks.
