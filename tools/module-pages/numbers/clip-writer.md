**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: clip-writer against webm-muxer and mp4-muxer (250 pictures).

| format | writer | ms | file bytes |
|---|---|---:|---:|
| WebM | clip-writer writeWebm | 0.3 | 148,257 |
| | webm-muxer | 0.6 | 155,270 |
| MP4 | clip-writer writeMp4 | 0.033 | 119,014 |
| | mp4-muxer | 0.2 | 119,126 |

WebM is about 2x faster with a 4.5% smaller file. MP4 is about 6x faster at the same size.
