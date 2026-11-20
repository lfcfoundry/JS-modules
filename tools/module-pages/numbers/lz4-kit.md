**Against the browser's gzip and other LZ4 libraries, cloud-browser runs.** 4 MiB of made-up web-server log lines (JSON), median of 3 pages per browser, each timed over a batch of at least 60 ms. Shared 4-core cloud machine, not a laptop; gaps under about 10% are noise. lz4-kit 1.1.0 (LZ4 1.11.1). "view" returns a window into the library's memory without a copy (valid until the next call, like gorhill/lz4-wasm); "copy" returns a private copy (lz4-kit's default). Page: `bench/laptop-tester.html`. No phone or laptop run yet.

Compared: every library, compress 4 MiB (ms, lower is faster).

<!-- title: lz4-kit compresses 4 MiB in 5.8 to 6.9 ms with the view option: level with the fastest other LZ4 library in Chromium, ahead of it in Firefox and WebKitGTK, and 5.0 to 6.6 times faster than the browser's gzip -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| browser gzip | 33.7 | 38.0 | 43.0 |
| lz4js 0.2.0 | 15.2 | 14.1 | 11.8 |
| lz4-wasm 0.9.2 | 8.9 | 9.9 | 8.6 |
| gorhill/lz4-wasm (view) | 6.7 | 8.9 | 7.4 |
| lz4-kit (copy) | 7.2 | 7.3 | 7.3 |
| lz4-kit (view) | 6.8 | 5.8 | 6.9 |

Compared: every library, decompress 4 MiB (ms, lower is faster).

<!-- title: lz4-kit decompresses 4 MiB in 1.5 to 1.7 ms with the view option: 2.0 to 2.5 times faster than every other LZ4 library and 4 to 9 times faster than the browser's gzip -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| browser gzip | 6.7 | 8.8 | 13.0 |
| lz4js 0.2.0 | 12.7 | 13.1 | 7.9 |
| lz4-wasm 0.9.2 | 4.8 | 4.7 | 3.6 |
| gorhill/lz4-wasm (view) | 3.4 | 4.2 | 3.7 |
| wasm-lz4 2.0.0 | 4.4 | 4.3 | 3.0 |
| lz4-kit (copy) | 3.8 | 3.8 | 2.1 |
| lz4-kit (view) | 1.6 | 1.7 | 1.5 |

In the default copy mode lz4-kit compresses 4 MiB of logs in 7.2 to 7.3 ms against 34 to 43 for the browser's gzip. With lz4-kit's default private copy, compress ties gorhill/lz4-wasm in Chromium and WebKitGTK and is ahead in Firefox, and decompress is level with gorhill and wasm-lz4 in Chromium and Firefox and ahead in WebKitGTK. gzip makes files 1.7 to 1.9 times smaller on these logs; lz4-kit is the speed pick. gorhill/lz4-wasm has no frame, levels or checksum; wasm-lz4 only decompresses.

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
