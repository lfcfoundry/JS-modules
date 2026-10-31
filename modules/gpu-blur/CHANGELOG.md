# gpu-blur changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-30
- New opt-in threads route for web pages served with the isolation headers: big pictures blur on several cores sharing one memory, often a little faster than the helpers route, with the same picture.

## 1.1.0 · API 1 · 2026-10-30
- New opt-in helpers route: big pictures blur on several cores at once, about 0.5 to 0.85x the time in Chromium and Firefox, with the same picture.

## 1.0.1 · API 1 · 2026-10-30
- Blurring in WebAssembly is about a third faster (0.60 to 0.80x the time) with exactly the same picture.

## 1.0.0 · API 1 · 2026-10-23
- New: GpuBlur, a picture blur that uses WebGL 2 where the device is fast at it, then WebAssembly, then plain JavaScript. All three give the same picture, and big jobs run in short slices.
