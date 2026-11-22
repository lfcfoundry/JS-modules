**Measured on real number columns: cloud Chromium 156.0.8078.79, Firefox 158.0 and WebKitGTK 2.52.6, one browser at a time, 2026.11.22.** Two real decimal columns: 413,875 SEC 2026 Q1 statement values (3.3 MB as 64-bit numbers) and 147,846 SBA assistance award amounts (1.2 MB). `pcodec-js-pack.js` at level 8; every unpacked value was checked equal to the original. Sizes are the same in every browser; times are Chromium / Firefox / WebKitGTK.

Compared: pcodec-js against memory-compression, zstd-kit (level 3) and fflate gzip (level 6) on real decimal columns (packed bytes).

<!-- title: pcodec-js packs real decimal columns to 71% (SEC values) and 102% (SBA amounts) of gzip's size and unpacks them 4 to 10 times faster than gzip -->
| real column | pcodec-js | zstd-kit 3 | fflate gzip 6 | memory-compression |
|---|---:|---:|---:|---:|
| SEC values, bytes | 1,189,546 | 1,537,543 | 1,664,838 | 1,919,892 |
| SBA amounts, bytes | 62,326 | 83,309 | 60,886 | 134,774 |
| SEC values, unpack ms | 6 / 7 / 7 | 8.5 / 9 / 9 | 35.6 / 33 / 46 | 4.5 / 5 / 4 |
| SBA amounts, unpack ms | 1.2 / 1 / 1 | 1.8 / 2 / 2 | 4.4 / 4 / 10 | 1.5 / 1 / 2 |

Pcodec is the smallest on SEC values (0.71x of gzip and 0.62x of memory-compression) and level with gzip on SBA amounts (62,326 against 60,886), well ahead of memory-compression on both; packing is slower than memory-compression (42 against 10 ms on SEC values) and faster than gzip (196 ms). The comparison with numcodecs-wasm-pco that the page below cites could not be re-run: that package is no longer on the npm registry. Harness and raw results: `tools/real-corpus`.

**New in 1.6.2: repeated big unpacks reuse a ready array.** The code thread's cloud-browser runs (Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6 on a shared machine, not the laptop).

5,000,000 numbers unpacked again and again, every 150 ms. Time with 1.6.2 divided by time before, with its 90% range; lower is better. The Chromium run was flagged noisy (wider range), so read it as direction.

| Browser | New / old | 90% range |
|---|---:|---:|
| Chromium 155 | 0.63 | 0.61 to 0.79 |
| Firefox 158 | 0.80 | 0.76 to 0.82 |
| WebKitGTK 2.52.6 | 0.87 | 0.71 to 0.99 |

After a big unpack the page prepares one spare array of the same size while idle, and the next unpack fills it instead of asking the system for fresh memory. The spare is dropped after 4 s unused (`idleMs`); `load({ spare: false })` turns it off. Smaller unpacks are unchanged.
