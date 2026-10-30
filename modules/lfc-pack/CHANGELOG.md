# lfc-pack changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 0.1.10 · API 0 · 2026-10-29
- New experimental unpackColumns reads flat-row files as typed columns without building row objects.

## 0.1.9 · API 0 · 2026-10-27
- New opt-in `packParallel(bytes, { workers })`: helper Web Workers pack runs of whole blocks at the same time (at most min(cores, 8)); the file has the same bytes as `pack`. Exact mode and small inputs stay on one thread.

## 0.1.8 · API 0 · 2026-10-27
- The unpack pool starts 2 helpers when you do not say how many (it used to start up to 16): at 105 MB more helpers did not read faster and ran Firefox out of memory. Ask for more with workers.

## 0.1.7 · API 0 · 2026-10-27
- Flat number-list columns decode to small integers (variant 19), faster hex, address and dictionary checks when packing text; files and rows unchanged.

## 0.1.6 · API 0 · 2026-10-26
- Flat writer also reads strings, true/false and null in wasm; flat list columns read faster (number decoder, Firefox and WebKitGTK builders); output files unchanged.

## 0.1.6 · API 0 · 2026-10-26
- Flat writer also reads strings, true/false and null in wasm; flat list columns read faster (number decoder, Firefox and WebKitGTK builders); output files unchanged.

## 0.1.6 · API 0 · 2026-10-26
- Flat writer also reads strings, true/false and null in wasm; flat list columns read faster in Firefox and WebKitGTK; output files unchanged.

## 0.1.5 · API 0 · 2026-10-26
- Dense rows (many keys per row) read much faster in Chromium and WebKitGTK; a one-time timing check keeps the old way where cloning would not help.

## 0.1.4 · API 0 · 2026-10-26
- New Python writer (python/lfc_pack_write.py): packs NDJSON from Python into files that open in lfc-pack.js, with the byte-exact switch.

## 0.1.3 · API 0 · 2026-10-26
- Faster pack for rows of plain numbers, and for link lists packed with { block: "flat" } (a small WebAssembly scanner); such files are also smaller.

## 0.1.2 · API 0 · 2026-10-26
- Log-template columns read about 1.7 to 2.7 times faster (a small WebAssembly rebuild; the old code stays as the fallback).

## 0.1.1 · API 0 · 2026-10-26
- Link-list columns (357,110 down to 211,344 bytes on 30,000 nodes). Nested blocks 8 to 9% smaller. Log templates only when smaller and not slower to read. New decoder-only lfc-pack-read.js (51 KB gzipped, was 214 KB).

## 0.1.0 · API 0 · 2026-10-26
- First version: packs NDJSON into LFC-pack (.json.lfc) and reads it back with JSON.parse values, in WebAssembly.
- Nested and flat column layouts, automatic log templates, byte-exact switch, archive level, key and time-range reads, helper workers, Python reader.
- `packRows(rows)` takes row objects directly; `packTables({ nodes, links, view, ... })` / `unpackTables(file)` keep several tables and plain values in one file.
- The format is not frozen: 0.x files may not open in later versions.
