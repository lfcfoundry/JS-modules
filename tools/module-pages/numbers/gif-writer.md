**Measured on real game frames: cloud Chromium 156.0.8078.79, Firefox 158.0 and WebKitGTK 2.52.6, one browser at a time, 2026.11.22.** 30 real screenshots (400 x 300) of the shipped Fancy Banana game, taken 100 ms apart and 300 ms apart (about 7 percent of the pixels change from one frame to the next). Each library gets the same 30 frames and a palette built from the same 8 spread frames. Median of 5 runs in a fresh page; times are Chromium / Firefox / WebKitGTK. This replaces the earlier generated captures. The Pineapple Defense start screen was a static card (no frame changed), so it was left out. gif.js was not re-run.

Compared: gif-writer against gifenc 1.0.3 on real game frames (whole animation, ms and bytes).

<!-- title: On real game frames, gif-writer's file is 27% to 29% of gifenc's size and it writes it 3.3 to 5.7 times faster -->
| frames | gif-writer ms | gifenc ms | gif-writer bytes | gifenc bytes |
|---|---|---|---|---|
| Banana, 100 ms apart | 82.5 / 95 / 80 | 342.7 / 543 / 314 | 207,855 | 782,433 |
| Banana, 300 ms apart | 83 / 103 / 92 | 345.6 / 523 / 305 | 224,544 | 775,767 |

gifenc was 3.3 to 5.7 times slower. Both files come from the same frames; the pictures were not compared side by side here (gif-writer's own test checks every pixel). Harness: `tools/real-corpus` (needs the game repository beside this one).

**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: gif-writer against gifenc and gif.js (30 frames of 320 x 240).

<!-- title: On generated captures (earlier laptop run), gif-writer is at least 5 times smaller and 6 to 31 times faster than gifenc and gif.js -->
| animation | writer | ms | bytes |
|---|---|---:|---:|
| typical capture (sprite over still background) | gif-writer (one palette) | 10 | 40,098 |
| | gifenc (palette per frame) | 105 | 194,736 |
| | gifenc (one palette) | 60 | 201,160 |
| | gif.js (2 workers) | 311 | 393,239 |
| worst case (every pixel changes) | gif-writer (one palette) | 294 | 731,927 |
| | gifenc (one palette) | 960 | 720,760 |
| | gif.js (2 workers) | 491 | 707,303 |
| | gifenc (palette per frame) | 22,879 | 618,980 |

Typical capture: about 5x smaller and 6x to 31x faster. Worst case: gif-writer's file is 2% larger than gifenc with one palette.

**Thorough palette (1.6.0, 8:50 PM run).** Building the palette from pictures spread across the animation takes 822 ms instead of 577 ms and makes the file 1.1% smaller. Using all 30 pictures takes 1,169 ms and makes it 1.8% smaller.


**Version against version, real laptop, ungoogled Chromium 156 (Windows), 16 cores, 2026.10.30, 9:47 PM.** Medians; lower is better. One browser on one machine.

| way (30 noisy pictures, 320 x 240) | ms | bytes |
|---|---:|---:|
| default palette, 1.5.1 | 444 | 864,532 |
| default palette, 1.6.0 | 471 | 864,532 |
| thorough palette (option), 1.6.0 | 597 | 863,825 |

The default output is the same bytes as 1.5.1. On this noisy worst case the thorough palette saves under 0.1% for about 35% more time.


**Same tests in Firefox 160 (Windows), real laptop, 16 cores, 2026.10.30, 9:41 PM.** Medians; lower is better.

| way (30 noisy pictures, 320 x 240) | ms | bytes |
|---|---:|---:|
| default palette, 1.5.1 | 340 | 864,532 |
| default palette, 1.6.0 | 334 | 864,532 |
| thorough palette (option), 1.6.0 | 479 | 863,825 |

Same bytes by default. The thorough palette saves under 0.1% for about 40% more time on this worst case.


**New in 1.6.1: faster picture effects, same pictures.** Cloud-browser runs (Chromium, Firefox and WebKitGTK on a shared machine, not noise-guarded, not the laptop). At 1920 x 1080 the time is 0.73 to 0.77 of before for glow, 0.74 to 0.78 for Soft dream, 0.79 to 0.85 for blur and 0.87 to 0.92 for sharpen. A laptop run will replace these.

**Palette search on a real laptop, WebAssembly against the JavaScript code (30 pictures of 640 x 480), 2026.11.14, 9:26 AM Eastern, 16 cores.** Medians of 9 rounds, ms, lower is faster. One run per browser on one machine.

| pictures | Firefox 161 JavaScript | Firefox 161 WebAssembly | Chrome 157 JavaScript | Chrome 157 WebAssembly |
|---|---:|---:|---:|---:|
| flat game picture | 11.3 | 8.7 | 7.6 | 7.8 |
| scrolling bands | 10.7 | 6.7 | 7.1 | 6.4 |
| photo-like | 284 | 176 | 283 | 170 |

WebAssembly is 1.3 to 1.6 times faster in Firefox and 1.1 to 1.7 times faster in Chrome, except flat game pictures in Chrome, where the two are level (0.97x).
