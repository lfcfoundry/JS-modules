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


**New in 1.1.0: blur on several cores (opt-in), same bytes.** Cloud-browser runs (shared machine, not noise-guarded, not the laptop). The helpers route (`route: 'helpers'` or `workers: n`) takes 0.51 to 0.85 of the one-thread WebAssembly time in Chromium and 0.50 to 0.85 in Firefox; WebKitGTK is about even. Together with 1.0.1's 16-bit kernel, a 4K blur takes roughly 0.35 of the 1.0.0 time in Chromium and Firefox. It needs `worker-src blob:` and falls back to WebAssembly without it. A laptop run will replace these.


**New in 1.2.0: a shared-memory threads route (opt-in), same bytes.** Cloud-browser runs (4 cores, shared machine, not noise-guarded, not the laptop). `route: 'threads'` blurs on several cores sharing one memory, but only on pages served with the two cross-origin isolation headers, so the offline apps never use it. WebKitGTK cannot use it and runs the helpers route instead.

Threads time divided by helpers time: Chromium 0.78 to 1.12, Firefox 0.74 to 1.14 (most sizes 0.8 to 0.9). Fastest multicore route divided by 1.0.0's one-thread WebAssembly: Chromium 0.32 to 0.52, Firefox 0.32 to 0.49, WebKitGTK (helpers) 0.27 to 0.43. A laptop run will replace these.


**New in 1.2.1 to 1.2.3: helpers use every core, a fix, and faster repeat blurs.** Cloud-browser runs (shared machine, not noise-guarded, not the laptop). 1.2.1 lets the helpers route use every core. 1.2.2 fixes a bug where a canvas over about 0.5 megapixel blurred on one thread came back with its top rows blank. 1.2.3 keeps the helpers' working memory between calls, so repeat blurs on the helpers route take less time than in 1.2.2: 1.22 to 1.31x faster in Chromium, 1.10 to 1.34x in Firefox, and 0.99 to 1.09x in WebKitGTK (about even).


**New in 1.3.0: blur into your own pixel array.** Cloud-browser runs (4 cores, shared machine, not noise-guarded, not the laptop). With `out: 'pixels'`, `opts.into` takes your own `Uint8ClampedArray` or `Uint8Array` (width x height x 4), and every route writes into it, so no new array is made per blur. Same bytes in all three browsers.

| Bytes in, radius 12, 960 x 540 up to 4K (x faster, higher is better) | Chromium | Firefox | WebKitGTK |
|---|---:|---:|---:|
| Helpers with kept bands + `into`, against 1.2.2 | 1.19 to 1.43 | 1.47 to 1.74 | 1.09 to 1.32 |

On one thread (WebAssembly), `into` runs 0.91 to 1.49x as fast as a fresh array: slightly slower at some sizes, up to about 1.5x faster at others.
