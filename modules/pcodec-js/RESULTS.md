# Does our Pcodec beat the other Pcodec builds? Results

Updated 2026-10-18 after the owner's rule "speed numbers only from the four test browsers" (01:12Z): **every speed number in this file comes from a browser**, never Node. Node was used only for pass/fail checks and byte counts. Every table says which direction is better.

Browsers, one at a time, each version labeled: ungoogled-chromium 155.0.8059.39-1, Firefox 158.0 (reports 158.0b5), WebKitGTK 2.52.6, GNOME Web (Epiphany) 46.5. Browser pass/fail: 0 wrong columns in every run below.

Note on the host: the cloud machine restarted during this work and the new one is about 45% slower. Numbers from before and after the restart are not mixed anywhere in a table; each table is one run with every contender in it.

## 0. The answer (release benchmark of the shipped, patched build, 2026-10-18 02:10Z, the owner's ask "is there a reason to release it")

**Yes, there is a reason, but not on every measure.** pcodec-js is the only Pcodec that comes ready for a web page (the one other build had to be converted by me with `jco`, and nothing else exists on npm, crates.io bindings, PyPI web builds or the upstream repo). Against it, pcodec-js wins on download size (4.7 times smaller), unpack with a copy (8% to 17% faster in three browsers, a tie in Chromium), no-copy unpack, memory when streaming, start-up (3 of 4 browsers) and first use. It loses on pack speed (0% to 10% slower) and plain `pack()` output (6% bigger, fixed by `smallest`). Honest limits: wasm only, no checksum, and only one rival to compare with.

Run: all contenders in one run per browser (15 repeats x 3 rounds, order alternated, fresh page per contender), one browser at a time: ungoogled-chromium 155.0.8059.39-1, Firefox 158.0 (reports 158.0b5), WebKitGTK 2.52.6, GNOME Web (Epiphany) 46.5. 0 wrong columns everywhere. Whole-millisecond timers outside Chromium: treat gaps under 5% as ties. Raw files: `results/rel-*.json`, `results/warmrel-*.json`, `results/tables-release.md`.

Contenders: **A** our old add-on (`memory-compression-jso-pco.js`), **B** numcodecs-wasm-pco (the one other build), **N** pcodec-js 1.0.0 (patched).

**Download size, bytes gzipped (lower is better)**

| | A old add-on | B numcodecs | N pcodec-js.js | N pcodec-js-fast.js | N pcodec-js-pack.js |
|---|---:|---:|---:|---:|---:|
| unpack only / SIMD / with packer | 159,050 | 324,006 | **68,390** | 86,705 | 184,685 |

N reader is 4.7 times smaller than B and 2.3 times smaller than A. The packer file is 1.8 times smaller than B and 16% bigger than A.

**Unpack with a copy, ns per number (lower is better)**

| | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---:|---:|---:|---:|
| A old add-on | 20.96 | 19.20 | 19.52 | 19.20 |
| B numcodecs | 18.67 | 19.20 | 18.87 | 17.25 |
| **N pcodec-js.js** | 18.71 | **15.94** | **15.94** | **15.94** |
| N vs B | tie (0.2% higher) | 17% lower | 16% lower | 8% lower |
| N vs A | 11% lower | 17% lower | 18% lower | 17% lower |

**Unpack without the copy (`view` / `into`), ns per number (lower is better; B and A do not offer it)**

| | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---:|---:|---:|---:|
| N pcodec-js.js, view | 12.95 | 12.37 | 13.34 | 13.67 |
| N pcodec-js.js, into your array | 13.54 | 13.34 | 14.64 | 14.96 |
| N pcodec-js-fast.js (SIMD), view | 11.39 | 10.74 | 13.01 | 13.01 |
| View against B's copy | 31% lower | 36% lower | 29% lower | 21% lower |

**Pack 12 columns, ms (lower is better) and bytes written (lower is better)**

