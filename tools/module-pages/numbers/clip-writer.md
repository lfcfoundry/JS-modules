**Measured on a real laptop: Firefox 160 (Windows), 16 cores, 2026.10.30, 7:09 PM.** Medians; lower is better for every time, size and ratio. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: clip-writer against webm-muxer and mp4-muxer (250 pictures).

| format | writer | ms | file bytes |
|---|---|---:|---:|
| WebM | clip-writer writeWebm | 0.3 | 148,257 |
| | webm-muxer | 0.6 | 155,270 |
| MP4 | clip-writer writeMp4 | 0.033 | 119,014 |
| | mp4-muxer | 0.2 | 119,126 |

WebM is about 2x faster with a 4.5% smaller file. MP4 is about 6x faster at the same size.


**Version against version, real laptop, ungoogled Chromium 156 (Windows), 16 cores, 2026.10.30, 9:47 PM.** Medians; lower is better. One browser on one machine.

| writer (250 pictures, 320 x 240, file writing only) | ms | bytes |
|---|---:|---:|
| MP4 1.0.1 | 0.3 | 1,235,562 |
| MP4 1.3.0 | 0.3 | 1,235,562 |
| fragmented MP4 1.3.0 | 0.4 | 1,236,074 |
| MP4 with fastStart 1.3.0 | 0.4 | 1,235,562 |
| fragmented MP4 with sidx 1.3.0 | 0.3 | 1,236,166 |

Plain MP4 is the same size and speed as 1.0.1. The new fragmented and fastStart forms cost almost nothing extra.


**Same tests in Firefox 160 (Windows), real laptop, 16 cores, 2026.10.30, 9:41 PM.** Medians; lower is better.

| writer (250 pictures, 320 x 240, file writing only) | ms | bytes |
|---|---:|---:|
| MP4 1.0.1 | 0.3 | 1,235,562 |
| MP4 1.3.0 | 0.2 | 1,235,562 |
| fragmented MP4 1.3.0 | 0.2 | 1,236,074 |
| MP4 with fastStart 1.3.0 | 0.3 | 1,235,562 |
| fragmented MP4 with sidx 1.3.0 | 0.2 | 1,236,166 |

Plain MP4 is the same size, and the new forms cost nothing extra here.
