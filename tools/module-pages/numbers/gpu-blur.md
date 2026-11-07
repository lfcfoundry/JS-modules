**Fair timing against the browser's own blur, 2026.11.06 (gpu-blur 1.3.4).** Laptop Firefox 160, laptop Chrome 156 and a phone (Chrome 156); single runs, 2048 x 2048, radius 24, every way timed to a finished picture, lower is better. The browser's blur is lazy, so an earlier test that timed it before it drew anything made it look about 8x faster than it is. That old chart is gone.

Compared: gpu-blur against the browser's canvas filter when you need the pixels as bytes (ms, laptop and phone, 2048 x 2048, radius 24).

<!-- title: gpu-blur gives you the blurred pixels 2 to 3.3 times faster than the browser's own filter in Firefox and Chrome on a laptop and in Chrome on a phone -->
| device | way | ms |
|---|---|---:|
| Firefox laptop | gpu-blur (helpers) | 12 |
|  | canvas filter blur() | 28 |
| Chrome laptop | gpu-blur (helpers) | 11.6 |
|  | canvas filter blur() | 37.9 |
| Phone | gpu-blur (helpers) | 42 |
|  | canvas filter blur() | 83.5 |

Compared: gpu-blur 1.4.2 against the browser's canvas filter when you only draw the result (ms, 2048 x 2048, radius 24, lower is faster).

<!-- title: Drawing the result, gpu-blur is now 1.2 to 1.6 times faster than the browser's own filter in Firefox and Chrome on a laptop and in Chrome on a phone -->
| device | way | ms |
|---|---|---:|
| Firefox laptop | gpu-blur auto | 14 |
|  | canvas filter blur() | 23 |
| Chrome laptop | gpu-blur auto | 21 |
|  | canvas filter blur() | 34 |
| Chrome phone | gpu-blur auto | 61 |
|  | canvas filter blur() | 75 |

**What else to know.** The browser's blur is lazy, so it has to be timed to a finished picture, as above. gpu-blur's strength besides speed: identical output on every route, which the browser's blur does not promise. These are the owner's laptop and phone runs, not the three cloud test browsers.


**Newest version against the browser's own blur (gpu-blur 1.4.2).** Owner's laptop and phone runs, 2048 x 2048, radius 24, timed to a finished picture. Getting the pixels out as bytes is 2.2 to 3.3 times faster than the browser's own blur in Firefox and Chrome on a laptop and in Chrome on a phone. Drawing the result is 1.2 to 1.6 times faster on all three. With `out: 'bitmap'` the Firefox laptop result is ready in 20 ms against 25 ms for the browser's blur.


**New in 1.3.6: a drawn start-up test picks the faster way for small and mid-size pictures.** Owner's laptop and phone runs (Chrome 156), drawn canvas, ms, lower is faster. Auto now runs a short drawn test for pictures under a million pixels, so it stops choosing the slower route there.

<!-- title: Auto now blurs 640 x 360 and 960 x 540 pictures in about half the time in Chrome on the laptop, and 20 percent faster on the phone -->
| way | 640 x 360 | 960 x 540 |
|---|---:|---:|
| Chrome laptop, 1.3.5 | 5.1 | 9.8 |
| Chrome laptop, 1.3.6 | 2.8 | 4.8 |
| Phone, 1.3.5 | 15.7 | 22.2 |
| Phone, 1.3.6 | 12.6 | 17.4 |

Where it loses: on the phone a 480 x 270 picture is 1.1 ms slower in 1.3.6 (the start-up test costs more than it saves at that size). The Firefox laptop picks are unchanged, so the browser's own filter still wins there when you only draw the result.


**New in 1.3.5: wide blurs on the card way run in two stages, same bytes.** Laptop runs (Firefox 160, Chrome 156), 1080p drawn canvas, two stages divided by one stage, lower is faster. WebGL 2 boxes of radius 24 and up are split into two stages.

<!-- title: Two-stage wide blurs take 0.58 to 0.71 of the old time at radius 50 and 0.91 to 0.95 at radius 24 -->
| Radius | Firefox 160 | Chrome 156 |
|---|---:|---:|
| 24 | 0.91 | 0.95 |
| 50 | 0.71 | 0.58 |

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
