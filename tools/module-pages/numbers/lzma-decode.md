**Measured on a real laptop.** Laptop (Windows, 16 cores, screen scale 1.25), single runs with apps open, 2026.10.31 11:10 PM ET. First decode in a fresh frame, load and wasm compile included, median of 7. The input is a 569,513-byte slice of the current Pineapple Defense page, with 193,108 bytes of LZMA. That is newer than the README's page (141,872 bytes of LZMA), so the times are not directly comparable. Lower is better.

| Browser | Plain JS | Default (wasm) | Times as fast |
|---|---:|---:|---:|
| Laptop Firefox 160 | 63.0 ms | 29.0 ms | 2.17x |
| Laptop Chromium 156 | 58.5 ms | 19.7 ms | 2.97x |