| | Chromium | Firefox | WebKitGTK | GNOME Web | bytes |
|---|---:|---:|---:|---:|---:|
| A old add-on | 100.4 | 104 | 107 | 110 | 1,793,004 |
| B numcodecs | **82.5** | **91** | **94** | 90 | 1,692,078 |
| N `pack()` | 85.2 | 101 | 98 | 90 | 1,793,004 |
| N `pack({smallest})` | 297.5 | 334 | 306 | 306 | **1,688,178** |
| N vs B (`pack()`) | B 3% faster | B 10% faster | B 4% faster | tie | N 6.0% bigger |
| N vs A (`pack()`) | 15% faster | 3% faster (tie) | 8% faster | 18% faster | identical |

`smallest` takes about 3.5 times as long and writes 0.2% fewer bytes than B on these 12 columns (39 columns: 2,778,048 B against B's 2,791,125 B, 0.5% smaller, and 4.0% smaller than plain `pack()` of N; the encoder was not changed by the patch, so the 39-column bytes from the earlier run still hold). B is Pcodec 1.0.2 and beats plain 1.0.4 `pack()` on size on this data; `smallest` closes that gap.

**Wasm memory, 4,000,000 numbers (lower is better; same in every browser; the patch changes no allocation, not re-measured)**

| A old add-on | B numcodecs | N unpack with copy / view | N streamed |
|---:|---|---:|---:|
| 67.9 MB | not exposed | 37.3 MB | **6.8 MB** |

**Start-up, ms from `load()` to ready (lower is better; whole ms outside Chromium)**

| | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---:|---:|---:|---:|
| A old add-on | 2.2 | 7 | 6 | 5 |
| B numcodecs | 6.9 | 18 | 23 | 22 |
| N pcodec-js.js | 5.8 | 9 | 5 | 6 |
| N pcodec-js-pack.js | 11 | 23 | 12 | 15 |

N is faster to start than B (by 16% to 78%); the old add-on starts quicker in Chromium and Firefox but is 2.3 times bigger to download.

**First unpack after load, 100,000 numbers, ms (lower is better; `load({warm:true})` against none; B and A offer nothing like it)**

| | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---:|---:|---:|---:|
| N without warm-up | 8.6 | 4 | 11 | 9 |
| N with warm-up | **2.8** | 4 | **4** | **4** |

**Where it does not win:** pack speed against B (0% to 10% slower), plain `pack()` size (6% bigger than B), no plain-JavaScript backup (the owner's decision), no checksum (a property of Pcodec), and the comparison has only one rival. Earlier detail tables below (sections 1 to 10) are from the run before the tuned loop and the same conclusions hold; section 4c has the before/after for the loop.

## 0c. Re-run for 1.6.0 (2026-10-23): packed program, lean unpack, same comparison

Setup as in 0b, but with numcodecs-wasm-pco 0.4.0 (it writes its own framing, so each build opens files it wrote itself at level 8; every result is byte-identical across builds) and 8 rounds of 25 passes. 13 columns, 8 types, 1,526,000 numbers. Order in each cell: Chromium / Firefox / WebKitGTK / GNOME Web. Lower is better in every row. Median of 8 fresh pages; single pages ranged by up to 30%, so gaps under 5% are ties.

| Measure | numcodecs-wasm-pco | pcodec-js 1.5.1 | pcodec-js 1.6.0 |
|---|---:|---:|---:|
| Download, unpack only, gzipped (B) | 324,006 | 75,081 | 60,742 |
| Download, with packer, gzipped (B) | 324,006 | 193,195 | 142,187 |
| Unpack, copy (ns per number) | 10.68 / 10.16 / 9.17 / 9.50 | 10.75 / 10.16 / 9.17 / 9.17 | 10.45 / 9.83 / 10.16 / 9.17 |
| Unpack, view (ns per number) | not offered | n/a | 7.08 / 6.55 / 8.19 / 7.86 |
| `load()` until ready (ms) | 105.5 / 66.5 / 67 / 65 | 9.2 / 8 / 4 / 4 | 9.0 / 9 / 6 / 6 |
| Pack 3 float columns, 850,000 numbers (ms) | 49.6 / 51 / 50 / 51 | 48.5 / 53 / 50.5 / 51 | 42.9 / 53 / 52.5 / 50.5 |
| Pack 3 float columns, bytes | 1,031,016 | 1,030,983 | 1,030,983 |

Honest reading: against 1.5.1 the copy unpack of this set is a tie in three browsers and 11% slower in WebKitGTK (the one 600,000-number column takes the lean path, whose new result array has to be zeroed first; see CHANGELOG.md 1.6.0). The `load()` rows rose by 0 to 2 ms (the program is inflated once). The packer file is the same code; its timing differences are inside the noise.

## 0b. Re-run for 1.0.1 (2026-10-18 03:40Z): rebuilt wasm, same comparison

What was done. (1) Pcodec v1.0.4 was cloned from upstream (commit 9fa6d04); the crates.io source of the `pco` crate differs from it only by our patch, and the patch applies cleanly. (2) The three WebAssembly programs were rebuilt from scratch on a fresh machine (`sh wasm/vendor.sh`, `sh wasm/buildall.sh`, wasm-opt 132, Rust 1.97): all three are byte for byte identical to the shipped files (same SHA-256), and `python3 build.py` gives identical JavaScript. (3) 854 Node checks pass for both readers; `test.html` (491 checks) and `demo.html` (a million numbers back exactly, 630,578 bytes) pass in all four browsers. (4) The comparison with numcodecs-wasm-pco 0.4.0 (converted with jco 1.39) was re-run in each browser, one at a time (15 repeats x 3 rounds, a fresh page per contender, `bench/browser/run-release.js`), 0 wrong columns everywhere.

Honest notes. The inputs were rebuilt: ten of the 12 columns are generated by `bench/cols.js` and `bench/dump.js`; the two real ones (California housing median income, earthquake latitude) were re-downloaded from public copies of the datasets (the earthquake file is the plotly copy, so its decimals may differ slightly from the first run). The packed sizes match the first run (`pack()` 6.0% bigger than numcodecs, `smallest` 0.23% smaller), which suggests the data is the same. This machine ran faster than the one behind sections 0 to 7, so only numbers inside one table here are comparable with each other; times outside Chromium are whole-millisecond readings of a 3-pass total, so gaps under 5% are ties.

| Lower is better (ms, 12 columns unless noted) | ungoogled-chromium 155.0.8059.39-1 | Firefox 158.0 | WebKitGTK 2.52.6 | GNOME Web 46.5 |
|---|---:|---:|---:|---:|
| Unpack, numcodecs-wasm-pco (copy) | 12.43 | 11.67 | 10.33 | 10.33 |
| Unpack, pcodec-js copy | 12.17 | 8.67 | 8.33 | 10.33 |
| Unpack, pcodec-js into your array | 6.77 | 7.33 | 9.67 | 8.00 |
| Unpack, pcodec-js view | 7.93 | 7.67 | 7.00 | 7.00 |
| Unpack, pcodec-js-fast copy | 9.90 | 7.67 | 10.00 | 8.00 |
| Unpack, pcodec-js-fast view | 7.53 | 7.33 | 6.67 | 8.33 |
| Pack, numcodecs-wasm-pco | 52.4 | 57 | 45 | 55 |
| Pack, pcodec-js `pack()` | 42.7 | 57 | 42 | 56 |
| Pack, pcodec-js `smallest` | 142.9 | 182 | 183 | 148 |
| Start-up, numcodecs-wasm-pco | 8.3 | 29 | 19 | 27 |
| Start-up, pcodec-js reader | 2.7 | 6 | 2 | 3 |
| Start-up, pcodec-js-pack | 7.8 | 13 | 9 | 12 |

Packed total of the 12 columns (smaller is better): numcodecs-wasm-pco 1,692,078 B; pcodec-js `pack()` 1,793,004 B (6.0% bigger); `smallest` 1,688,178 B (0.23% smaller). Same in every browser.

Takeaway. The first release conclusions hold: pcodec-js is ahead on download size (4.7 times smaller), start-up (3 to 9 times lower), and unpack (a tie in Chromium and GNOME Web with a copy, 26% faster in Firefox and 19% in WebKitGTK; 32% to 36% faster with a view). On pack speed the first run had numcodecs 0% to 5% ahead; this run has pcodec-js ahead in Chromium (19%) and WebKitGTK (7%) and level in Firefox and GNOME Web, so call it a tie. Plain `pack()` output stays 6% larger; `smallest` fixes that at 3 to 4 times the time. Raw per-browser files from this run: `rel101-*.json` next to the section 0 files in the research folder.

## 1. What other Pcodec builds exist for JavaScript or HTML

| Source | Result |
|---|---|
| npm | no Pcodec package (searched pcodec, pco, wasm, numcodecs, zarr) |
| Upstream repo github.com/pcodec/pcodec (cloned, 0f849aa, v1.0.4) | bindings are Rust, Python, Java and C only; no wasm or JavaScript package |
| crates.io | `pco` is the Rust crate itself; anyone wanting a page build compiles it (what our module did) |
| PyPI `numcodecs-wasm-pco` 0.4.0 | **the one other usable build**: a WebAssembly *component* (numcodecs + Pcodec 1.0.2). I converted it to browser JavaScript with `jco` 1.39 and wrote the 15 lines of glue it needs. It was made for Python, not for pages |
| Our module before this work (`memory-compression-jso-pco.js`, Pcodec 1.0.4) | the baseline, called "ours today" below |
| Not checked | GitHub search (blocked in this session), Vortex and other Rust projects that embed Pcodec, any private build |

So "other Pcodec implementations" here means numcodecs-wasm-pco, converted by me, plus our own old add-on. If you know another one, tell me and I will add it.

## 2. Same format, checked both ways (39 columns, bit for bit, Node pass/fail)

| Check | Result (higher is better, out of 39) |
|---|---:|
| New packer writes the same bytes as our old add-on | 39 |
| New reader opens files from our old add-on | 39 |
| New reader opens files from numcodecs (Pcodec 1.0.2) | 39 |
| Old add-on opens files from the new packer | 39 |
| numcodecs opens files from the new packer | 39 |
| numcodecs opens files from the new `smallest` mode | 39 |

Test suite: 854 checks pass for `pcodec-js.js` and again for `pcodec-js-fast.js`.

## 3. Download size (smaller is better)

| What a page loads | Raw bytes | Gzipped (`gzip -9`) |
|---|---:|---:|
| **pcodec-js.js** (reader, speed-built, no SIMD needed) | **168,183** | **68,390** |
| pcodec-js-fast.js (reader, SIMD program) | 227,871 | 86,705 |
| pcodec-js-pack.js (reader + packer, speed-built) | 468,019 | 184,685 |
| Our old add-on today (`memory-compression-jso-pco.js`, packer + reader) | 440,757 | 159,050 |
| numcodecs-wasm-pco (wasm 903,269 + glue 276,853) | 1,180,122 | 324,006 |

Wasm programs alone: reader 112,851 B, SIMD reader 157,590 B, reader+packer 335,642 B (old add-on 326,822 B). Each of the three files also holds 4,968 B of data for the optional warm-up (section 7). The reader file is 2.6 times smaller than the old add-on raw and 2.3 times gzipped; the packer file is 6.8% bigger raw and 16% bigger gzipped (it is built for speed, section 6).

## 4. Unpack speed (nanoseconds per number, lower is better)

12 columns, 899,000+ numbers (decimals, counters, timestamps, coordinates), best of 3 rounds of the median of 15 timings, fresh page per contender.

| Contender | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---:|---:|---:|---:|
| Our old add-on | 19.98 | 19.52 | 19.20 | 18.55 |
| numcodecs via jco | 19.06 | 18.87 | 17.57 | 16.92 |
| pcodec-js.js, copy | 18.84 | 15.94 | 16.92 | 16.92 |
| pcodec-js.js, into an array you hold | 14.22 | 14.32 | 15.62 | 16.27 |
| pcodec-js.js, view (no copy) | 12.62 | 13.01 | 14.32 | 14.32 |
| pcodec-js-fast.js, copy | 17.83 | 14.32 | 16.92 | 16.59 |
| pcodec-js-fast.js, view | 12.27 | 10.74 | 13.99 | 13.99 |

Reading it: with a copy, the new reader is 6% (Chromium), 18% (Firefox), 12% (WebKitGTK) and 9% (GNOME Web) faster than the old add-on, and level with numcodecs in Chromium and GNOME Web, 4% to 16% faster in WebKitGTK and Firefox. The browsers other than Chromium round timers to whole milliseconds, so treat gaps under 5% as a tie. Skipping the copy (view) is 25% to 33% faster than the copy, because the copy has to allocate and fill a new 8 MB array. The SIMD file helps Firefox (view 10.74 against 13.01, 17% faster) and is within 3% elsewhere.

## 4a. Speed-built compared with size-built (what I tried, Chromium unless noted)

The reader program was size-built before (105,896 B wasm). The speed-built twin (opt-level s plus `wasm-opt -Os`) is 114,033 B (+7.7%).

| Unpack of 12 columns, copy (ns per number, lower is better) | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---:|---:|---:|---:|
| Size-built reader, pass 1 / pass 2 | 18.94 / 18.81 | 17.57 / 18.87 | 16.27 / 16.92 | 15.94 / 16.59 |
| Speed-built reader, pass 1 / pass 2 | 18.67 / 18.42 | 16.27 / 17.89 | 16.92 / 16.92 | 16.92 / 18.22 |

The gain is 1.6% in Chromium, 7% in Firefox, none in the WebKit-based two. I shipped the speed-built reader anyway because the owner asked for it on 01:07Z; its cost is +7.1% on the reader file.

Nine different builds in Chromium (ns per number, lower is better; one run, 12 columns, view): size-built 12.76; opt-level s with `-Os` 12.88; opt-level s with `-O3` 13.34; opt-level 2 with `-O2` 13.15; opt-level 3 with `-O3` 12.40; s with SIMD 13.08; 3 with SIMD and `-O3` 12.43; 3 with SIMD, `-O3 --converge` 12.30; the shipped SIMD build 12.20. **All within 9% of each other: compiler flags are not the lever.** A program for one number type only is 90 KB against 114 KB (21% smaller), so per-type programs would not pay.

## 4b. Where unpack time goes

A profile of a named build (a diagnostic, run once in Node, never used as a speed result): for a decimal column that uses a multiplier and a running total, about 39% is unpacking the extra bits of each number, 25% the float join plus running sum, 20% reading the compressed symbols, 5% the second stream and 4% a sign toggle. Those loops are already hand-tuned scalar code in Pcodec (the native build gets its extra speed from AVX2 gathers that WebAssembly SIMD does not have: no per-lane variable shifts, no gather).

## 4c. Tuned kernels (done 2026-10-18 after the owner's tap "Try tuned kernels")

I forked Pcodec's hot loops and tried three changes one at a time, each against an untouched copy built the same way. First screen in Chromium only (ns per number, 12 columns, view, lower is better, 11 repeats x 3 rounds):

| Change | Chromium before | Chromium after | Kept? |
|---|---:|---:|---|
| 1. Bit-unpack loop with no per-number bounds checks (3 slices walked together) | 13.18 | 12.59 (4.5% lower) | **yes** |
| 2. Delta decode in one pass (sign toggle and running sum together) | 12.95 | 12.88 (0.5% lower, a tie; 3.9% above change 1 alone, 12.40 in that run) | no, dropped |
| 3. Decimal join without a branch (compute both ways, pick one) | 12.98 | 12.52 (3.5% lower) but 1.0% above change 1 alone (12.40 in that run) | no, dropped |

Change 1 is the only one that stays: a patch of two small hunks (`wasm/pco-1.0.4-pcodec-js.patch`, 12 changed lines in `src/page_latent_decompressor.rs`). Pcodec's own code is untouched otherwise. Output is identical: 854 checks pass for both readers, the 600 damaged-file test gives the same 591 refused and 9 decoded, `pack()` still writes the same 1,793,004 bytes for the 12 columns, and a clean rebuild from the patch gives the same file (SHA-256 of the reader c48b59fa...).

Confirmed in the four browsers, one at a time, two separate runs (ns per number, 12 columns, lower is better). Run A is the reader only against the old reader; run B is all three files against their old versions.

| Reader (view) | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---:|---:|---:|---:|
| Run A before / after | 12.66 / 12.13 (4.2% lower) | 13.34 / 12.37 (7.3%) | 15.30 / 13.34 (12.8%) | 14.64 / 13.34 (8.9%) |
| Run B before / after | 12.56 / 12.88 (2.6% higher) | 13.01 / 12.37 (4.9%) | 14.32 / 13.34 (6.8%) | 13.99 / 13.01 (7.0%) |
| Reader with copy, run B | 18.67 / 17.96 (3.8%) | 16.59 / 15.62 (5.9%) | 16.59 / 16.27 (1.9%) | 17.25 / 15.62 (9.4%) |
| SIMD reader (view), run B | 12.20 / 11.35 (7.0%) | 10.74 / 10.42 (3.0%) | 13.34 / 13.01 (2.4%) | 14.32 / 12.69 (11.4%) |
| Packer file, pack 12 columns (ms), run B | 83.8 / 84.7 | 90 / 93 | 89 / 87 | 90 / 90 |

Takeaway: about **6% faster unpack on average, from a tie to 13%**, never slower beyond the noise (Chromium swings about 3% between runs; Firefox and WebKit round to whole milliseconds, so gaps under 5% are ties). Packing is unchanged. Files are 1.0% to 1.2% smaller as a bonus (reader 168,183 B against 169,759 B). That is about half the 10% to 15% I had estimated: the other two loops are already as fast as their code allows in WebAssembly, and the bit-unpack loop was the only one where the compiler was keeping checks I could remove.

Cost: the build now uses a patched copy of Pcodec 1.0.4 (`wasm/vendor.sh` fetches the crate and applies the patch). When Pcodec ships a new version the patch has to be checked against it; the patch is 12 lines, so that is a few minutes. Raw results: `results/kern-chromium.json`, `kern2-chromium.json`, `kern3-chromium.json`, `kernfin-*.json`, `kernfin2-*.json`.

## 5. Memory (lower is better)

Wasm memory the program holds after unpacking one file of 4,000,000 decimals (32 MB of numbers, 5,797 KB packed). This number is the same in every browser. Copying also leaves a 32 MB result array on the JavaScript side.

| Contender | Wasm memory (MB) |
|---|---:|
| Our old add-on | 67.9 |
| numcodecs via jco | not exposed |
| pcodec-js unpack (copy), view | 37.3 |
| **pcodec-js stream (4,096 numbers at a time)** | **6.8** |

Streaming never holds the 32 MB result: 10 times less wasm memory than the old add-on. This is the piece that matters for the memory-pressure aim (Netflow Map on a small-memory laptop).

## 6. Packing

**What changed:** the packer program was built to be small (`opt-level z`), which left it about 12% behind numcodecs in the first browser run. Built for speed (`opt-level s`, `wasm-opt -Os`) it writes exactly the same bytes and is 43,056 B bigger. Tried in a quick Node screen and dropped (no gain worth the size, so not re-timed in browsers): opt-level 3 (126,118 B more wasm) and a SIMD packer.

Pack time for 12 columns, in ms (lower is better), same run as section 4:

| Contender | Chromium | Firefox | WebKitGTK | GNOME Web | Packed bytes, 12 columns (lower is better) |
|---|---:|---:|---:|---:|---:|
| Our old add-on (Pcodec 1.0.4) | 96.3 | 107 | 107 | 105 | 1,793,004 |
| numcodecs via jco (Pcodec 1.0.2) | 80.6 | 90 | 89 | 84 | 1,692,078 |
| pcodec-js-pack.js `pack()` (same bytes as before) | 85.0 | 90 | 93 | 88 | 1,793,004 |
| **pcodec-js-pack.js `pack(x, {smallest: true})`** | 276.3 | 314 | 303 | 325 | **1,688,178** |

`pack()` is 12% (Chromium), 16% (Firefox), 13% (WebKitGTK) and 16% (GNOME Web) faster than the old add-on. numcodecs is still 0% to 5% faster to pack (Pcodec 1.0.2 against 1.0.4). `smallest` takes 3.2 to 3.7 times as long as `pack()`.

Why numcodecs is smaller than Pcodec 1.0.4 here: its older Pcodec picks a better mode on a few columns (earthquake latitude 61,202 B against 162,248 B). `smallest` fixes that without changing the format: it tries seven encoder settings on a 20,000-number sample (the whole array when it has up to 40,000 numbers), packs with the best, and keeps the smaller file, so it is never larger than the plain pick. Bytes over 39 columns (counted in Node; bytes are the same everywhere):

| Packer | Total bytes (smaller is better) | vs Pcodec 1.0.4 plain |
|---|---:|---:|
| Pcodec 1.0.4 plain (old add-on and new `pack()`) | 2,892,944 | 0 |
| numcodecs (Pcodec 1.0.2) | 2,791,125 | -3.5% |
| **`pack(x, {smallest:true})`** | **2,778,048** | **-4.0%** |

Trying every combination of 10 modes and 5 delta settings (1,650 tries) gave 2,774,772 (-4.1%), so the seven-try list captures nearly all of it. Biggest wins: earthquake latitude -62%, link colors -70% (1,231 to 369 B), temperature -6%, GPS coordinates -3.5%.

**Search shortcuts I tried.** A 10,000-number sample loses most of the gain (2,881,132 B), because columns of 20,000 to 40,000 numbers then stop being searched in full. Searching at level 4 instead of 8 costs 0.4% more bytes (2,788,431 B) for about 15% less time on 100,000-number columns; not worth it. What I kept: for arrays of up to 40,000 numbers the sample packs are the real packs, so the winner is reused instead of being packed again (2 of 9 passes saved there, identical bytes; no change for larger arrays, so the 12-column table above does not move).

**Pack level** (Pcodec's `level`, 12 columns, pack ms in Chromium / Firefox / WebKitGTK / GNOME Web, lower is better; bytes lower is better):

| Level | Bytes | Chromium | Firefox | WebKitGTK | GNOME Web |
|---:|---:|---:|---:|---:|---:|
| 3 | 1,919,238 | 65.4 | 73 | 77 | 84 |
| 4 | 1,845,364 | 84.2 | 80 | 85 | 71 |
| 5 | 1,810,489 | 70.5 | 73 | 79 | 71 |
| 6 | 1,800,797 | 70.5 | 94 | 77 | 73 |
| 7 | 1,795,843 | 79.3 | 96 | 80 | 75 |
| 8 (default) | 1,793,004 | 87.5 | 93 | 88 | 88 |

Level 6 is 0.43% bigger than level 8 and packs 19% (Chromium), 12% (WebKitGTK) and 17% (GNOME Web) faster, with no change in Firefox. These timings are noisy (single set, about plus or minus 10%), so treat it as a hint: use `pack(x, {level: 6})` when pack time matters more than the last 0.4%. Unpack time does not depend on level (12.9 to 13.8 ns per number in Chromium across levels 3 to 7; level 8 read 20.2 in that run, a noisy outlier, and 13.6 in an earlier run).

**Encoder settings against unpack speed** (Chromium, 12 columns): the auto pick (1,793,004 B, 12.9 ns) is the smallest and nothing decodes much faster without getting much bigger. No delta: 2,419,066 B, 19.2 ns (slower and bigger). Classic mode with no delta: 4,615,012 B, 8.6 ns (33% faster, 2.6 times bigger). Classic with a running total: 3,525,760 B, 9.8 ns. There is no setting that trades a few percent of size for a large speed-up.

## 7. Start-up and first use

**Compile and start (milliseconds from calling load() to ready, lower is better; timers round to whole ms except in Chromium):**

| Contender | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---:|---:|---:|---:|
| Our old add-on | 2.6 | 8 | 5 | 5 |
| numcodecs via jco | 9.2 | 22 | 20 | 20 |
| pcodec-js.js | 6.2 | 8 | 7 | 6 |
| pcodec-js-fast.js | 14.7 | 11 | 7 | 8 |
| pcodec-js-pack.js | 10.7 | 27 | 15 | 15 |

**First use is slow in every browser.** Browsers start WebAssembly with a quick first version of each function and swap in the optimized version only after it has run a while. The first unpack of a 100,000-number column therefore takes 5 to 15 ms instead of 2, and the next few take about twice the steady time. This is the case for real pages, which decode once.

`load({ warm: true })` (or `pc.warm(ms)`) fixes most of it: it unpacks three tiny built-in files (decimals with a running total, counters, noisy floats; 4,968 B of data) for 15 ms, in slices of about 3 ms so the page stays responsive, while the page waits for its data. First unpack of a 100,000-number column (a fresh browser for every trial, 3 trials, the page waits 100 ms after load; median):

| First unpack (ms, lower is better) | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---:|---:|---:|---:|
| No warm-up | 8.8 | 5 | 15 | 13 |
| `warm: true` (15 ms) | **2.8** | 5 | **7** | **5** |
| Change | 68% less | none | 53% less | 62% less |

The effect needs some idle time after the warm-up: with the unpack right after `load()` there is no gain (9.2 ms in Chromium). In Chromium, 10 ms was as good as 30 ms. Firefox is not helped: it builds its fast version by itself in the background; there the first unpack drops from 11 ms to 5 ms if the page waits about 600 ms after load, with or without the warm-up, so call `load()` as early as you can. Calling `warm` costs about 15 ms of CPU in the background; the default stays off.

## 8. What else the new module has that the others do not

| Feature | Our old add-on | numcodecs via jco | pcodec-js |
|---|---|---|---|
| Number types | decimals and 32-bit whole numbers only | all ten | 8 (u16, i16, u32, i32, f32, u64, i64, f64) |
| Reads the type and count from the file | no | no (own header) | yes (`info()`) |
| Streaming unpack, bounded memory | no | no | yes (`stream()`) |
| No-copy results | no | no | yes (`view`, `into`) |
| Reader without the packer | no | no | yes (168,183 B) |
| Smallest-file packing mode | no | no | yes |
| Warm-up for a faster first unpack | no | no | yes (`warm`) |
| Plain page, no component runtime or shims | yes | no (needs 5 stand-in interfaces) | yes |
| Count checked against the caller | yes | no | yes (`maxCount`) |
| Rebuild gives the identical wasm file | yes | not checked | yes (same SHA-256 from a different folder) |
| Damaged-file test | in Node only | not tested | 600 damaged files: 591 refused, 9 decoded to different numbers (Pcodec has no checksum; same for all), 0 crashes |

## 9. What it does not beat, plainly

- Unpack with a copy is a tie with numcodecs in Chromium and GNOME Web (not a win there).
- Packing is 0% to 5% slower than numcodecs; `smallest` takes 3.2 to 3.7 times as long as plain packing.
- Plain `pack()` is 6% larger than numcodecs on the 12-column set (Pcodec 1.0.4 against 1.0.2); only `smallest` beats it, and only by 0.5% over all 39 columns.
- The packer file is 6.8% bigger raw than the old add-on (16% gzipped).
- The warm-up does nothing in Firefox.
- Not tested: a phone, a real Netflow Map table, Pcodec levels other than 3 to 8 in the browsers, files over 33.5 million numbers (the default limit).
- Pcodec files have no checksum. A single flipped bit decodes without an error, to different numbers (9 of 600 damaged files in the test). Use your own checksum when that matters.

## 10. How it was run (time and compute)

About 50 minutes of wall time for the first comparison (21:37Z to 22:20Z) and about 40 minutes for the speed dive (01:07Z to 01:45Z). About 28 wasm builds of 15 to 45 s each (three at a time at most), about 14 `wasm-opt` runs and 2 rebuild-twice checks (identical SHA-256, a different folder). Browser passes: 6 four-browser benchmark passes (about 3 minutes per browser, one at a time, a fresh page per contender; the last one is the shipped files), 1 four-browser pass for the pack levels (about 20 s per browser), Chromium-only screens of 9 build variants and 9 encoder settings, and about 70 fresh-browser first-use trials. A first four-browser pass that ran all contenders in one page was thrown away: in WebKit the contenders that ran last looked up to 35% slower. Tools: Rust 1.97 with wasm32-unknown-unknown, binaryen `wasm-opt` 132, jco 1.39.

Files: `proposed-tree/modules/pcodec-js/` (module, tests, benchmarks), `results/` (raw JSON per browser and the tables; `browser-final-*.json` is the run behind sections 4, 6 and 7 start-up, `warmfinal-*.json` the first-use trials, `cfg-levels-*.json` the level table).
