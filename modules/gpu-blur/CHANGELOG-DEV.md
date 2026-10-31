# gpu-blur developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.3.1 · API 1 · 2026-10-31

### Quick
Fix, no API change: when two blur() calls use the helpers at once, the first to finish no longer starts the idle closing clock under the other (that call used to fall back to the one-thread wasm route). Old code needs no change.

### Deep
Found while checking every helper pool for idle-close timers that overlapping calls could orphan (zip-open 1.10.0 finding, PR 356). helpersRoute started the idle closing clock when any call finished, even while another call still had bands on the helpers; with idleMs 0 (or a long blur and the 5 s default) closeHelpers failed the other call's bands and it fell back to the one-thread wasm route. Now the pool counts calls in flight (H.busy, counted after the last synchronous throw) and only the last one to finish starts the clock. The threads route was already safe (jobs run one after another on T.chain). New check tests/gpu-blur-concurrent-browser.js: 1.3.0 fails (the long call ran on wasm in all 4 rounds, Chromium 155), 1.3.1 passes in all 3 browsers; gpu-blur-helpers-browser.js same bytes in 3 browsers; Node 32 passed. Not timed: one add per call.

## 1.3.0 · API 1 · 2026-10-31

### Quick
New: `opts.into` also takes RGBA bytes for out 'pixels' (the result is written into your array, and `result.pixels` is that array). Old code is unaffected: a canvas in `opts.into` works as before. Bytes in, radius 12, against a fresh array: one-thread WebAssembly 0.91 to 1.49x, helpers 0.98 to 1.21x, threads 1.06 to 1.43x.

### Details
Every route honors it: WebGL 2 reads straight into the array (also a view with a byte offset), WebAssembly copies its result into it, plain JavaScript copies out of its work memory (it used to hand back a view of it), the helpers write their bands into it, and the threads route copies out of shared memory into it. A `Uint8ClampedArray` or a `Uint8Array` of exactly width x height x 4 is used; any other length is left untouched and a new array is made. `blurSync()` honors it too. The private `_intoPx` test switch of 1.2.3 still works. tests/gpu-blur-into-browser.js: 420 same-byte cases in Chromium and WebKitGTK, 332 in Firefox (no WebGL 2 in its test machine), with three kinds of arrays (clamped, plain, offset view), a wrong length, `blurSync()`, and a canvas in `opts.into` for out 'canvas'; then times with and without it, 3 calls in a row, 7 rounds, on a 4-core machine.

