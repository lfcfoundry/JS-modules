# lzma-decode

A small LZMA1 decoder in about 130 lines of plain ES5 JavaScript: readable, commented, tested against Python's own `lzma` module. Use it to unpack LZMA data in the browser, which can only unpack gzip and deflate natively. The matching packer is [`tools/lzma-pack`](../../tools/lzma-pack/README.md).

**Test it:** `node modules/lzma-decode/test/run.js` (needs `python3` on the PATH; offline).

## Quick start

```html
<script src="lzma-decode.js"></script>
<script>
  // bytes: a Uint8Array holding a raw LZMA1 stream WITHOUT its leading zero byte; 'size' is the decoded length
  var out = lzmaDecode(bytes, size, { lc: 3, lp: 0, pb: 2 });
</script>
```

```js
var lzmaDecode = require('./lzma-decode.js');   // Node
var data = lzmaDecode.file(fs.readFileSync('x.lzma'), knownSizeIfHeaderSaysUnknown);
```

Make a raw stream in Python: `lzma.compress(data, format=lzma.FORMAT_RAW, filters=[{"id": lzma.FILTER_LZMA1, "lc": 4, "lp": 0, "pb": 0, "dict_size": 1 << 20, "preset": 9}])[1:]` (the `[1:]` drops the always-zero first byte).

## API

| Call | Meaning |
|---|---|
| `lzmaDecode(src, outSize, opts)` | `src` raw stream minus its leading zero byte; `outSize` exact result length; `opts.lc` (0-8, default 4), `opts.lp` (0-4, default 0), `opts.pb` (0-4, default 0). Returns `Uint8Array`. Throws on a cut-short stream or a distance before the start of the output. |
| `lzmaDecode.file(bytes, size?)` | A `.lzma` file with its 13-byte header. If the header says "size unknown" (xz and Python write that) pass `size`. |

## How it differs from existing open source

- **The [`lzma` package on npm](https://www.npmjs.com/package/lzma)** (a JavaScript LZMA library that can compress as well as decompress) and **[kripken/lzma.js](https://github.com/kripken/lzma.js)** (as far as I know an Emscripten build of the C LZMA code) are the established ways to use LZMA from JavaScript. Use one of them if you need to *compress* in the browser. This decoder is smaller because it only decodes, and it is a single readable function.
- **`.xz` (LZMA2) decoders**, including WebAssembly builds, exist for the newer container; this decodes only LZMA1.
- **[Roadroller](https://github.com/lifthrasiir/roadroller)** (MIT, by lifthrasiir) is a far stronger packer for JavaScript source, built for size-limited demo contests such as js13k, and it can beat LZMA on code. By its own description it trades speed for size, so it suits small inputs of code; this packer is for whole pages with larger embedded data, where LZMA is fast and simple.
- **[js13k-packer](https://www.npmjs.com/package/js13k-packer)** wraps a contest entry for the js13k rules; it is about packaging files rather than a custom decoder.
- What is specific here: the packer (see `tools/lzma-pack`) produces a *single* HTML file, stores the compressed bytes raw (the `windows-1252` trick below) to avoid the 25-33% growth of text encodings, checks a hash of the unpacked page, and ships a decoder you can read in one sitting.

I confirmed that these projects exist, from web search results, but I did not install or benchmark them. Read each project's own README before relying on this comparison.

Inside this repository, [`tools/single-file-tools`](../../tools/single-file-tools/README.md) has a Zopfli-deflate packer that needs no decoder at all (the browser unpacks deflate natively). That wins for small pages. LZMA compresses larger code-and-data pages tighter, at the price of this decoder (about 2.6 KB minified).

## Limits and gotchas

- No streaming and no checksum in LZMA itself: the whole result is built in memory, and corrupt input is only detected when it points outside the data or runs out.
- lc 5-8 are accepted but untested: liblzma (what Python and xz use) only writes streams with lc + lp of 4 or less.
- The output buffer doubles as the dictionary, so the dictionary size in a `.lzma` header is ignored.

## For AI agents

- The decoder is a direct state machine from the LZMA specification: `isMatch`, `isRep`, `isRepG0/G1/G2`, `isRep0Long`, `posSlot`, `posSpecial`, `align`, two length coders, and `literal`. Do not "simplify" the order of bit decodes: one misplaced call corrupts everything after it, usually without an error.
- Keep `lzmaDecodeFile` the last function before the export line: `tools/lzma-pack/pack.py` cuts the file there when it embeds the decoder in a packed page.
- The file must stay ES5 syntax (repository rule). Run the test after any change; it compares with liblzma on 6 kinds of data, 8 settings combinations, sizes from 1 byte to 1.5 MB, and checks error handling and speed.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Fancy, the Banana](https://github.com/JNFoo/fancy-banana)
