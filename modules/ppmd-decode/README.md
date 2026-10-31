# ppmd-decode

**Version 1.3.0 · API 1**

**Tested in:** Node 22 checks; compile-early timing in ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, one at a time

## What it is and how it works

A PPMd decoder (the PPMd7 flavor 7-Zip uses) for the browser or Node: WebAssembly first, plain ES5 JavaScript as the fallback. The matching encoder is [`tools/ppmd-pack`](../../tools/ppmd-pack/README.md).

- It rebuilds the same prediction model the encoder used, byte by byte.
- A range decoder turns the compressed bits back into bytes from those predictions.
- It needs the same `order` and memory size the encoder used.

## Why it exists

PPMd packs web-page text and code about 10% smaller than LZMA on the samples here. No other standalone PPMd decoder in plain JavaScript was found; the working ones are whole archive tools compiled to WebAssembly.

**Where it helps**

- Larger self-unpacking pages where every KB counts.
- Unpacking PPMd data in a browser or Node.
- Pages where a few KB of plain JavaScript is the limit.

**Not for:** small pages (the decoder is bigger and slower than LZMA's).

## Use

Copy `ppmd-decode-with-wasm.js`, the default file. `ppmd7Decode` in it uses WebAssembly when the page allows it and the JavaScript decoder when it does not, so the same call always works and gives the same bytes.

```html
<script src="ppmd-decode-with-wasm.js"></script>
<script>
  // bytes: a Uint8Array with a raw PPMd7 stream (it starts with a 0 byte); size: the decoded length
  // order and memory must be the same numbers the encoder was given (here: order 16, 16 MB)
  var out = ppmd7Decode(bytes, size, 16, 16 * 1024 * 1024);
  // ppmd7Decode.engine says which decoder did the last call: 'wasm' or 'js'
</script>
```

```js
var ppmd7Decode = require('./ppmd-decode-with-wasm.js');   // Node
var data = ppmd7Decode.fromProps(streamFromA7z, size, coderProps);   // coderProps: the 5-byte PPMd property blob of a .7z archive
```

Make a stream with the pure-Python encoder: `python3 tools/ppmd-pack/ppmd7_encode.py in.html out.ppmd 16 16777216` (order 16, 16 MB), or with 7-Zip's own PPMd7 code.

Test it: `node modules/ppmd-decode/test/run.js` (Node only, offline, about 3 seconds). It decodes streams written by the C reference encoder and must match them byte for byte; it also checks truncation, 300 corrupted copies, bad arguments and both decoders against each other.

## API

| Call | Meaning |
|---|---|
| `ppmd7Decode(src, outSize, order, memSize, opts)` | `src` the raw stream as 7-Zip writes it (`Uint8Array`, first byte 0, no header); `outSize` the exact length of the result; `order` 2-64; `memSize` 2048-2147483616 bytes; `opts.maxSize` (optional) a ceiling for `outSize`. Returns a `Uint8Array` of exactly `outSize` bytes. |
| `ppmd7Decode.fromProps(src, outSize, props, opts)` | The same, with `order` and `memSize` read from `props`, the 5-byte coder property blob a `.7z` archive stores for PPMd: one byte of order, then the memory size as 4 bytes, little-endian. |
| `ppmd7Decode.engine`, `.wasm`, `.plain` | In the default file: `.engine` is `'wasm'` or `'js'` (which decoder did the last call); `.wasm` says whether WebAssembly was usable at load time; `.plain` is the JavaScript decoder alone. `ppmd7DecodeWasm` is another name for `ppmd7Decode`, kept for pages written for 1.1.0. |

`order` and `memSize` must be **exactly** the values the encoder used. The model restarts whenever its memory fills up, so a different `memSize` gives garbage from the first restart on, not an error. Pack them next to the data. Set `maxSize` whenever the size did not come from your own packer; without it, a size field of 4 GB asks for a 4 GB result.

Errors are always an `Error` whose message starts with `PPMd:` (argument out of range, `maxSize` smaller than `outSize`, first byte not 0, input that ends early, corrupt data, memory that cannot be allocated, big-endian machine). The decoder never runs for more than `outSize` symbols, so corrupt input ends quickly with an error or wrong bytes. There is no checksum in the stream; check the result yourself if you need to.

### WebAssembly first (the default since 1.2.0)

`ppmd7Decode` in the default file decodes with a 9.3 KB WebAssembly program and hands the call to the JavaScript decoder when it cannot: the page's Content-Security-Policy lacks `'wasm-unsafe-eval'`, the browser has no WebAssembly, the memory cannot be had, or an argument is out of range (the JavaScript decoder then does the work or throws its usual error). Either way the bytes and the error texts are the same. It needs `memSize` + about 20 KB + the compressed and result sizes inside one WebAssembly memory (at most 1 GB; bigger asks go to the JavaScript decoder).

### Which file to copy

| File | What it is | Size (smaller is better) |
|---|---|---|
| `ppmd-decode-with-wasm.js` | **The default.** WebAssembly first, JavaScript fallback, in one file. | 44,215 bytes (16,014 gzipped) |
| `ppmd-decode.js` | The plain JavaScript decoder alone: one ES5 function, works under any page policy, and the part `tools/ppmd-pack` pastes into packed pages. Use it when the page must stay as small as possible. | 26,175 bytes (8,031 gzipped) |
| `ppmd-decode-wasm.js` | The WebAssembly part alone, to load after `ppmd-decode.js` (it adds `ppmd7DecodeWasm`). The default file already holds both. | 17,164 bytes (the 9,317-byte program is stored as 12.4 KB of text) |

`ppmd-decode-with-wasm.js` is built from the other two by `node modules/ppmd-decode/wasm/join.js`; edit those, never the joined file (the tests fail when it is stale). `tools/ppmd-pack` ships the same program in a packed page by default (`--no-wasm` leaves it out).

400,000-byte page (JavaScript source files joined, packed with order 6 and 16 MB), first decode in a freshly opened page, median of 7, the plain file and the default file taking turns, compile time of the WebAssembly module included. One browser at a time. **Lower milliseconds are better; a bigger "times faster" is better.**

| Browser | Plain file (ms) | Default file (ms) | Times faster |
|---|---:|---:|---:|
| ungoogled Chromium 155.0.8059.39-1 | 112.2 | 66.7 | 1.68x |
| Firefox 158.0 | 123.0 | 67.0 | 1.84x |
| WebKitGTK 2.52.6 | 94.0 | 61.0 | 1.54x |
| GNOME Web 46.5 | 95.0 | 67.0 | 1.42x |

The same default file loaded on a page whose policy forbids WebAssembly decoded the same bytes on the JavaScript path in all four browsers. Earlier 1.1.0 measurements of the separate add-on (Node 22: 159 to 71 ms, 2.2x; a repeat decode in the same page is 1.8 to 2.4 times faster with WebAssembly in every browser) agree with these. Both decoders gave the same bytes or the same `Error` text on 15 fixtures, 160 more streams and 798 damaged copies of them (0 differences). Source: `wasm/ppmd7.c` is a line-by-line port of the JavaScript; `wasm/build.sh` (clang with the wasm32 target) builds `wasm/ppmd7.wasm`, `wasm/embed.py` puts it into `ppmd-decode-wasm.js` and `wasm/join.js` builds the default file. Browser timings: `tests/wasm-default-bench.js`.

## Compile early (since 1.3.0)

**What.** ppmd-decode-wasm.js and ppmd-decode-with-wasm.js start compiling the WebAssembly in the background as soon as the file loads, so the first decode only has to start it. ppmd7DecodeWasm.ready() is a promise that says (true or false) whether that worked, and ppmd7DecodeWasm.module() gives the compiled `WebAssembly.Module` once it is ready (else null) so a worker can be sent it with `postMessage` instead of compiling it again. Asked for before the compile is done, the code compiles on the spot as it always did, so nothing waits and the answers are the same.

**Why, and how much.** Compiling the 9,317-byte program on the page costs 0.5 ms in Chromium 155, 1 ms in Firefox 158, WebKitGTK 2.52.6 and GNOME Web 46.5 (median of 9 fresh pages, smaller is better; Firefox and WebKit report whole milliseconds), so for this size the saving is at most that. Loading the file plus the first use, old against new, in ms (median of 11 fresh pages, taking turns): within about 1 ms in Chromium, Firefox and both WebKit browsers; the differences go both ways, so treat it as no change you can measure. It matters more for the large programs (pcodec-js) and for handing the module to workers. Nothing is stored in the browser.

## How it compares

> **Node numbers** were measured in Node, not in a test browser; read them only to compare rows with each other. Rows named for a browser were measured in that browser. Timings move by 10% or more from run to run.

Smaller than every other PPMd decoder for browsers that I found, and about 10% smaller output than LZMA on web pages, but a bigger and slower decoder than `lzma-decode`, and slower than 7-Zip compiled to WebAssembly. Test page: a minified single-file game, 431,473 bytes (order 16, 16 MB of model memory).

| Alternative | Size (smaller is better) | Speed on the 431 KB test page (faster is better) | Where it wins or loses |
|---|---|---|---|
| ppmd-decode 1.2.0 (MIT, this module) | 6,570 bytes minified in a packed page; the default file with WebAssembly is 44,215 bytes | Chromium 155 about 120 ms, Firefox 158 about 150 to 190 ms with the plain file. Default file, 400 KB page, first decode (smaller is better): 66.7 ms in Chromium 155, 67.0 in Firefox 158, 61.0 in WebKitGTK 2.52.6, 67.0 in GNOME Web 46.5 | Wins on size and having a plain JavaScript fallback; loses on speed |
| [`lzma-decode`](../lzma-decode/README.md) (MIT, same repository) | 1,896 bytes minified | Speed in browsers on this page: not measured | Wins on size and speed; its output on this page is 127,531 bytes against 115,264 here (smaller is better) |
| [7z-wasm](https://www.npmjs.com/package/7z-wasm) 1.2.0 (LGPL plus the unRAR restriction) | 1.65 MB WebAssembly plus 83 KB glue | Chromium 55 ms, Firefox 67 ms (warm, includes command-line start-up) | Whole 7-Zip, many formats; wins on speed and formats, about 220 times larger |
| [archive-wasm](https://www.npmjs.com/package/archive-wasm) 2.1.0 (GPL-3.0-or-later), [@exav/unpack-wasm](https://www.npmjs.com/package/@exav/unpack-wasm) 0.0.2 (MIT) | 562 KB; 2.15 MB | Not measured in browsers | libarchive and Rust [ppmd-rust](https://github.com/hasenbanck/ppmd-rust) as WebAssembly; win on formats, much larger |
| [compressjs](https://www.npmjs.com/package/compressjs) 1.0.3 (GPL) | Small (not measured) | Not measured in browsers (Node: 1.9 s, 0.22 MB/s) | A simple PPM, not variant H; output is bigger (129,422 against 115,264 bytes, smaller is better) |

Speed: Node about 109 ms for the 431 KB page (3.8 MB/s of output; `lzma-decode` on the same page: 29 ms, 14 MB/s, so PPMd is about 4 times slower); Chromium 155 (ungoogled) 3.1-3.5 MB/s; Firefox 158 between 1.1 and 2.3 MB/s in two runs on a busy machine (no steady figure). Size minified with terser: 7,418 bytes with all checks, **6,570 bytes** with the `// lean-cut` lines removed as the packer does (I removed those lines myself, not with the real packer). Memory is `memSize` + about 20 KB + the result. Output on the same page: PPMd 115,264 bytes, LZMA 127,531 bytes (best of four LZMA settings: lc 3 or 4, pb 0 or 2).

**When to prefer it over `lzma-decode`:** PPMd's decoder is about 5.2 KB bigger (7,058 against 1,896 bytes) and about 4 times slower, so it pays off only once the data is big enough. Slices of the same page (order 16, 16 MB; sizes in bytes, smaller is better; "net" is the saving after paying for the bigger decoder):

| Page (bytes before packing) | LZMA | PPMd | Saved by PPMd | Net after the decoder |
|---|---|---|---|---|
| 10,000 | 3,256 | 2,941 | 315 | about 4.8 KB worse |
| 120,000 | 33,626 | 30,982 | 2,644 | about 2.5 KB worse |
| 200,000 | 55,808 | 50,672 | 5,136 | about even |
| 431,473 | 127,531 | 115,264 | 12,267 | about 7.1 KB better |

Rule of thumb: pages whose LZMA data is above roughly 60 KB gain; smaller pages lose. On data that does not compress neither coder helps (one 185 KB sample came out about 1% larger with PPMd), and deflate (`tools/single-file-tools`) needs no decoder at all.

Where it loses: slower to unpack than LZMA and a decoder 5.2 KB bigger; about 2 times slower than 7-Zip as WebAssembly, which also handles whole archives; little-endian machines only, no streaming, no `.7z` parsing. A cold start costs about 20 ms extra on a 30 KB stream and nothing visible on a 702 KB page (Chromium 141, 2026-10-16).

**Against published numbers:** on this page PPMd is 9.7% smaller than LZMA and 7.9% smaller than Brotli (best level). Matt Mahoney's [Large Text Compression Benchmark](https://mattmahoney.net/dc/text.html) has 7-Zip PPMd 14.2% smaller than xz on the first 100 MB of Wikipedia and 9.3% smaller on 1 GB, decoding about 27 times slower; a Japanese test of 7-Zip on 597 HTML files ([note.com](https://note.com/komutai/n/ne51b6cb71b0d)) found PPMd 16.4% smaller than LZMA2.

**Agrees with 7-Zip:** it decoded a stream made by real 7-Zip 24.09 byte for byte, and 7-Zip 24.09 tested and extracted a stream made by the reference C encoder in a hand-built `.7z` file (orders 16 and 32). Trap: 7-Zip's command line quietly lowers PPMd memory to 8 MB for this page whatever you ask for, which makes the output 3.6% bigger (119,400 versus 115,264 bytes). Always take the memory value from the archive header (`fromProps` does).

## What it is not

- **Not for memory above 2,147,483,616 bytes (just under 2 GB).** The format allows nearly 4 GB, but this decoder uses signed 32-bit offsets; a bigger stream is refused with an `Error`, not decoded wrongly.
- **Little-endian machines only** (every phone, PC and Mac); others get a clear `Error`.
- **Not a streaming decoder or a `.7z` reader.** The result is built whole in memory; you give the stream, the property blob and the exact size (no end mark handling); trailing bytes are ignored.
- `fromProps` was tested with hand-built property blobs, not a real `.7z` archive.
- **The file is not a UMD module** on purpose: `tools/ppmd-pack` cuts it at the line starting with `if (typeof module` and pastes everything above into every packed page, so everything the page needs is inside the one function `ppmd7Decode` (`fromProps` is attached below that line). Keep the file pure ASCII (packed pages are read as windows-1252).
- **The checks for outside input** end in the comment `// lean-cut`; the packer drops those lines for pages it built itself and turns each `throw new Error('...')` into a bare throw.

## For AI agents

- The decoder mirrors `Ppmd7.c` (model, sub-allocator, SEE and binary contexts) and `Ppmd7Dec.c` (symbol decoding) with the 7z range decoder. Do not "simplify" arithmetic that looks redundant: the allocator, `rescale`, `createSuccessors` and the SEE tables must match the encoder exactly, or the output drifts after thousands of correct bytes, usually without an error. The model lives in one `ArrayBuffer`; offsets are bytes, 0 means null, blocks are 12-byte units.
- Keep `ppmd7Decode` the only top-level function, with the export block starting at a line that begins with `if (typeof module`. Keep lean-cut lines whole statements on one line, and every throw as `throw new Error('...')` on one line.
- `ppmd-decode-wasm.js` and `wasm/ppmd7.c` must give the same bytes and the same Error texts as `ppmd-decode.js` for every input, damaged ones included. If you change the model code in one, change the other, rebuild (`wasm/build.sh`, then `python3 wasm/embed.py`, then `node wasm/join.js`, which rebuilds the default file `ppmd-decode-with-wasm.js`) and run `node test/run.js`. Time any change in all four browsers.
- Keep ES5 syntax and ASCII. Do not slow the main loop: Node should stay near 3.5 MB/s on `fb_min`-sized text.
- `test/run.js` compares against streams from the C reference encoder (`test/fixtures`). To change them see `test/fixtures/make.js` (needs a C compiler and 7-Zip's PPMd7 sources). If `tools/ppmd-pack/ppmd7_encode.py` and `python3` are present, one more round trip runs through it.

## Prior art and credits

- **PPMd variant H**, the algorithm, by Dmitry Shkarin (2001). Public domain per the 7-Zip source files, which say "Igor Pavlov: Public domain" and "Dmitry Shkarin: Public domain"; libarchive's copy carries the same notice.
- **`Ppmd7.c` and `Ppmd7Dec.c`** from 7-Zip / the LZMA SDK by Igor Pavlov (public domain; version of the files read: not recorded, tests use 7-Zip 24.09). The JavaScript is a fresh port made from those files and checked against the C reference encoder, so MIT applies to the port; no code was taken from unRAR (whose license restricts re-creating RAR compression) or from GPL projects. The WebAssembly source `wasm/ppmd7.c` is a line-for-line port of the JavaScript, and the Python encoder in `tools/ppmd-pack` is a port of `Ppmd7.c`, `Ppmd7Enc.c` and `Ppmd.h` from the same place. This is a summary of what was read, not legal advice; patents were not researched.
- Not copied, compared against only: 7z-wasm, archive-wasm, @exav/unpack-wasm, compressjs, [libarchive.js](https://www.npmjs.com/package/libarchive.js) (MIT worker wrapper around libarchive; PPMd text found in its WASM, speed not run), [unrar-js](https://www.npmjs.com/package/unrar-js) and [7z-iterator](https://www.npmjs.com/package/7z-iterator) (both say PPMd is not implemented), [@zip.js/zip.js](https://www.npmjs.com/package/@zip.js/zip.js) (ZIP method 98 uses variant I, a different model), ppmd-rust and [ppmd-turbo](https://github.com/scryer-media/ppmd-turbo) (Rust ports, CC0 or MIT-0 and Apache-2.0), pyppmd 1.3.1, Matt Mahoney's Large Text Compression Benchmark and the note.com test. pyppmd's encoder drops one byte near a 32 KB output boundary on large inputs and its own decoder then fails, so the fixtures here come from the C reference encoder.
- Checked on October 15, 2026. GitHub's own search was blocked during the check, so "no standalone PPMd decoder found" rests on npm (searched by name and keyword), web searches and package contents.

## Full research notes

The long version of this page (the second comparison table with every project's license, size and label, the cold-start notes, the full list of damaged-stream and fixture checks, and the licensing reading) is kept in the project's private knowledge base. The changelog is `CHANGELOG.md` in this folder.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
