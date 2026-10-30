**Measured on a real laptop: Firefox 160, 16 cores, 2026.10.30.** Medians; lower is better for every time and size. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: clip-writer WebM output against webm-muxer.

| way | ms | file bytes |
|---|---:|---:|
| clip-writer writeWebm | 0.3 | 42,648 |
| webm-muxer | 0.9 | 49,660 |

clip-writer is about 3x faster here and its file is 14% smaller. The MP4 comparison against mp4-muxer is not in yet: the first runs failed on timestamps and are being repeated.
