# pcodec-js

**Version 1.6.3 · API 1**

**Tested in:** Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6

Forged by LFC Foundry. Copyright (c) 2026 LFC Foundry, MIT license (wrapper). Pcodec itself stays Apache-2.0; see `NOTICE-pcodec.txt`.

## What it is and how it works

Pcodec for web pages: unpack, and optionally pack, big lists of numbers in a browser. One file, no build step, no network. Pcodec ("pco") is a number compressor by Martin Loncaric and contributors (Apache-2.0).

- This is Pcodec 1.0.4 compiled to WebAssembly, packed inside one JavaScript file and opened by `load()`.
- You pass the bytes of a Pcodec file and get a typed array back, such as a `Float64Array`.
- Files are ordinary Pcodec, so anything that reads Pcodec reads these, and the other way around.

## Why it exists

Pcodec is built for number lists, and a page that opens such files needs it as one file with no build step. The only other JavaScript build found was a 324,006-byte download (gzipped), against 61,314 bytes for the unpack-only file here.

**Where it helps**

- Shipping large numeric datasets inside a page.
- Reading Pcodec files made by other tools.
- Time series and sensor data in offline apps.

**Not for:** text or mixed data; it is for lists of numbers.

## Pick a file

| File | Raw / gzipped | Use it when |
|---|---:|---|
| `pcodec-js.js` | 106,348 B / 61,314 B | you only unpack. Works in every browser that has WebAssembly. **Start here.** |
| `pcodec-js-fast.js` | 122,204 B / 73,420 B | you only unpack and want the SIMD program (17% faster in Firefox, within 3% elsewhere). Opening it without SIMD gives a clear message to use `pcodec-js.js` |
| `pcodec-js-pack.js` | 219,644 B / 142,786 B | you also pack (built for speed, so bigger than a size-built packer) |

