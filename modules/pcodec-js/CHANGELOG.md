# pcodec-js changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

All speeds below were measured in ungoogled-chromium 155.0.8059.39-1, Firefox 158.0 (reports 158.0b5), WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, one at a time (order of the numbers: Chromium / Firefox / WebKitGTK / GNOME Web). Node was used only for pass/fail checks.

## 1.0.1 · API 1 · 2026-10-18
No change to the code or to the bytes it writes (the three JavaScript files differ from 1.0.0 only in the version label). Checked and re-measured from scratch: the three WebAssembly programs were rebuilt from the Pcodec 1.0.4 source with our 12-line patch and came out byte for byte identical to the shipped ones (same SHA-256); the credits now list what Pcodec 1.0.4 changed; the comparison with numcodecs-wasm-pco was re-run in all four browsers (tables below and in RESULTS.md section 0b).

Tested in: ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5

Re-run of the comparison with the only other JavaScript build, numcodecs-wasm-pco 0.4.0 (converted with jco 1.39), 12 columns, 15 repeats x 3 rounds, a fresh page for each contender, one browser at a time, 0 wrong columns in every browser. Order: Chromium / Firefox / WebKitGTK / GNOME Web. Compare within this table only; this machine ran faster than the one behind the 1.0.0 numbers, and four of the 12 columns were re-downloaded from public copies of the same datasets (the sizes came out the same: smallest mode 0.23% smaller than numcodecs, as before).

| Measure (12 columns) | numcodecs-wasm-pco | pcodec-js | Better | Result |
|---|---:|---:|---|---|
| Unpack, copy made (ms) | 12.43 / 11.67 / 10.33 / 10.33 | 12.17 / 8.67 / 8.33 / 10.33 | lower | tie (2%) / 26% faster / 19% faster / tie |
| Unpack, view, no copy (ms) | not offered | 7.93 / 7.67 / 7.00 / 7.00 | lower | 36% / 34% / 32% / 32% faster than numcodecs with a copy |
| Pack, plain `pack()` (ms) | 52.4 / 57 / 45 / 55 | 42.7 / 57 / 42 / 56 | lower | 19% faster / tie / 7% faster / tie |
| Pack, `smallest` (ms) | not offered | 142.9 / 182 / 183 / 148 | lower | slower by design (tries seven settings) |
| Start-up, reader (ms) | 8.3 / 29 / 19 / 27 | 2.7 / 6 / 2 / 3 | lower | 3 to 9 times lower |
| Packed size, 12 columns (bytes) | 1,692,078 | `pack()` 1,793,004; `smallest` 1,688,178 | smaller | `pack()` 6.0% bigger; `smallest` 0.23% smaller |
| Download (gzipped) | 324,006 B | reader 68,390 B | smaller | 4.7 times smaller |

Browsers other than Chromium round timers to whole milliseconds, so treat gaps under 5% as ties. Raw files: `bench/browser/run-release.js` (the runner, new in this release) writes one JSON per browser.

