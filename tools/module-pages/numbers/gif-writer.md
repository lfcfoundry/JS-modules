**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: gif-writer against gifenc and gif.js (30 frames of 320 x 240).

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
