# lzma-decode

**Version 1.2.0 · API 1**

**Tested in:** Node 22.22.0 (346 lzma-decode checks); tests/wasm-default-bench.js one browser at a time on 2026-10-18: Firefox 158.0 (reports 158.0b5), ungoogled-chromium 155.0.8059.39-1, WebKitGTK 2.52.6 (MiniBrowser), GNOME Web (Epiphany) 46.5; the default file also on a page without WebAssembly in all four

An LZMA1 decoder that tries WebAssembly first and falls back by itself to a small JavaScript decoder (about 135 lines with ES5 syntax, one ES2015 method, see limits: readable, commented, tested against Python's own `lzma` module). Use it to unpack LZMA data in the browser, which can only unpack gzip and deflate natively. The matching packer is [`tools/lzma-pack`](../../tools/lzma-pack/README.md).

It reads the compressed bytes one bit at a time through a range coder with the standard LZMA probability model, and writes the result into one output buffer that also serves as the dictionary for copying earlier data forward. It was written from the published LZMA specification and takes the stream and the exact decoded length as input.

## Why it exists

A browser can only unpack gzip and deflate natively, so a page packed with LZMA needs a decoder that travels with it. This one is small and readable in one sitting, which suits the self-unpacking pages made by `tools/lzma-pack`; it only decodes, so it stays short.

## Use

Copy `lzma-decode-with-wasm.js`, the default file. `lzmaDecode` in it uses WebAssembly when the page allows it and the JavaScript decoder when it does not, so the same call always works and gives the same bytes.

```html
<script src="lzma-decode-with-wasm.js"></script>
<script>
  // bytes: a Uint8Array holding a raw LZMA1 stream WITHOUT its leading zero byte; 'size' is the decoded length
  var out = lzmaDecode(bytes, size, { lc: 3, lp: 0, pb: 2 });
  // lzmaDecode.engine says which decoder did the last call: 'wasm' or 'js'
</script>
```

```js
var lzmaDecode = require('./lzma-decode-with-wasm.js');   // Node
var data = lzmaDecode.file(fs.readFileSync('x.lzma'), knownSizeIfHeaderSaysUnknown);
```

Need the page as small as possible and nothing else? Copy `lzma-decode.js` instead: the plain JavaScript decoder alone (see "Which file to copy" below).

Make a raw stream in Python: `lzma.compress(data, format=lzma.FORMAT_RAW, filters=[{"id": lzma.FILTER_LZMA1, "lc": 4, "lp": 0, "pb": 0, "dict_size": 1 << 20, "preset": 9}])[1:]` (the `[1:]` drops the always-zero first byte).

Test it: `node modules/lzma-decode/test/run.js` (needs `python3` on the PATH; offline; also runs the WebAssembly part and the default file against the same data). It compares with liblzma on 6 kinds of data, 8 settings combinations and sizes from 1 byte to 1.5 MB, and checks error handling and speed. Browser timings: `tests/wasm-default-bench.js` (plain file against default file, one browser at a time) and `tests/lzma-wasm-browser.js` (packed pages).

## API

| Call | Meaning |
|---|---|
| `lzmaDecode(src, outSize, opts)` | `src` raw stream minus its leading zero byte; `outSize` exact result length; `opts.lc` (0-8, default 4), `opts.lp` (0-4, default 0), `opts.pb` (0-4, default 0), `opts.maxSize` (optional ceiling for `outSize`). Returns `Uint8Array`. Throws on a cut-short stream (as soon as it reads past the end), a distance before the start of the output, or `outSize` above `maxSize`. |
| `lzmaDecode.file(bytes, size?, opts?)` | A `.lzma` file with its 13-byte header. If the header says "size unknown" (xz and Python write that) pass `size`. `opts.maxSize` works here too; the other settings come from the header. |
| `lzmaDecode.engine`, `.available`, `.plain` | In the default file: `.engine` is `'wasm'` or `'js'` (which decoder did the last call); `.available` says whether WebAssembly was usable on this page; `.plain` is the JavaScript decoder alone. `lzmaDecodeWasm` is another name for `lzmaDecode`, kept for pages written for 1.1.0. |

Set `maxSize` whenever the data or its size did not come from your own packer: a `.lzma` header can ask for up to 4 GB, which is a `RangeError` or an out-of-memory tab. `lzma-pack`'s own pages do not need it.

### WebAssembly first (the default since 1.2.0)

`lzmaDecode` in the default file decodes with a 4,087-byte WebAssembly program and hands the call to the JavaScript decoder when it cannot: the page's Content-Security-Policy lacks `'wasm-unsafe-eval'` (Chromium and Firefox), the browser is too old, lc + lp is above 4, or the stream is bad (the JavaScript decoder then throws its own error messages). Either way the bytes are the same.

### Which file to copy

| File | What it is | Size (smaller is better) |
|---|---|---|
| `lzma-decode-with-wasm.js` | **The default.** WebAssembly first, JavaScript fallback, in one file. | 20,787 bytes (8,238 gzipped) |
| `lzma-decode.js` | The plain JavaScript decoder alone: readable, works under any page policy, and the part `tools/lzma-pack` pastes into packed pages. Use it when the page must stay as small as possible. | 9,530 bytes (3,709 gzipped); about 1.9 KB in a packed page |
| `lzma-decode-wasm.js` | The WebAssembly part alone, to load after `lzma-decode.js` (it adds `lzmaDecodeWasm`). The default file already holds both. | 10,433 bytes |

`lzma-decode-with-wasm.js` is built from the other two by `node modules/lzma-decode/wasm/join.js`; edit those, never the joined file (the tests fail when it is stale).

First decode of the 569,513-byte Pineapple Defense page (141,872 bytes of LZMA), in a fresh page each time, median of 7, the plain file and the default file taking turns, compile time of the WebAssembly module included, in milliseconds (smaller is better; headless desktop runs on one machine, phones not measured):

| Browser | Plain file | Default file | Speed-up (higher is better) |
|---|---|---|---|
| ungoogled-chromium 155.0.8059.39-1 | 46.6 | 17.9 | 2.60x |
| Firefox 158.0 (reports 158.0b5) | 38.0 | 24.0 | 1.58x |
| WebKitGTK 2.52.6 | 37.0 | 25.0 | 1.48x |
| GNOME Web 46.5 | 38.0 | 25.0 | 1.52x |

The same default file loaded on a page whose policy forbids WebAssembly decoded the same bytes on the JavaScript path in all four browsers. A warm 1.5 MB decode in Node 22 (a Node figure, not a browser one): 98.6 ms (JavaScript) to 47.3 ms (WebAssembly), 2.1x. The result is a copy with its own buffer of exactly `outSize` bytes, so the 2x working memory of the run is freed at once. Source: `wasm/lzma-decode.c` (a line-for-line port of `lzma-decode.js`), `wasm/build.sh` rebuilds `wasm/lzma-decode.wasm` (clang with the wasm32 target; 4,087 bytes, kept under 4,096 so Chromium compiles it on the main thread), `wasm/embed.py` puts it into `lzma-decode-wasm.js`, and `wasm/join.js` builds the default file.

## How it compares

Smaller than the npm `lzma` decoder (the only other one with a size on record here) and readable in one sitting, but it only decodes. Speed against the other libraries in browsers: not measured.

| Alternative | Size (smaller is better) | Speed (faster is better) | Features | Where it wins or loses |
|---|---|---|---|---|
| lzma-decode 1.2.0 (MIT, this module) | Default file 20,787 bytes; the plain JavaScript file alone is about 1.9 KB in a packed page (1,896 bytes minified), and the WebAssembly program is 4,087 bytes | First decode of a 569,513-byte page, default file against plain file (smaller is better): 17.9 ms against 46.6 in ungoogled-chromium 155 and 24.0 against 38.0 in Firefox 158.0 | Decodes LZMA1 only, readable, tested against Python's `lzma` | Wins on size and readability; loses on features |
| [`lzma` on npm](https://www.npmjs.com/package/lzma) (license not checked) | 6.8 KB minified, 3.0 KB gzipped | Not measured | Compresses and decompresses | Wins if you need to compress in the browser |
| [kripken/lzma.js](https://github.com/kripken/lzma.js) (license not checked) | Not measured | Not measured | As far as I know an Emscripten build of the C LZMA code | Not measured |
| The browser's own API (`DecompressionStream`) | Nothing to ship | Not measured | Gzip and deflate only, no LZMA | Wins when gzip or deflate is tight enough (the Zopfli packer in [`tools/single-file-tools`](../../tools/single-file-tools/README.md), which needs no decoder at all and wins for small pages) |

Where it loses: it cannot compress, it does not read `.xz` (LZMA2; decoders for that container exist, including WebAssembly builds), it has no streaming and no checksum, and lc 5 to 8 are untested. Roadroller is a far stronger packer for JavaScript source built for size-limited contests such as js13k; by its own description it trades speed for size, so it suits small inputs of code, while this module is for whole pages with larger embedded data, where LZMA is fast and simple. js13k-packer is about packaging contest entries, not a custom decoder. What is specific here: `tools/lzma-pack` produces a single HTML file, stores the compressed bytes raw (the `windows-1252` trick) to avoid the 25-33% growth of text encodings, checks a hash of the unpacked page, and ships a decoder you can read in one sitting. I confirmed from web search results that the other projects exist, but did not install or benchmark them; read each project's own README before relying on this comparison. An older measurement put this decoder at about 2.6 KB (minified JavaScript, before gzip, when the loader was first built, not re-measured); the 1,896-byte figure above is the current one.

## What it is not

- **Not strictly ES5.** The probability tables are filled with `Uint16Array.prototype.fill` (ES2015; browsers since about 2015, missing in very old phone browsers). If you need those, replace the `fill` call in `probs()` with a plain loop.
- **Not a UMD module** on purpose: `tools/lzma-pack/pack.py` cuts the file at `function lzmaDecodeFile` and pastes the top part, as plain top-level code, into every packed page. It defines `lzmaDecode` as a global in the browser and uses `module.exports` in Node, on its last line. Keep the file pure ASCII (packed pages are read as windows-1252).
- **Not strict about a long match:** a match that runs past `outSize` is cut off silently (the decoder stops at `outSize`); reference tools would call that an error.
- **Not streaming and no checksum** (LZMA itself has none): the whole result is built in memory, and corrupt input is only detected when it points outside the data or runs out.
- **lc 5-8 are accepted but untested:** liblzma (what Python and xz use) only writes streams with lc + lp of 4 or less.
- The output buffer doubles as the dictionary, so the dictionary size in a `.lzma` header is ignored.

## For AI agents

- The decoder is a direct state machine from the LZMA specification: `isMatch`, `isRep`, `isRepG0/G1/G2`, `isRep0Long`, `posSlot`, `posSpecial`, `align`, two length coders, and `literal`. Do not "simplify" the order of bit decodes: one misplaced call corrupts everything after it, usually without an error.
- `lzma-decode-wasm.js` and `lzma-decode-with-wasm.js` are generated: change `wasm/lzma-decode.c`, run `sh modules/lzma-decode/wasm/build.sh`, then `python3 modules/lzma-decode/wasm/embed.py`, then `node modules/lzma-decode/wasm/join.js` (the default file is the plain file followed by the WebAssembly file), and keep the .wasm under 4,096 bytes. Any change to the JavaScript decoder's model must be made in the C port too; the tests compare both with liblzma and with each other on damaged streams.
- Keep `lzmaDecodeFile` the last function before the export line (`tools/lzma-pack/pack.py` cuts the file there), and keep the file ES5 syntax (repository rule). Run the test after any change.

## Prior art and credits

No code from others; the ideas below are theirs.
- The LZMA algorithm and file format: designed by Igor Pavlov; the decoder here is written from the published LZMA specification, not copied from the LZMA SDK (public domain) or from xz/liblzma. Python's `lzma` module (liblzma) is used only to make and check test data, nothing from it ships.
- The WebAssembly add-on (`wasm/lzma-decode.c`) is a line-for-line port of `lzma-decode.js` by this repository, built with clang 18.1.3 (LLVM); no runtime or library code from others is inside it.
- [Roadroller](https://github.com/lifthrasiir/roadroller) (MIT, lifthrasiir), the `lzma` package on npm, [kripken/lzma.js](https://github.com/kripken/lzma.js) and [js13k-packer](https://www.npmjs.com/package/js13k-packer): named for comparison, idea only, no code taken.

## Full research notes

The long version of this page (the same comparison written out at length, with the notes on Roadroller, js13k-packer and `.xz` decoders) is kept in the project's private knowledge base. The changelog is `CHANGELOG.md` in this folder.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
