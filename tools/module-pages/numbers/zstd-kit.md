**Measured on real files: cloud Chromium 156.0.8078.79, Firefox 158.0 and WebKitGTK 2.52.6, one browser at a time, 2026.11.22.** The first 4 MiB of the retail e-commerce CSV, the SEC 2026 Q1 numbers file and the SBA assistance CSV, level 3, median of 5 runs inside a fresh page (3 for gzip and fzstd). Lower is faster. fzstd 0.1.1 reads the same frames.

Compared: zstd-kit against fzstd and the browser's gzip on real files (ms; Chromium / Firefox / WebKitGTK).

<!-- title: zstd-kit decompresses 4 MiB of real data 1.9 to 6.4 times faster than fzstd and writes files 6% to 40% smaller than gzip -->
| real file | zstd-kit decompress | fzstd decompress | zstd-kit compress | browser gzip compress | zstd size / gzip size |
|---|---|---|---|---|---|
| Retail CSV | 6.1 / 6 / 6 | 39 / 15 / 18 | 17.2 / 13 / 15 | 80.5 / 46 / 66 | 0.68 |
| SEC numbers | 7.5 / 6 / 6 | 14.5 / 13 / 16 | 10.8 / 10 / 10 | 49.7 / 35 / 47 | 0.94 |
| SBA CSV | 3.6 / 4 / 3 | 16.2 / 10 / 7 | 7.5 / 6 / 7 | 38.1 / 17 / 40 | 0.60 |

Level 3 frames are smaller than gzip on all three real files (0.60 to 0.94 of its size, Chromium sizes), and 2.8 to 8 times faster to write. The generated-log tables below (frames 5 to 10% bigger than gzip) are earlier measurements and were not re-run. Harness and raw results: `tools/real-corpus`.

**Against fzstd and the browser's own gzip, cloud-browser runs.** 4 MB of generated web-server log lines (JSON; earlier measurement, not re-run on real files), a fresh page each time, median of 3 pages; warm is the middle of the last 4 calls. Shared 4-core cloud machine, not a laptop. Lower is faster.

Compared: zstd-kit against fzstd 0.1.1 and the browser's gzip (decompress, warm, ms).

<!-- title: zstd-kit decompresses 4 MB of logs in 7 to 9 ms against 24 to 26 for fzstd and 18 to 22 for the browser's gzip -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| zstd-kit | 7 | 9 | 8 |
| browser gzip | 18.2 | 22 | 20 |
| fzstd | 24.5 | 24 | 26 |

Compared: zstd-kit level 3 against the browser's gzip (compress, ms).

<!-- title: zstd-kit compresses the same 4 MB in 31 to 52 ms against 91 to 100 for the browser's gzip -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| zstd-kit, level 3 | 33.4 | 31 | 52 |
| browser gzip | 100.3 | 91 | 94 |

Compared: zstd-kit level 3 against the browser's gzip (compressed size in bytes, smaller is better). This is where zstd-kit loses.

<!-- title: At level 3, zstd-kit's files are 5 to 10% bigger than the browser's gzip, and its decoder is 34 KB gzipped against fzstd's 3.8 KB -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| browser gzip | 726865 | 750097 | 768375 |
| zstd-kit, level 3 | 804889 | 804889 | 804889 |
