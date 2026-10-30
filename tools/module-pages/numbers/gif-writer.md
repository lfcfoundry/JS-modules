**Measured on a real laptop: Firefox 160, 16 cores, 2026.10.30.** Medians; lower is better for every time and size. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: gif-writer against gifenc and gif.js (30 frames of 320 x 240).

| animation | writer | ms | bytes | time / gif-writer | bytes / gif-writer |
|---|---|---:|---:|---:|---:|
| noisy (every pixel changes, worst case) | gif-writer (one palette) | 610 | 731,927 | 1.00x | 1.00x |
| noisy | gifenc (palette per frame) | 29,505 | 618,980 | 48.37x | 0.85x |
| noisy | gifenc (one palette) | 1,334 | 720,760 | 2.19x | 0.98x |
| noisy | gif.js (2 workers) | 827 | 707,303 | 1.36x | 0.97x |
| sprite over still background (typical capture) | gif-writer (one palette) | 17 | 40,098 | 1.00x | 1.00x |
| sprite | gifenc (palette per frame) | 159 | 194,736 | 9.35x | 4.86x |
| sprite | gifenc (one palette) | 93 | 201,160 | 5.47x | 5.02x |
| sprite | gif.js (2 workers) | 495 | 393,239 | 29.12x | 9.81x |
Worst case: gif-writer is the fastest one-palette writer but its file is 2% to 3% larger than gifenc one palette and gif.js (15% larger than gifenc per frame, which is 48x slower). Typical capture: 5x to 10x smaller and 5x to 29x faster.
