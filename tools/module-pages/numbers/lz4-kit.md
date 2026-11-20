**Against the browser's gzip and other LZ4 libraries, cloud-browser runs.** 4 MB of made-up web-server log lines (JSON), a fresh page each time, median of 3 pages; steady is the middle of the last 4 of 5 calls. Shared 4-core cloud machine, not a laptop; gaps under about 10% are noise. lz4-kit 1.0.0 (LZ4 1.11.1), fast mode. No phone or laptop run yet.

Compared: lz4-kit against the browser's gzip, lz4js 0.2.0 and lz4-wasm 0.9.2 on compressing (steady ms, lower is faster; the gzip numbers come from a separate run of the same page, in which lz4-kit took 11 to 13 ms).

<!-- title: Compressing 4 MB of logs: lz4-kit is ahead of the browser's gzip and lz4js and level with lz4-wasm -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| browser gzip | 41.8 | 39.3 | 51 |
| lz4js | 17 | 15.1 | 13 |
| lz4-wasm | 8.7 | 10.7 | 9 |
| lz4-kit | 9.8 | 9.5 | 11 |

Compared: the same libraries on decompressing (steady ms, lower is faster; the gzip numbers come from the separate run, in which lz4-kit took 5 to 6 ms).

<!-- title: Decompressing 4 MB of logs: lz4-kit is ahead of the browser's gzip and lz4js and level with lz4-wasm -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| browser gzip | 8.5 | 10.4 | 14 |
| lz4js | 13.8 | 13.1 | 11 |
| lz4-wasm | 4.3 | 4.5 | 5 |
| lz4-kit | 4.7 | 5.0 | 3.5 |

In the gzip run lz4-kit compresses 4 MB of logs in 11 to 13 ms against 39 to 51 for the browser's gzip, and decompresses in 5 to 6 ms against 8.5 to 14. Against lz4js it compresses 1.2 to 1.7 times faster and decompresses 2.6 to 3.1 times faster. lz4-wasm and gorhill/lz4-wasm tie or are slightly ahead on speed in some browsers, so there is no speed-win claim against them. What lz4-kit adds is the standard `.lz4` frame, a content checksum, levels 1 to 12 and the official LZ4 library at the fixed 1.11.1 release.

Compared: output size for the same 4 MB (bytes, smaller is better). This is where lz4-kit loses to gzip.

<!-- title: Output size: lz4-kit's fast mode is 1.7 to 1.9 times the size of the browser's gzip, and even level 12 is bigger -->
| way | Output size, bytes |
|---|---:|
| browser gzip (Chromium 156) | 511510 |
| lz4-wasm | 984527 |
| lz4js | 965955 |
| lz4-kit, fast | 955395 |
| lz4-kit, level 9 | 664534 |
| lz4-kit, level 12 | 646725 |

The browser's gzip made 549,465 bytes in Firefox 158 and 542,370 in WebKitGTK 2.52.6; the LZ4 outputs are the same in every browser. Level 9 and 12 take 110 to 290 ms for 4 MB, slower than gzip here.
