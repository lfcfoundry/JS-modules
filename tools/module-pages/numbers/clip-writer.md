**Measured on a real laptop: Firefox 160, 16 cores, 2026.10.30.** Medians; lower is better for every time and size. This is one browser on one machine, and Firefox 160 is not one of our three cloud test browsers, so treat it as direction, not a guarantee.

Compared: clip-writer WebM output against webm-muxer.

| way | ms | file bytes |
|---|---:|---:|
| clip-writer writeWebm | 0.3 | 42,648 |
| webm-muxer | 0.9 | 49,660 |

clip-writer is about 3x faster here and its file is 14% smaller. 
Compared: clip-writer MP4 output against mp4-muxer (latest laptop run, 7:09 PM, Firefox 160).

| way | ms | file bytes |
|---|---:|---:|
| clip-writer writeMp4 | 0.033 | 119,014 |
| mp4-muxer | 0.2 | 119,126 |

clip-writer is 6.8x faster here and the file is about the same size. Earlier runs failed because mp4-muxer rejected the encoder's timestamps; the page now gives both writers the same encoder settings.
