# gpu-blur developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

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
