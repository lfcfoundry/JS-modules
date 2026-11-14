**Against fzstd and the browser's own gzip, cloud-browser runs.** 4 MB of web-server log lines (JSON), a fresh page each time, median of 3 pages; warm is the middle of the last 4 calls. Shared 4-core cloud machine, not a laptop. Lower is faster.

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
