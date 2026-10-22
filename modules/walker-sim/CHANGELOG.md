# walker-sim changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 2.3.0 · API 2 · 2026-10-22
- The WebAssembly loop now starts compiling in the background when the file loads; walker-sim-wasm adds wasmReady() and wasmModule().

## 2.2.0 · API 2 · 2026-10-18
- The default file is now walker-sim-with-wasm.js: big runs use the WebAssembly walking loop first (about 1.5 times faster in Chromium and Firefox), and the JavaScript loop when WebAssembly is not usable. Same counts either way.
- In WebKitGTK and GNOME Web a fresh page is about 15% to 30% slower with it; set cfg.wasm = false or copy walker-sim.js there.

## 2.1.0 · API 2 · 2026-10-17
- Faster, with the same answers: a million walkers run about 2.3 times faster in the test browsers.

## 2.0.0 · API 2 · 2026-10-17
- The random-number menu moved to an optional file, and very large runs (over 100,000 walkers) give different counts for the same seed. Smaller runs are exactly the same.

## 1.0.0 · API 1 · 2026-10-17
- New module: sends random walkers through a network and reports where they end, how many steps and what it cost, with a 95% range on every result.
