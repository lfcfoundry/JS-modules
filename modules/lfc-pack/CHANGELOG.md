# lfc-pack changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 0.1.0 · API 0 · 2026-10-26
- First version: packs NDJSON into LFC-pack (.json.lfc) and reads it back with JSON.parse values, in WebAssembly.
- Nested and flat column layouts, automatic log templates, byte-exact switch, archive level, key and time-range reads, helper workers, Python reader.
- The format is not frozen: 0.x files may not open in later versions.
