**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: gpu-blur against the canvas filter blur and StackBlur (2048 x 2048, radius 24, ms).

| way | ms |
|---|---:|
| gpu-blur (WebAssembly route) | 189 |
| canvas filter blur() | 22 |
| StackBlur | 174 |

**Speed is not the strength here; identical output is.** gpu-blur gives the same bytes on every route, which the browser's own blur does not promise. The browser's blur is faster, about 8x on this picture. gpu-blur picks WebGL 2 or WebAssembly when it starts. In this run it chose WebAssembly because the WebGL 2 probe took 6.0 ms against 1.0 ms, and the route can change between runs on the same laptop.


**New in 1.0.1: about a third faster in WebAssembly, same picture.** The code thread's cloud-browser runs (Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6 on a shared machine, not noise-guarded, not the laptop). A laptop run will replace these.

A 16-bit WebAssembly kernel takes 0.60 to 0.80 of the time at 640 x 360 and 1920 x 1080 in all three browsers, and gives exactly the same picture. The browser's own canvas blur is still faster where it exists; identical output on every route remains gpu-blur's strength.
