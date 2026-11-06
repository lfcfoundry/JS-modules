**Measured on a real laptop.** Laptop (Windows, 16 cores, screen scale 1.25), single runs with apps open, 2026.10.31 11:10 PM ET. First decode in a fresh frame, load and wasm compile included, median of 7. The input is the README's: 400,000 bytes of JavaScript, order 6, 16 MB. Lower is better.

| Browser | Plain JS | Default (wasm) | Times as fast |
|---|---:|---:|---:|
| Laptop Firefox 160 | 132.0 ms | 74.0 ms | 1.78x |
| Laptop Chromium 156 | 129.3 ms | 68.6 ms | 1.88x |

**New in 1.4.0: a faster WebAssembly decoder (build E), same bytes out.** Laptop run (Firefox 160, Chromium 156), new time divided by old time, so lower is faster. Output bytes are unchanged and the program grows by 421 bytes to 9,738 bytes. The default file is 47,533 bytes (16,663 gzipped).

<!-- title: ppmd-decode 1.4.0 first decode takes 0.71 of the old time in Firefox and 0.92 in Chromium -->
| Browser | First decode | Repeat decode |
|---|---:|---:|
| Laptop Firefox 160 | 0.71 | 0.84 |
| Laptop Chromium 156 | 0.92 | 0.92 |

Cloud-browser runs (shared machine, not the laptop), first decode of 400 KB of text with the default file: Chromium 155 about 49 ms (was 65), Firefox 158 50 to 60 ms (was 65), WebKitGTK 2.52.6 about 50 ms (was 55 to 70). Packed pages made with ppmd-pack 2.0.3 now decode in 64 KB steps. The 7-Zip-as-WebAssembly row elsewhere on this page was measured on a different page, so do not compare it directly.
