**Against the browser's gzip and other LZ4 libraries, cloud-browser runs.** 4 MiB of made-up web-server log lines (JSON), median of 3 pages per browser, each timed over a batch of at least 60 ms. Shared 4-core cloud machine, not a laptop; gaps under about 10% are noise. lz4-kit 1.1.1 (LZ4 1.11.1), every row measured again on 2026-11-21 in one session. "view" returns a window into the library's memory without a copy (valid until the next call, like gorhill/lz4-wasm); "copy" returns a private copy (lz4-kit's default). Page: `bench/laptop-tester.html`. No phone or laptop run yet.

Compared: every library, compress 4 MiB (ms, lower is faster).

<!-- title: lz4-kit compresses 4 MiB in 6.4 to 6.6 ms with the view option: 20 to 36% faster than the fastest other LZ4 library in every test browser, and 7.3 to 7.9 times faster than the browser's gzip -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| browser gzip | 51.1 | 46.8 | 52.0 |
| lz4js 0.2.0 | 17.6 | 16.7 | 15.8 |
| lz4-wasm 0.9.2 | 10.1 | 11.4 | 11.1 |
| gorhill/lz4-wasm (view) | 8.3 | 10.0 | 9.8 |
| lz4-kit (copy) | 7.1 | 7.1 | 6.7 |
| lz4-kit (view) | 6.6 | 6.4 | 6.6 |

Compared: every library, decompress 4 MiB (ms, lower is faster).

<!-- title: lz4-kit decompresses 4 MiB in 1.4 to 1.6 ms with the view option: 2.6 to 3.5 times faster than every other LZ4 library and 7 to 9 times faster than the browser's gzip -->
| way | Chromium 156 | Firefox 158 | WebKitGTK 2.52.6 |
|---|---:|---:|---:|
| browser gzip | 10.1 | 10.9 | 14.0 |
| lz4js 0.2.0 | 15.6 | 14.6 | 12.0 |
| lz4-wasm 0.9.2 | 5.4 | 5.1 | 4.7 |
| gorhill/lz4-wasm (view) | 4.5 | 4.8 | 4.4 |
| wasm-lz4 2.0.0 | 5.0 | 4.9 | 4.0 |
| lz4-kit (copy) | 4.0 | 4.0 | 2.7 |
| lz4-kit (view) | 1.4 | 1.6 | 1.5 |

In the default copy mode lz4-kit compresses 4 MiB of logs in 6.7 to 7.1 ms against 47 to 52 for the browser's gzip. Even with its default private copy, lz4-kit compresses 15 to 31% faster than gorhill/lz4-wasm's view and decompresses 11 to 39% faster. gzip makes files 1.7 to 1.9 times smaller on these logs; lz4-kit is the speed pick. gorhill/lz4-wasm has no frame, levels or checksum; wasm-lz4 only decompresses.

Compared: output size for the same 4 MB (bytes, smaller is better). This is where lz4-kit loses to gzip.

<!-- title: Output size: lz4-kit's fast mode is 1.7 to 1.9 times the size of the browser's gzip, and even level 12 is bigger -->
| way | Output size, bytes |
|---|---:|
| browser gzip (Chromium 156) | 511510 |
| lz4-wasm | 984527 |
| lz4js | 965955 |
| gorhill/lz4-wasm block | 960429 |
| lz4-kit, fast frame | 955395 |
| lz4-kit, fast block | 847254 |
| lz4-kit, level 9 | 664534 |
| lz4-kit, level 12 | 646725 |

The browser's gzip made 549,465 bytes in Firefox 158 and 542,370 in WebKitGTK 2.52.6; the LZ4 outputs are the same in every browser. Level 9 and 12 take 110 to 290 ms for 4 MB, slower than gzip here.
