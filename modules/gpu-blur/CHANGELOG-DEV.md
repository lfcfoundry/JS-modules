# gpu-blur developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

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
