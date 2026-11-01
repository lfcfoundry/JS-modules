# gif-writer changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.6.2 · API 1 · 2026-10-31
- Starts a little faster: the built-in WebAssembly program is now turned back into bytes by the browser's own base64 decoder (Uint8Array.fromBase64) where there is one; older browsers use the old way. Nothing else changes.

## 1.6.1 · API 1 · 2026-10-30
- Picture effects (blur, sharpen, glow, color grade) run faster: 0.67 to 0.92x the time, with exactly the same pictures.

## 1.6.0 · API 1 · 2026-10-30
- Optional thorough palette: counts every pixel for slightly smaller files.

## 1.5.1 · API 1 · 2026-10-27
- A frame delay above 655,350 ms is capped instead of wrapping in the GIF's 16-bit field.

## 1.5.0 · API 1 · 2026-10-25
- Optional picture filters, animation timing, a worker and a size tolerance, cut from Netflow Map.

## 1.4.0 · API 1 · 2026-10-24
- Faster palette search on big inputs (3x fewer pixels looked at above 100,000 pixels, from 143-152 ms to about 55 ms for 8 pictures of 160x160). A GIF made from such pictures is not byte-identical to one from 1.3.0.

## 1.3.0 · API 1 · 2026-10-22
- The WebAssembly program now starts compiling in the background when the file loads; adds wasmReady() and wasmModule().

## 1.2.0 · API 1 · 2026-10-18
- Pictures are written 1.1 to 2.3 times faster and palettes up to 1.7 times faster with WebAssembly, same colors and bytes. The palette for flat pictures is up to 11% slower in the two WebKit browsers. The fast path needs 'wasm-unsafe-eval'.

## 1.1.0 · API 1 · 2026-10-17
- Busy, photo-like animations now make their GIF about 1.3 to 3 times faster to prepare in the four test browsers, and the pictures are written faster too.

## 1.0.0 · API 1 · 2026-10-17
- New module: turns pictures drawn on a canvas into an animated GIF in the browser or in Node, with no libraries. Colors stay steady from picture to picture and only the changed part of each picture is written, so files stay small.
