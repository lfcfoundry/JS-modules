# elias-fano changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.3.0 · API 1 · 2026-10-25
- New: EliasFano.intersect([a, b, ...]) finds the values common to several lists (flat, partitioned or mixed) without unpacking any of them, in one WebAssembly call.

## 1.2.0 · API 1 · 2026-10-25
- New: partitioned lists (buildPartitioned / openPartitioned). Each chunk of 128 values is stored as a plain run, a bitmap or Elias-Fano, whichever is smallest: up to 37% smaller than flat Elias-Fano on dense lists.

## 1.1.0 · API 1 · 2026-10-25
- New: rank(x) and rankMany(xs) (how many values are at or below x), answered without unpacking. The runtime version now reads the real label.

## 1.0.0 · API 1 · 2026-10-25
- New module: sorted number lists packed small and searched without unpacking.
