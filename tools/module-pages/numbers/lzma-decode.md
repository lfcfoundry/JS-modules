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

**New in 1.5.1: the JavaScript decoder uses 32-bit integers.** Cloud-browser runs (shared machine, not the laptop), new time divided by old time, so lower is faster. It costs 370 bytes more in the decoder (minified JavaScript 2,156 to 4,020 bytes before gzip; gzipped 1,179 to 1,167).

<!-- title: lzma-decode 1.5.1's JavaScript decoder unpacks 3 MB the first time in 0.57 to 0.71 of the old time and later unpacks in about 0.4 -->
| way | Chromium 155 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| JavaScript, first unpack after load, 3 MB text | 0.67 | 0.57 | 0.71 |
| JavaScript, next unpack, 400 KB | 0.39 | 0.44 | 0.39 |

The 1.5.0 JavaScript decoder was 5 to 14% slower than before on the first big unpack in WebKitGTK; 1.5.1 removes that, so there is no browser where the JavaScript decoder is now slower.


**Against LZMA-JS, cloud-browser runs.**

Compared: lzma-decode against LZMA-JS (first decode in a fresh page, ms, lower is faster, 197,878-byte stream).

<!-- title: lzma-decode unpacks a game page 12 to 24 times as fast as the npm LZMA decoder with WebAssembly, and 7 to 9 times with plain JavaScript -->
| way | Chromium 155 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| lzma-decode, WebAssembly | 17.5 | 22 | 19 |
| lzma-decode, plain JavaScript | 48.5 | 36 | 33 |
| LZMA-JS 2.3.2 lzma-d | 418.6 | 265 | 287 |

Cloud-browser runs (shared machine, not the laptop). The same 747,467-byte single-file game page packed with lc 3, lp 0, pb 2 and an 8 MB dictionary. LZMA-JS hands back a string for text, which is part of its time. Not measured: a phone, a stream that is not text.
