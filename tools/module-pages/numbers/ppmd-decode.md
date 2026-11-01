**Measured on a real laptop.** Laptop (Windows, 16 cores, screen scale 1.25), single runs with apps open, 2026.10.31 11:10 PM ET. First decode in a fresh frame, load and wasm compile included, median of 7. The input is the README's: 400,000 bytes of JavaScript, order 6, 16 MB. Lower is better.

| Browser | Plain JS | Default (wasm) | Times as fast |
|---|---:|---:|---:|
| Laptop Firefox 160 | 132.0 ms | 74.0 ms | 1.78x |
| Laptop Chromium 156 | 129.3 ms | 68.6 ms | 1.88x |
