# elias-fano changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.8.1 · API 1 · 2026-10-31
- Starts a little faster: the built-in WebAssembly program is now turned back into bytes by the browser's own base64 decoder (Uint8Array.fromBase64) where there is one; older browsers use the old way. Nothing else changes.

## 1.8.0 · API 1 · 2026-10-31
- Repeat decodes of big lists are 2 to 25% faster by themselves (a spare array is made while idle), and 20 to 35% faster when toArray(out) or slice(a, b, out) fills your own Uint32Array.

## 1.7.0 · API 1 · 2026-10-31
- New: trim() gives back memory that big lists left behind (24 MB to 1.8 MB after a 5-million-id build); autoTrim does it by itself after a big job (on by default; autoTrim(false) turns it off).

## 1.6.0 · API 1 · 2026-10-30
- New compact() halves the memory a list uses while you read it (1.69 MB instead of 3.38 MB for 1,000,000 ids); getMany now refuses out-of-range positions instead of hanging.

## 1.5.0 · API 1 · 2026-10-30
- New Lists.getMany reads many lists in one WebAssembly call.

## 1.4.0 · API 1 · 2026-10-25
- intersect is 1.4 to 2.5x faster than a plain linear merge on lists of similar size: blocks of both lists are unpacked and merged, and stretches that cannot match are skipped.

## 1.3.1 · API 1 · 2026-10-25
- Damaged or hostile blobs are refused when opened (a RangeError) instead of being read past their end: list headers, list-set offsets and partitioned lists are checked.

## 1.3.0 · API 1 · 2026-10-25
- New: EliasFano.intersect([a, b, ...]) finds the values common to several lists (flat, partitioned or mixed) without unpacking any of them, in one WebAssembly call.

## 1.2.0 · API 1 · 2026-10-25
- New: partitioned lists (buildPartitioned / openPartitioned). Each chunk of 128 values is stored as a plain run, a bitmap or Elias-Fano, whichever is smallest: up to 37% smaller than flat Elias-Fano on dense lists.

## 1.1.0 · API 1 · 2026-10-25
- New: rank(x) and rankMany(xs) (how many values are at or below x), answered without unpacking. The runtime version now reads the real label.

## 1.0.0 · API 1 · 2026-10-25
- New module: sorted number lists packed small and searched without unpacking.