### Deep
Round 4 pool brief, item 2; the owner picked "Add it" on its card (2026-10-31). Stacked with 1.2.3's kept helper bands, against 1.2.2 (960 x 540 / 1080p / 4K): Chromium 1.19/1.34/1.43x, Firefox 1.51/1.47/1.74x, WebKitGTK 1.09/1.32/1.09x; threads route with `into` against 1.2.2: Chromium 1.35/1.23/1.18x, Firefox 1.10/1.08/1.12x, WebKitGTK 1.20/1.44/1.13x. The one slower cell (Chromium one-thread WebAssembly 960 x 540, 8.6 vs 7.8 ms) is within this machine's noise; Firefox 4K one-thread was the biggest gain (227 to 152 ms, the fresh 33 MB array's zero fill and collection). WebGL 2 was not timed (software rendering on the test machine). While testing: WebKitGTK rounds a WebGL canvas drawn into a 2D canvas differently on see-through pixels (up to 3 levels); 1.2.3 does the same, so the canvas check uses opaque pictures.

## 1.2.3 · API 1 · 2026-10-31

### Quick
Helpers reuse their band memory between calls; same bytes, no new options. Bytes in, against 1.2.2: Chromium 1.22 to 1.31x, Firefox 1.10 to 1.34x, WebKitGTK 0.99 to 1.09x.

### Details
From the round 4 pool study: the pool's hidden cost was fresh multi-megabyte buffers on every call (zero-filled, paged in, later collected). Now the page keeps one band buffer per helper (reused when the next band is between 1x and 2x its size), the helper writes its result into the buffer it received and hands it back, and the page wraps it without another copy. The threads route keeps its out-of-shared-memory copy for canvas output the same way. tests/gpu-blur-pool-reuse-browser.js: 161 same-byte cases (sizes going up and down so buffers are reused, grown and dropped; canvas in and out), then 3 calls in a row per mode, 9 rounds, radius 12.

### Deep
Round 4 pool brief, item 1. Kept bands alone: Chromium 1.22/1.22/1.31x (960x540/1080p/4K), Firefox 1.24/1.10/1.34x, WebKitGTK 0.99/1.09/1.08x. Not shipped yet (needs the owner's card, a new option): letting the caller pass an output array to reuse: helpers kept bands + out 1.24 to 1.69x over 1.2.2 in Chromium, 1.36 to 1.61x Firefox, 1.12 to 1.56x WebKitGTK; 4K is 3.1 to 3.5x the one-thread speed.

## 1.2.2 · API 1 · 2026-10-30

### Quick
Big canvases blur fully again (the top rows came back blank above about 0.5 megapixel).

### Details
The one-thread canvas route copies a big picture into its reading canvas in bands of 500,000 pixels. Each band was drawn with the 'copy' blend, which clears everything outside what it draws, so every band wiped the ones before it and only the last survived. Now only the first band uses 'copy'. Bytes in, the helpers route and the threads route were never affected. New test tests/gpu-blur-big-canvas-browser.js: 641x359 to 1920x1080, wasm and JavaScript, canvas to pixels and to canvas, every byte against blurring the bytes: 16 of 16 same in all three browsers; on 1.2.1, 12 of 16 differ (every case over 500,000 pixels).

### Deep
Fix: banded drawImage with 'copy' wiped earlier bands; only the first band uses 'copy'. Found while checking the round 4 pool work (the canvas reference itself was wrong). 16/16 same bytes in Chromium, Firefox, WebKitGTK; 1.2.1 failed 12/16.

## 1.2.1 · API 1 · 2026-10-30

### Quick
Helpers route default worker count is now hardwareConcurrency (was cores - 1); threads route keeps cores - 1. Every core vs cores - 1, warm helpers, r12: Chromium 0.86-1.06x, Firefox 0.69-0.96x, WebKitGTK 0.84-1.10x, most about 0.9x. Same bytes.

### Details
From the discarded-ideas retest: 4 workers on 4 cores lost to 3 with the old 32-bit kernel and wins with the 16-bit one. helperCount(opts, w, h, spare): every core unless spare (threads route), opts.workers still overrides. The threads route with every core was 1.02-1.22x in Firefox, so it keeps cores - 1. The 0.3 megapixel cut-off stays: with helpers already started they win from 640x360 (0.71-0.85x).

### Deep
gpu-blur 1.2.1: helpers default every core. Container, sequential blocks of 9 after a warm-up, radius 12, helpers 4 vs 3 ms: Chromium 2.9/3.2, 5.7/6.2, 8.7/9.4, 20.8/19.7, 82.3/95.2; Firefox 2.4/3.0, 5.8/6.6, 9.0/13.0, 19.7/22.1, 77.2/80.5; WebKitGTK 3.4/3.6, 6.7/7.7, 9.8/11.0, 22.0/20.0, 66.7/79.3 (640x360 to 3840x2160). Threads 4 vs 3 Firefox 2.4/2.2, 7.3/6.4, 9.2/9.0, 20.3/16.6, 82.9/72.6. Same bytes: helpers 90 cases and threads 91 cases in all 3 browsers.

## 1.2.0 · API 1 · 2026-10-30

### Quick
route: 'threads' in blur() runs the 16-bit kernel as WebAssembly threads on one shared memory (rows, then column strips; no halo rows, no band copies), same bytes. Needs a cross-origin isolated page; otherwise gives way to helpers, then one-thread wasm. Container 4 cores against helpers: Chromium 0.78-1.12x, Firefox 0.74-1.14x (most 0.8-0.9x); against 1.0.0 one-thread wasm 0.32-0.52x. WebKitGTK cannot hand shared memory to a worker and runs helpers.

### Details
Research brief F, stacked on D (16-bit kernel) and B (helpers). wasm/blur.c builds a second time with -DTHREADS into blurmt.wasm (2,768 bytes, embedded between WASMT:BEGIN/END): no static data, shared imported memory, km(n) exported and passed into hrows/vcols, vcols walks any number of strips. The default blur.wasm is byte for byte unchanged (build.sh --check covers both). One pool of n workers (cores - 1 or opts.workers) per shared memory, maximum sized to the next power of two of the job's pages; jobs on it run one at a time; idleMs and release() as for helpers. info().threads tells whether this page can use it. A failed start is remembered until release(). New tests/gpu-blur-threads-browser.js: 91 same-byte cases, fallback on a page without isolation, timings of 1.0.0 wasm, wasm, helpers and threads.

### Deep
gpu-blur 1.2.0: opt-in threads route (brief F) stacked on helpers (B) and the 16-bit kernel (D). Same bytes in 91 cases x 3 browsers (WebKitGTK through helpers). Container REPS 7, threads/helpers: Chromium 0.85, 0.96, 0.83 at 1280x720 r4/12/40; 1.12, 0.84, 0.92 at 1920x1080; 0.80, 0.97, 0.78 at 3840x2160. Firefox 1.00, 1.06, 0.74; 0.90, 0.79, 0.81; 0.86, 1.14, 0.91. Fastest multicore route against 1.0.0 one-thread wasm: Chromium 0.32-0.52, Firefox 0.32-0.49, WebKitGTK (helpers) 0.27-0.43.

## 1.1.0 · API 1 · 2026-10-30

### Quick
route: 'helpers' (or workers: n) in blur() runs the WebAssembly kernel on row bands in background workers with 3b halo rows, same bytes. Above about 0.3 megapixel and 3+ cores; falls back to one-thread wasm without worker-src blob:. Container 4 cores against one-thread wasm: Chromium 0.51-0.85x, Firefox 0.50-0.85x, WebKitGTK 0.87-1.06x (1280x720 to 3840x2160).

### Details
Research brief B (stacked on brief D's 16-bit kernel, gpu-blur 1.0.1). The helpers receive the compiled WebAssembly.Module once, keep it, and blur bands of ceil(h / n) rows plus 3b halo rows each; the page copies each band in (bytes slice or getImageData of a scratch canvas) and writes each result as it arrives (px.set or putImageData per band). Pool kept for idleMs (5000), ended by release(). blurSync never uses helpers. The code that makes a blob: address and Workers sits between //@helpers-begin and //@helpers-end; test/run.js checks there is none outside it. New tests/gpu-blur-helpers-browser.js: 90 same-byte cases, fallback to wasm under worker-src 'none', small pictures stay on wasm, timings.

### Deep
gpu-blur 1.1.0: opt-in helpers route (brief B) stacked with the 16-bit kernel (D). Same bytes in 90 cases x 3 browsers. Helpers/one-thread wasm (container, 4 cores, 3 helpers): Chromium 0.63-0.85 at 1280x720, 0.63-0.70 at 1920x1080, 0.51-0.66 at 3840x2160; Firefox 0.69-0.85, 0.50-0.71, 0.52-0.58; WebKitGTK 0.90-1.05, 0.87-1.06, 0.99-1.05. Strict policy without worker-src blob: falls back to wasm in all three.

## 1.0.1 · API 1 · 2026-10-30

### Quick
The WebAssembly kernel now works on 16-bit lanes (two pixels per 128-bit step instead of one): 0.60 to 0.80x the time at 640x360 and 1920x1080, radius 4 to 40, in Chromium, Firefox and WebKitGTK; same bytes out.

### Details
wasm/blur.c: box sums in i16x8 lanes (the largest box sum, 255 x 101 for radius 100, fits 16 bits unsigned with the scaled multiply), first pass reads two rows at once; scratch rows grow from w*4 to w*8 bytes (wasmJob). blur.wasm 3,027 bytes, rebuilt with wasm/build.sh. Container 1920x1080 medians: Chromium 46.6-47.0 to 30.4-32.8 ms, Firefox 50-51 to 32-34, WebKitGTK 54-62 to 35-38. test/run.js oracle sizes now include 37x21, 129x70 and 300x7; the wasm mutant in test/mutants.js targets the new kernel (7 of 7 caught).

### Deep
gpu-blur 1.0.1: 16-bit-lane WebAssembly kernel (research brief D). Same bytes in all cases. Container medians, new/old: Chromium 0.64-0.70, Firefox 0.60-0.75, WebKitGTK 0.61-0.80 over 640x360 and 1920x1080 at radius 4, 12, 40. Tests: run.js 31 pass, fuzz 24 seeds, mutants 7/7.

## 1.0.0 · API 1 · 2026-10-23

### Quick
New: GpuBlur, a picture blur that uses WebGL 2 where the device is fast at it, then WebAssembly, then plain JavaScript. All three give the same picture, and big jobs run in short slices.