## 1.0.0 · API 1 · 2026-10-18
First release, as its own module: Pcodec, a number compressor, for web pages, one file, no build step. It follows an earlier add-on for the object compressor that was never published as its own file. WebAssembly is required, with no plain-JavaScript backup (the owner's decision).

What is new compared with that add-on (440,757 B, 159,050 B gzipped). Lower is better for sizes, times and memory.

- **Tuned unpack loop.** One patch to Pcodec 1.0.4 removes the per-number bounds checks in the loop that reads each number's extra bits (about 40% of unpack time). Unpack is lower by about 6% on average: reader, view, ns per number, Chromium / Firefox / WebKitGTK / GNOME Web, two runs: 12.66 to 12.13 and 12.56 to 12.88 (a tie, within noise) / 13.34 to 12.37 and 13.01 to 12.37 / 15.30 to 13.34 and 14.32 to 13.34 / 14.64 to 13.34 and 13.99 to 13.01. The SIMD reader gains 7% / 3% / 2% / 11%. Files are about 1% smaller. Output and written bytes are identical; packing speed is unchanged. Two other changes tried (delta decode in one pass, decimal join without a branch) gave no gain and were dropped. Details: `RESULTS.md` section 4c.
- **Unpack-only file.** 168,183 B (68,390 B gzipped) against 440,757 B (159,050 B gzipped): 2.6 times smaller raw, 2.3 times smaller gzipped. The wasm program went from 326,822 B to 112,851 B.
- **Packer file is built for speed, so it is a bit bigger.** 468,019 B (184,685 B gzipped): 6.8% larger raw, 16% gzipped.
- **Packing is faster.** 12 columns: 85 against 96.3 ms in Chromium (12% faster), 90 against 107 in Firefox (16%), 93 against 107 in WebKitGTK (13%), 88 against 105 in GNOME Web (16%). Same bytes out. The other JS Pcodec build takes 80.6 / 90 / 89 / 84 ms (it is 0% to 5% faster than ours).
- **Streaming unpack** (`stream()`): a 4,000,000-number file unpacks with 6.8 MB of wasm memory, against 67.9 MB for the old add-on (10 times less), and no 32 MB result array.
- **No-copy unpack** (`view`, `into`): the 12-column test takes 12.62 against 18.84 ns per number for a copy in Chromium (33% faster), 13.01 against 15.94 in Firefox (18%), 14.32 against 16.92 in WebKitGTK (15%) and GNOME Web (15%).
- **Copy unpack** is 6% faster in Chromium than the old add-on (18.84 against 19.98 ns), 18% in Firefox (15.94 against 19.52), 12% in WebKitGTK (16.92 against 19.20) and 9% in GNOME Web (16.92 against 18.55). Whole-millisecond timer rounding outside Chromium: treat gaps under 5% as ties.
- **Faster first unpack** (`load({ warm: true })`, new): first unpack of a 100,000-number column after `load()` plus 100 ms: Chromium 2.8 against 8.8 ms (68% less), WebKitGTK 7 against 15 ms (53% less), GNOME Web 5 against 13 ms (62% less), Firefox 5 against 5 ms (no change). Costs about 15 ms of background CPU and 4,968 B of built-in data per file; off unless asked.
- **SIMD file** (`pcodec-js-fast.js`): view unpack 10.74 against 13.01 ns in Firefox (17% faster); within 3% in the other three browsers (no real gain there).
- **Smallest mode** (`pack(x, {smallest:true})`, new): tries seven encoder settings on a 20,000-number sample (the whole array up to 40,000 numbers) and keeps the best. 39 columns: 2,778,048 B against 2,892,944 B (4.0% smaller; never larger than plain). Cost: 3.2 to 3.7 times the pack time (276 ms for 12 columns in Chromium). Files still open in any Pcodec reader (39 of 39 checked in the other JS build).
- **Level guidance:** `level: 6` is 0.43% bigger than the default 8 and packs 19% faster in Chromium, 12% in WebKitGTK and 17% in GNOME Web (no change in Firefox); noisy single set.
- **Eight number types** (u16, i16, u32, i32, f32, u64, i64, f64) instead of two (f64, i32).
- **`info()`** reads the type and count from a file without unpacking it.
- **Damaged files:** 600 damaged files tried: 591 refused with a clear error, 9 decoded to different numbers (Pcodec has no checksum), 0 crashes or hangs. A trapped instance is dropped and recreated on the next call.
- **Start-up** (load to ready, ms): 6.2 / 8 / 7 / 6 for the reader (old add-on 2.6 / 8 / 5 / 5, other JS build 9.2 / 22 / 20 / 20); 10.7 / 27 / 15 / 15 for the packer file.
- **Same bytes:** `pack()` writes the identical 39 files the old add-on wrote; the reader opens files from the old add-on and from the other JS build (Pcodec 1.0.2), 39 of 39 each way.
- **Reproducible build:** `sh wasm/vendor.sh` once (fetches Pcodec 1.0.4 and applies the patch), then `sh wasm/buildall.sh`; rebuilding from a different folder gives the same wasm file (identical SHA-256, reader c48b59fa...); `Cargo.lock` and `--locked` pinned.
- **Checks:** 854 round-trip, corrupt-input, warm-up and edge-case checks pass for both readers (NaN, -0, infinity, empty, one number, wrong count, count over the limit).

Tested in: ungoogled Chromium 155.0.8059.39-1, Firefox 158.0 (reports 158.0b5), WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, one at a time (2026-10-18): the test page (491 checks) and the demo page (a million numbers back exactly) in each browser, then the benchmark in RESULTS.md. Node 22: 854 checks for the reader and for the SIMD reader. Not run: a phone, the build from source (the Pcodec source download was not allowed in this session, so the WebAssembly files ship as built)