Needs `'wasm-unsafe-eval'` in the page's `script-src` (the project rule for every page), and `worker-src blob:` if you use `PcodecJS.worker()` or `PcodecJS.pool()` (without it the same calls run on the page). WebAssembly is required: if it is blocked, `load()` rejects with a clear message. There is no plain-JavaScript backup (project decision, 2026-10-17). Since 1.6.0 the program is stored deflated inside the file and opened with the browser's `DecompressionStream('deflate-raw')` (every current browser has it; without it `load()` rejects with a clear message). The opening costs 1 to 5 ms once per page load and the packed text is dropped after the program is compiled; workers are handed the compiled program, so nothing is opened twice. Raw file sizes and gzipped downloads are measured with gzip level 9.

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
const quick = pco.pack(float64Array, {smallest: 'quick'});     // pack file only: only tries decimal settings, see below
```

- **Never freeze the page (since 1.1.0).** `await pco.unpackAsync(bytes, { sliceMs, count, maxCount, into })` gives the same numbers as `unpack`, in slices of 2 ms with the page getting a turn between slices. Longest page freeze while unpacking 2,000,000 numbers, Chromium / Firefox / WebKitGTK / GNOME Web (ms, smaller is better): `unpack` 68 / 156 / 47 / 68, `unpackAsync` 2.9 / 4 / 5 / 6. The total time is longer (plain 67 / 156 / 48 / 67 ms, sliced 112 / 189 / 76 / 93 ms).
- **Background worker (since 1.1.0).** `const w = await PcodecJS.worker();` then `await w.info(bytes)`, `await w.unpack(bytes)` and `await w.pack(array)`. Pass `{ transfer: true }` to hand your array over instead of copying it (it is empty afterwards). Longest freeze for a 2,000,000-number pack: on the page 169 / 207 / 181 / 180 ms, in the worker with the array handed over 4.6 / 8 / 5 / 5 ms. If the browser or the page policy refuses workers you get the same calls on the page (`w.inWorker` is false).
- **Compile early (since 1.1.0).** The program starts compiling the moment the file runs, off the page's main thread, so `load()` is ready at once if you call it after your first screen's other work (the wait after 30 ms of other start-up work went from 7.3 / 15 / 17 / 12 ms to 0.2 / 0 / 0 / 0.5). A worker is handed the compiled program, so nothing compiles twice (`worker()` ready 58.9 / 27.5 / 46 / 45.5 ms before, 32.8 / 10.5 / 22 / 24.5 now). Compiled wasm cannot be stored between visits: every tested browser refused to keep it in IndexedDB, and Cache Storage saved at most 2.5 ms of a 4 to 7 ms compile.
- **Several workers (since 1.2.0).** `const p = await PcodecJS.pool();` then `await p.pack([colA, colB, colC])` (an array of files comes back, same order) or `await p.pack(oneBigArray)` (one file; the array is cut into Pcodec's own pages on several workers and the pieces join into exactly the bytes `pack()` writes), and `await p.unpack([fileA, fileB, ...])`. Packing took 1.7 to 2.2 times less time with 2 to 4 workers in the four test browsers; unpacking many columns up to 2.3 times less (Chromium 14%). Small jobs stay on one worker, because starting a worker costs 7 to 12 ms; `{ size, laneMs }` change the limits. A single file cannot be unpacked in parallel.
- **Split file: a big column that unpacks on several workers (since 1.4.0).** `await p.pack(oneBigArray, { parts: true })` (or `pco.pack(x, { parts: true })` without a pool) writes one file made of ordinary Pcodec files, one for each group of Pcodec pages, behind a 12-byte header and a list of lengths (magic `PCJM`, version 1; 31 to 135 B more than a normal file for 0.5 to 8 million numbers). `pco.unpack`, `unpackAsync`, `stream`, `info`, the worker and the pool all open it, and each part is a normal Pcodec file. `await p.unpack(splitFile)` opens the parts on several workers and a worker joins them, so the page is usually frozen for less than 10 ms. `await p.unpack(splitFile, { parts: true })` hands back the array of parts as they are, with no join: 8 million numbers opened 2.1 to 2.8 times faster than a normal file on one worker (joined: 1.25 to 1.6 times). Files under about 2.5 million numbers stay on one worker, where a split file is as fast as a normal one. Not available with `smallest`.
- **Reuse your array.** `await w.unpack(bytes, { into: myArray })` (worker) and `await p.unpack(file, { into: myArray })` (pool, normal or split file) fill an array you already have: its memory goes to a worker and comes back as the result (`myArray` itself is empty afterwards, so keep the result and pass it in again next time). A big column then needs no new 64 MB to allocate and collect each time: 8 million numbers opened 1.07 to 1.3 times faster from a normal file and 1.3 to 1.7 times faster from a split file than with a new array each time, and Chromium's long page pauses with a joined result went from 48 ms (median) to 9. One file per call, not with `parts`.
- **Start the pool early.** `PcodecJS.pool({ warm: true })` (or a number) starts the workers when the pool is made instead of at the first job, so the first big unpack is 3 to 26 ms faster; it costs 3 to 7 ms when the pool is made. The program is compiled once on the page and handed to every worker; no worker compiles again.
- **Lean big unpacks (since 1.6.0).** `unpack(bytes)` of 262,144 numbers or more (main thread, worker and every pool lane) decodes in batches of 65,536 straight into the new result array, so the wasm memory stays about 6.3 MB for 4,000,000 numbers instead of 36.3 MB, and the numbers are the same. Time for that unpack (median, Chromium / Firefox / WebKitGTK / GNOME Web): on a program that already holds its memory -5% / -6% / +24% / +19% (WebKit-based browsers are slower here because the new result array must be zeroed before it is filled); on a fresh program, or after `release()`, -17% / -22% / -3% / -9%. `view`, `into` and `stream()` work as before. **`load({ lean: false })` is the 1.5.1 route for big copies (since 1.6.0):** the program decodes the whole result into its own memory and copies it out once. In WebKitGTK and GNOME Web that last copy is faster: the warm 4,000,000-number unpack takes 56 / 62 ms with `lean: false` against 57 / 60 ms in 1.5.1 and 73 / 77 ms lean (median of 40 turns, 3 fresh instances; 1.5.1 speed, within 5%). **It trades 36 MB for that speed:** the program holds a result-sized region (36.3 MB for 4,000,000 numbers) after every big unpack. Chromium and Firefox gain nothing from it (lean is 5 to 6% faster there). To limit that, such an object gives the memory back when it has not been called for `idleMs` (default 4000; `idleMs: 0` turns that off), and the next call starts a new program (the first call after a release took 96 / 77 / 97 / 98 ms for 4,000,000 numbers against 87 / 60 / 86 / 78 ms warm, in Chromium / Firefox / WebKitGTK / GNOME Web). `lean: false` also works on `worker({ lean: false })` and `pool({ lean: false })`. The default stays lean. `lean: false` gives you your own object, not the shared one `load()` returns without options.
- **A ready array for the next big unpack (since 1.6.2).** The first write to a freshly made big array costs about 0.7 ms per MB in every browser (the system hands over untouched memory), and Firefox stalls 150 to 350 ms now and then when big results keep coming. After a big `unpack()` (262,144 numbers or more, main thread) the page makes one array of the same type and length while it is idle and touches its memory, and the next unpack of that size fills it instead of a new one. Repeated unpacks of 5,000,000 numbers, every 150 ms (ratio new/old with its 90% range): Chromium 0.63 (0.61-0.79), Firefox 0.80 (0.76-0.82), WebKitGTK 0.87 (0.71-0.99). The spare is dropped after `idleMs` (default 4 s) unused; `load({ spare: false })` turns it off. If you unpack the same column again and again, passing your own array with `{ into }` gives the same gain without the extra array.
- **The pool gives memory back when idle (since 1.6.0).** A pool ends its workers after `idleMs` (default 4000 ms, 0 turns it off) with no job and starts them again at the next one, so an idle pool that has opened a 4,000,000-number file no longer keeps its 17 to 52 MB. The first job after parking costs about 20 to 40 ms for four small files in the four browsers (a warm pool needs 6 to 10 ms). `p.workers()` says how many workers run now and `p.idleMs` shows the setting. Workers start one per page turn, so the page task of a first job is 1 to 4 ms.
- **Smaller files, cheaply (since 1.3.0).** `pack(x, { smallest: 'quick' })` checks whether a float column is made of decimals (multiples of 0.1, 0.01, ... 0.000001) and only then also packs with that setting, keeping the smaller file (never larger than plain). On our 39 test columns it helped 2 of 39 (one by 61%) and made all 39 files together 3.4% smaller at about 1.7 times the plain time; `smallest: true` is 4.0% smaller at 3.3 to 3.5 times.
- `count` and `maxCount`: pass `count` when you know it; a wrong count is refused. `maxCount` defaults to 33,554,432 numbers so a damaged file cannot make the page reserve gigabytes.
- `stream()` hands back one view per batch (batch is a multiple of 256, default 4,096). Copy a part if you keep it.
- Types: u16, i16, u32, i32, f32, u64, i64, f64 (64-bit whole numbers come back as BigInt64Array / BigUint64Array).
- `release()` frees the wasm memory; `memoryBytes()` says how much it holds.
- `level` (0 to 12, default 8): level 6 packs 12% to 19% faster in Chromium, WebKitGTK and GNOME Web for 0.43% more bytes.
- `warm`: `load({ warm: true })` (or `pco.warm(ms)`, default 15 ms) unpacks three tiny built-in files in slices of about 3 ms while the page waits for its data. Browsers start WebAssembly slowly and speed it up after it has run a while; this brings that forward. First unpack of 100,000 numbers: Chromium 8.8 to 2.8 ms, WebKitGTK 15 to 7 ms, GNOME Web 13 to 5 ms; Firefox is not helped. It needs about 50 ms of idle time after `load()` to take effect. Views from before a `warm` call are not valid after it.

## How it compares

The same Pcodec bytes as any Pcodec, so the question is only how well each build runs in a page. The only other JavaScript build of Pcodec I could find is numcodecs-wasm-pco; this one is much smaller to download (5.3 times for the unpack-only file), is ready 7 to 11 times sooner after the script runs, keeps wasm memory to 6.3 MB for a big unpack, unpacks about as fast (a tie in three browsers, 11% slower in WebKitGTK) and packs about level with it (14% faster in Chromium, a tie elsewhere in the 1.6.0 re-run) but its plain `pack()` is 6% larger on the 12-column set (Pcodec 1.0.4 against 1.0.2; `smallest` mode fixes that). Details and tables: `RESULTS.md`; all speeds measured in the four browsers.

Better direction is stated in each header. Order in each cell: Chromium / Firefox / WebKitGTK / GNOME Web.

| Measure | numcodecs-wasm-pco (the only other JS Pcodec I found) | pcodec-js | Better |
|---|---:|---:|---|
| Download, unpack only (gzipped) | 324,006 B | 61,314 B (1.5.1: 75,081 B) | smaller |
| Download, with packer (gzipped) | 324,006 B | 142,786 B (1.5.1: 193,195 B) | smaller |
| Wasm memory, 4,000,000 numbers, copy unpack or streamed | not exposed | 6.3 MB (1.5.1 copy unpack: 36.3 MB; old add-on: 67.9 MB) | lower |
| Unpack, copy made (ns per number, 13 columns) | 10.68 / 10.16 / 9.17 / 9.50 | 10.45 / 9.83 / 10.16 / 9.17 | lower (a tie in Chromium, Firefox and GNOME Web; 11% slower than numcodecs-wasm-pco in WebKitGTK) |
| Unpack, view (ns per number) | not offered | 7.08 / 6.55 / 8.19 / 7.86 | lower |
| Pack 3 float columns, 850,000 numbers (ms) | 49.6 / 51.0 / 50.0 / 51.0 | 42.9 / 53.0 / 52.5 / 50.5 | lower (14% faster in Chromium, a tie elsewhere) |
| `load()` until ready (ms) | 105.5 / 66.5 / 67 / 65 | 9.0 / 9.0 / 6.0 / 6.0 | lower |
| Pack 39 columns, smallest mode (bytes) | 2,791,125 | 2,778,048 | smaller |
| First unpack after load with `warm` (ms) | not offered | 2.8 / 5 / 7 / 5 | lower |

The download, memory, unpack, pack and `load()` rows were re-measured for 1.6.0 (checked 2026-10-23): numcodecs-wasm-pco 0.4.0 against this build, 13 columns of 8 types (1,526,000 numbers; each build opens files it wrote itself at level 8 and every result is identical), the contenders taking turns in fresh pages, 8 rounds of 25 passes, median, one browser at a time in ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5. Only one of the 13 columns is big enough for the lean path, so this row mostly measures small files. Compare numbers within a row only, and treat gaps under 5% as ties (browsers other than Chromium round timers to whole milliseconds; single rounds ranged by up to 30%). The other rows are from the 1.0.0 run. Details: `CHANGELOG.md` and `RESULTS.md` section 0b.

## Prior art and credits

- **Pcodec 1.0.4** by Martin Loncaric and contributors, Apache-2.0, https://github.com/pcodec/pcodec: the whole format and the coding inside the WebAssembly programs. One 12-line patch of ours is in `wasm/pco-1.0.4-pcodec-js.patch` (the bit-unpack loop without per-number bounds checks); the full license text and the list of crates compiled in (better_io, dtype_dispatch, half, cfg-if, zerocopy, rand_xoshiro, rand_core) are in `NOTICE-pcodec.txt`.
- What Pcodec 1.0.4 changed (from its release notes, checked 2026-10-18), and what it means here: faster FloatMult and FloatQuant decompression (reader); FloatMult detection now always tries both methods, more reliable at a slight cost in compression (packer); mode sampling now uses Floyd's algorithm and shares logic with delta encoding (packer); slightly faster Lookback delta compression (packer; an algorithm change, so it applies in WebAssembly too); lzcnt on x64 (not used in our WebAssembly build). We have not measured these separately in the four browsers.
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

`python3 build.py` rebuilds the three JS files from `src/` and `wasm/`. `sh wasm/vendor.sh` (once) fetches Pcodec 1.0.4 and applies the patch, then `sh wasm/buildall.sh` rebuilds the wasm with `--locked` and `--remap-path-prefix`, so the result is the same file from any folder (checked: identical SHA-256). `node src/make-warm.js` rebuilds the warm-up files (`src/warm.json`). Run `node --expose-gc test/run.js` for the Node checks (set `READER=pcodec-js-fast.js` for the SIMD reader); the memory-retention check collects unreachable buffers every ten rounds before measuring. Node is used for these pass/fail checks only; speed is measured in the four browsers.
