# pcodec-js

**Version 1.0.0 · API 1**

**Tested in:** ungoogled Chromium 155.0.8059.39-1, Firefox 158.0 (reports 158.0b5), WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, one at a time (2026-10-18): the test page (491 checks) and the demo page (a million numbers back exactly) in each browser, then the benchmark in RESULTS.md. Node 22: 854 checks for the reader and for the SIMD reader. Not run: a phone, the build from source (the Pcodec source download was not allowed in this session, so the WebAssembly files ship as built)

Pcodec for web pages: unpack (and optionally pack) big lists of numbers in a browser, one file, no build step, no network.

Pcodec ("pco") is a number compressor by Martin Loncaric and contributors (Apache-2.0). This module is Pcodec 1.0.4 compiled to WebAssembly with a small interface designed for pages. It reads and writes ordinary Pcodec files, so anything that opens Pcodec opens these, and the other way around.

Forged by LFC Foundry. Copyright (c) 2026 LFC Foundry, MIT license (wrapper). Pcodec itself stays Apache-2.0; see `NOTICE-pcodec.txt`.

## Pick a file

| File | Raw / gzipped | Use it when |
|---|---:|---|
| `pcodec-js.js` | 168,183 B / 68,390 B | you only unpack. Works in every browser that has WebAssembly. **Start here.** |
| `pcodec-js-fast.js` | 227,871 B / 86,705 B | you only unpack and want the SIMD program (17% faster in Firefox, within 3% elsewhere). Opening it without SIMD gives a clear message to use `pcodec-js.js` |
| `pcodec-js-pack.js` | 468,019 B / 184,685 B | you also pack (built for speed, so bigger than a size-built packer) |

Needs `'wasm-unsafe-eval'` in the page's `script-src` (the project rule for every page). WebAssembly is required: if it is blocked, `load()` rejects with a clear message. There is no plain-JavaScript backup (project decision, 2026-10-17).

## Use

```js
const pco = await PcodecJS.load({ warm: true }); // warm: see below; call load() as early as you can
const meta = pco.info(bytes);                    // { type:'f64', count:1000000 }
const numbers = pco.unpack(bytes);               // Float64Array, a copy you own
const view = pco.unpack(bytes, {view:true});     // no copy; valid until the next call
pco.unpack(bytes, {into: myFloat64Array});       // fills an array you already hold
for (const part of pco.stream(bytes, {batch: 4096})) use(part); // bounded memory
const packed = pco.pack(float64Array, {level: 8});             // pack file only
const tiny = pco.pack(float64Array, {smallest: true});          // pack file only, about 3.2 to 3.7 times slower, about 4% smaller
```

- `count` and `maxCount`: pass `count` when you know it; a wrong count is refused. `maxCount` defaults to 33,554,432 numbers so a damaged file cannot make the page reserve gigabytes.
- `stream()` hands back one view per batch (batch is a multiple of 256, default 4,096). Copy a part if you keep it.
- Types: u16, i16, u32, i32, f32, u64, i64, f64 (64-bit whole numbers come back as BigInt64Array / BigUint64Array).
- `release()` frees the wasm memory; `memoryBytes()` says how much it holds.
- `level` (0 to 12, default 8): level 6 packs 12% to 19% faster in Chromium, WebKitGTK and GNOME Web for 0.43% more bytes.
- `warm`: `load({ warm: true })` (or `pco.warm(ms)`, default 15 ms) unpacks three tiny built-in files in slices of about 3 ms while the page waits for its data. Browsers start WebAssembly slowly and speed it up after it has run a while; this brings that forward. First unpack of 100,000 numbers: Chromium 8.8 to 2.8 ms, WebKitGTK 15 to 7 ms, GNOME Web 13 to 5 ms; Firefox is not helped. It needs about 50 ms of idle time after `load()` to take effect. Views from before a `warm` call are not valid after it.

## How it compares

The same Pcodec bytes as any Pcodec, so the question is only how well each build runs in a page. The only other JavaScript build of Pcodec I could find is numcodecs-wasm-pco; this one is much smaller to download, uses a tenth of the wasm memory when streaming and unpacks as fast or faster, but packs 0% to 5% slower and its plain `pack()` is 6% larger on the 12-column set (Pcodec 1.0.4 against 1.0.2; `smallest` mode fixes that). Details and tables: `RESULTS.md`; all speeds measured in the four browsers.

