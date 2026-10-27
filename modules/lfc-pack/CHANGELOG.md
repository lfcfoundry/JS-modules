# lfc-pack changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 0.1.4 · API 0 · 2026-10-26
- New Python writer (python/lfc_pack_write.py): packs NDJSON from Python into files that open in lfc-pack.js, with the byte-exact switch.

## 0.1.3 · API 0 · 2026-10-26
- Faster pack for rows of plain numbers and number lists (a small WebAssembly scanner); such files are also smaller.

## 0.1.2 · API 0 · 2026-10-26
- Log-template columns read about 1.7 to 2.7 times faster (a small WebAssembly rebuild; the old code stays as the fallback).

## 0.1.1 · API 0 · 2026-10-26
- Link-list columns (357,110 down to 211,344 bytes on 30,000 nodes). Nested blocks 8 to 9% smaller. Log templates only when smaller and not slower to read. New decoder-only lfc-pack-read.js (51 KB gzipped, was 214 KB).

## 0.1.0 · API 0 · 2026-10-26
- First version: packs NDJSON into LFC-pack (.json.lfc) and reads it back with JSON.parse values, in WebAssembly.
- Nested and flat column layouts, automatic log templates, byte-exact switch, archive level, key and time-range reads, helper workers, Python reader.
- `packRows(rows)` takes row objects directly; `packTables({ nodes, links, view, ... })` / `unpackTables(file)` keep several tables and plain values in one file.
- The format is not frozen: 0.x files may not open in later versions.
