**Against the browser's gzip and other LZ4 libraries, cloud-browser runs.** 4 MB of made-up web-server log lines (JSON), a fresh page each time, median of 3 pages; steady is the middle of the last 4 of 5 calls. Shared 4-core cloud machine, not a laptop; gaps under about 10% are noise. lz4-kit 1.0.0 (LZ4 1.11.1), fast mode. No phone or laptop run yet.

Compared: lz4-kit against the browser's gzip (compress, ms, lower is faster).

<!-- title: lz4-kit compresses 4 MB of logs in 11 to 13 ms against 39 to 51 for the browser's gzip -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| lz4-kit | 11.6 | 10.9 | 13 |
| browser gzip | 41.8 | 39.3 | 51 |

Compared: lz4-kit against the browser's gzip (decompress, ms, lower is faster).

<!-- title: lz4-kit decompresses the same data in 5 to 6 ms against 8.5 to 14 for the browser's gzip -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| lz4-kit | 4.8 | 5.4 | 6 |
| browser gzip | 8.5 | 10.4 | 14 |

Compared: lz4-kit's fast frame against the browser's gzip (output size in bytes, smaller is better). This is where lz4-kit loses.

<!-- title: In fast mode, lz4-kit's output is 1.7 to 1.9 times the size of the browser's gzip -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| browser gzip | 511510 | 549465 | 542370 |
| lz4-kit | 955395 | 955395 | 955395 |

Compared: lz4-kit against lz4js 0.2.0 and lz4-wasm 0.9.2 (compress, steady ms, lower is faster).

<!-- title: Against other LZ4 libraries, lz4-kit compresses in 9.5 to 11 ms: 1.2 to 1.7 times faster than lz4js and level with lz4-wasm -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| lz4-kit | 9.8 | 9.5 | 11 |
| lz4-wasm | 8.7 | 10.7 | 9 |
| lz4js | 17 | 15.1 | 13 |

Compared: lz4-kit against lz4js 0.2.0 and lz4-wasm 0.9.2 (decompress, steady ms, lower is faster).

<!-- title: Against other LZ4 libraries, lz4-kit decompresses in 3.5 to 5 ms: 2.6 to 3.1 times faster than lz4js and level with lz4-wasm -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| lz4-kit | 4.7 | 5.0 | 3.5 |
| lz4-wasm | 4.3 | 4.5 | 5 |
| lz4js | 13.8 | 13.1 | 11 |

lz4-wasm and gorhill/lz4-wasm tie or are slightly ahead on speed in some browsers, so there is no speed-win claim against them. What lz4-kit adds is the standard `.lz4` frame, a content checksum, levels 1 to 12 and the official LZ4 library at the fixed 1.11.1 release.