Better direction is stated in each header. Order in each cell: Chromium / Firefox / WebKitGTK / GNOME Web.

| Measure | numcodecs-wasm-pco (the only other JS Pcodec I found) | pcodec-js | Better |
|---|---:|---:|---|
| Download, unpack only (gzipped) | 324,006 B | 68,390 B | smaller |
| Download, with packer (gzipped) | 324,006 B | 184,685 B | smaller |
| Wasm memory, 4,000,000 numbers, streamed | not exposed | 6.8 MB (old add-on: 67.9 MB) | lower |
| Unpack, copy made (ns per number) | 19.06 / 18.87 / 17.57 / 16.92 | 18.84 / 15.94 / 16.92 / 16.92 | lower (a tie to 16% faster) |
| Unpack, view (ns per number) | not offered | 12.62 / 13.01 / 14.32 / 14.32 | lower |
| Pack 12 columns (ms) | 80.6 / 90 / 89 / 84 | 85 / 90 / 93 / 88 | lower (numcodecs is 0% to 5% faster) |
| Pack 39 columns, smallest mode (bytes) | 2,791,125 | 2,778,048 | smaller |
| First unpack after load with `warm` (ms) | not offered | 2.8 / 5 / 7 / 5 | lower |

Unpack rows were measured before the tuned loop (below); with it the unpack is 0% to 13% lower in the four browsers (about 6% on average), see `RESULTS.md` section 4c.


## Prior art and credits

- **Pcodec 1.0.4** by Martin Loncaric and contributors, Apache-2.0, https://github.com/pcodec/pcodec: the whole format and the coding inside the WebAssembly programs. One 12-line patch of ours is in `wasm/pco-1.0.4-pcodec-js.patch` (the bit-unpack loop without per-number bounds checks); the full license text and the list of crates compiled in (better_io, dtype_dispatch, half, cfg-if, zerocopy, rand_xoshiro, rand_core) are in `NOTICE-pcodec.txt`.
- **numcodecs-wasm-pco**, the other JavaScript build, is used only as the thing to compare against and to check that both open each other's files; none of its code is here.
- The small interface around Pcodec (`wasm/src/lib.rs`) and the JavaScript files are ours, MIT, Copyright (c) 2026 LFC Foundry.

## What it is not

- Not stock Pcodec inside: the build uses Pcodec 1.0.4 with one small patch (the bit-unpack loop without per-number bounds checks, `wasm/pco-1.0.4-pcodec-js.patch`). The decoded numbers and written bytes are identical; it is about 6% faster to unpack.
- Not a different format: the bytes are Pcodec's. `pack()` writes exactly the bytes our earlier add-on wrote.
- Pcodec has no checksum. A damaged file is usually refused, but 9 of 600 damaged test files decoded to different numbers without an error. Add your own checksum if that matters.
- Not a text or repeating-id compressor. For lists of repeating small ids, the number picker in [memory-compression](../memory-compression/README.md) is far smaller (for example 543 B against 12,529 B for one link column).
- The only comparison is against one other build, which I converted to browser JavaScript myself. No other JS Pcodec was found on npm or in the upstream repository; GitHub search was not available.
- Not part of [memory-compression](../memory-compression/README.md). The two are separate on purpose (project decision, 2026-10-17).

## Rebuild and test

`python3 build.py` rebuilds the three JS files from `src/` and `wasm/`. `sh wasm/vendor.sh` (once) fetches Pcodec 1.0.4 and applies the patch, then `sh wasm/buildall.sh` rebuilds the wasm with `--locked` and `--remap-path-prefix`, so the result is the same file from any folder (checked: identical SHA-256). `node src/make-warm.js` rebuilds the warm-up files (`src/warm.json`). `node test/run.js` runs 854 checks (set `READER=pcodec-js-fast.js` for the SIMD reader). Node is used for these pass/fail checks only; speed is measured in the four browsers.
