Copyright (c) 2026 LFC Foundry. MIT License.

# Brief for the JS-modules code thread: two lfc-pack pack speedups (research 2026-11-11)

Send this only after the owner approves it on the card. The evidence is in [RESEARCH.md](RESEARCH.md) (E2, E3). Both changes write byte-identical files, so readers are not affected.

## B1: UUID text to bytes (src/flat.js, encodeColumn, `U` branch)

Replace:
```js
raw = new Uint8Array(n * 16); for (i = 0; i < n; i++) { var hx = v[i].replace(/-/g, ''); for (j = 0; j < 32; j += 2) raw[p++] = parseInt(hx.substr(j, 2), 16); }
```
with:
```js
raw = new Uint8Array(n * 16); for (i = 0; i < n; i++) { x = v[i]; for (j = 0; j < 36; j += 2) { if (j === 8 || j === 13 || j === 18 || j === 23) j++; raw[p++] = (hexv(x.charCodeAt(j)) << 4) | hexv(x.charCodeAt(j + 1)); } }
```
Research screen: pack takes 0.74 to 0.91 of the time on UUID-heavy blocks in Chromium 156, Firefox 158 and WebKitGTK 2.52.6, and it was never slower. Gate: the usual tests, plus an early-stop A/B on a UUID-heavy set.

## B2: choose each flat column's encoding from a sample

In both `cand()` functions (encodeColumn and the fast writer), estimate each candidate's size instead of compressing it in full:
- Frames of 64 KB or less: compress exactly.
- Larger frames: compress 4 evenly spaced 16 KB slices (8-byte aligned) and scale the result, capped at the raw size.

Keep the candidate with the smallest estimate, then compress only that one in full, with the stored-raw fallback, before its meta is written. The prototype is `experiments/mkvar.py`, kind `sample` (the `__est` and `__fin` functions).

Required before shipping:
1. **Close-call guard:** if the best two estimates are within 2% of each other, compress both in full and keep the smaller.
2. **Corpus size gate:** every real-corpus file must be at or below its 0.8.1 size. Any larger file goes on an owner card, and a file must never be larger than plain zstd.
3. **Speed gate:** a three-browser early-stop A/B on logs, sensor-style and nested data. The nested control must stay neutral.

Research screen: pack takes 0.85 to 0.96 of the time on 300,000-row number and log sets, with bytes identical on 10 made-up sets.

Changelog note for users (one plain line each): "Packing UUID columns is faster." / "Packing picks each column's layout faster."
