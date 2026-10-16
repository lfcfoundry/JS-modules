# ppmd-decode

A PPMd decoder (the "var.H" flavor that 7-Zip calls PPMd7) in plain ES5 JavaScript, one function, no dependencies. PPMd predicts each byte from the bytes before it. On the web-page samples I measured (see Numbers) it came out about 10% smaller than LZMA, at the price of a bigger decoder and slower unpacking. Use it to unpack PPMd data in the browser or in Node, for example the page data in a single-file app that a packer squeezed. The matching encoder is [`tools/ppmd-pack/ppmd7_encode.py`](../../tools/ppmd-pack/ppmd7_encode.py).

**Test it:** `node modules/ppmd-decode/test/run.js` (Node only, offline, about 3 seconds). It decodes streams written by the C reference encoder and must match them byte for byte.

## Quick start

```html
<script src="ppmd-decode.js"></script>
<script>
  // bytes: a Uint8Array with a raw PPMd7 stream (it starts with a 0 byte); size: the decoded length
  // order and memory must be the same numbers the encoder was given (here: order 16, 16 MB)
  var out = ppmd7Decode(bytes, size, 16, 16 * 1024 * 1024);
</script>
```

```js
var ppmd7Decode = require('./ppmd-decode.js');   // Node
var data = ppmd7Decode.fromProps(streamFromA7z, size, coderProps);   // coderProps: the 5-byte PPMd property blob of a .7z archive
```

Make a stream with the pure-Python encoder: `python3 tools/ppmd-pack/ppmd7_encode.py in.html out.ppmd 16 16777216` (order 16, 16 MB), or with 7-Zip's own PPMd7 code.

## API

| Call | Meaning |
|---|---|
| `ppmd7Decode(src, outSize, order, memSize, opts)` | `src` the raw stream as 7-Zip writes it (`Uint8Array`, first byte 0, no header); `outSize` the exact length of the result; `order` 2-64; `memSize` 2048-2147483616 bytes; `opts.maxSize` (optional) a ceiling for `outSize`. Returns a `Uint8Array` of exactly `outSize` bytes. |
| `ppmd7Decode.fromProps(src, outSize, props, opts)` | The same, with `order` and `memSize` read from `props`, the 5-byte coder property blob a `.7z` archive stores for PPMd: one byte of order, then the memory size as 4 bytes, little-endian. |

`order` and `memSize` must be **exactly** the values the encoder used. The model restarts whenever its memory fills up, so a different `memSize` does not give an error, it gives garbage from the first restart on. Pack them next to the data.

Set `maxSize` whenever the size did not come from your own packer. Without it, a size field of 4 GB asks for a 4 GB result.

Errors (always an `Error` whose message starts with `PPMd:`): an argument out of range, a `maxSize` smaller than `outSize`, a first byte that is not 0, input that ends early (noticed as soon as the decoder needs a byte that is not there), a stream the model cannot have produced (corrupt data), memory that cannot be allocated, and a big-endian machine. The decoder never runs for more than `outSize` symbols, so corrupt input ends quickly with an error or with wrong bytes. There is no checksum in the stream, so check the result yourself if you need to.

## Numbers

Measured here (Node 22, Chromium 155 and Firefox 158 on a shared Linux box; the test page is a minified single-file game, 431,473 bytes, order 16, 16 MB of model memory). Timings on this machine move by 10% or more from run to run.

| What | Value |
|---|---|
| Decoder size, minified with terser (`--ecma 2020`, top-level mangled) | 7,418 bytes with all checks, **6,570 bytes** with the `// lean-cut` lines removed as the packer does (I did not run the real packer; I removed those lines and the throw messages myself). `lzma-decode` measured the same way: 1,896 bytes. |
| Speed, Node | about 109 ms for the 431 KB page, 3.8 MB/s of output (`lzma-decode`, same page: 29 ms, 14 MB/s, so PPMd is about 4 times slower) |
| Speed, Chromium 155 (ungoogled) | 3.1-3.5 MB/s |
| Speed, Firefox 158 | between 1.1 and 2.3 MB/s in two runs on a busy machine; I could not get a steady figure |
| Memory | `memSize` + about 20 KB of tables + the result. A 16 MB model needs about 16 MB, allocated in one block |
| Output size on the same page | PPMd 115,264 bytes, LZMA 127,531 bytes (best of four LZMA settings: lc 3 or 4, pb 0 or 2) |

## When to prefer it over `lzma-decode`

PPMd's gain comes with a decoder that is about 5.2 KB bigger (7,058 against 1,896 bytes) and about 4 times slower. So it only pays off once the data is big enough. Measured on slices of the same page (order 16, 16 MB; LZMA is the best of its four settings; "net" is the saving after paying for the bigger decoder):

| Page (bytes before packing) | LZMA | PPMd | Saved by PPMd | Net after the decoder |
|---|---|---|---|---|
| 10,000 | 3,256 | 2,941 | 315 | about 4.8 KB worse |
| 30,000 | 10,681 | 9,541 | 1,140 | about 4.0 KB worse |
| 120,000 | 33,626 | 30,982 | 2,644 | about 2.5 KB worse |
| 200,000 | 55,808 | 50,672 | 5,136 | about even |
| 300,000 | 89,890 | 81,975 | 7,915 | about 2.8 KB better |
| 431,473 | 127,531 | 115,264 | 12,267 | about 7.1 KB better |

The rule of thumb that follows: pages whose LZMA data is above roughly 60 KB gain; smaller pages lose. Other content will move the numbers: on a page that is mostly data that does not compress, neither coder helps (one 185 KB sample came out about 1% larger with PPMd than with LZMA), and deflate (`tools/single-file-tools`) needs no decoder at all. Also weigh the time: a 400 KB page takes about 0.11 s to unpack in Node and longer on a phone.

## Limits and gotchas

- **memSize stops at 2,147,483,616 bytes (just under 2 GB).** The format allows nearly 4 GB, but this decoder addresses its model with signed 32-bit offsets. A stream made with more memory is refused with an `Error`, not decoded wrongly. Hardly any archive uses that much.
- **Little-endian machines only** (every phone, PC and Mac). The model is viewed as bytes, 16-bit and 32-bit words over one buffer; other machines get a clear `Error`.
- **Why the file is not wrapped as a UMD module** (the repository's usual rule): `tools/ppmd-pack` cuts the file at the line that starts with `if (typeof module` and pastes everything above it, as plain top-level code, into every packed page. So everything the page needs is inside the one function `ppmd7Decode`, with no helper and no other top-level variable. `fromProps` is attached below that line and is not pasted. Keep the file pure ASCII too: packed pages are read as windows-1252.
- **The checks for outside input end in the comment `// lean-cut`:** argument ranges, `maxSize`, the endianness test, the header test and the end-of-input and corrupt-data tests. The packer drops those lines for pages it built itself and turns each `throw new Error('...')` into a bare throw.
- The result is built whole in memory. No streaming, no `.7z` container parsing (you hand it the stream and the property blob), no PPMd7 end mark handling (you give the exact size), and trailing bytes after the data are ignored.
- `fromProps` was tested with property blobs built by hand from the fixtures' settings, not with a real `.7z` archive (no 7-Zip was available when I wrote this).
- Algorithm credit: PPMd var.H is by Dmitry Shkarin. The public-domain C code this follows is Igor Pavlov's `Ppmd7.c` / `Ppmd7Dec.c` in the 7-Zip / LZMA SDK. The JavaScript is a fresh port, not generated from that code, and it is checked against that code's encoder.

## Prior art

Checked on October 15, 2026. "Confirmed" means someone read the source or ran it; GitHub's own search was blocked during the check, so "no standalone decoder found" rests on npm (searched by name and keyword), web searches and package contents.

**Other PPMd decoders that run in a browser.** I found none that is a standalone piece of JavaScript. Every working one is a whole archive tool compiled to WebAssembly:

| Project | What it is | License | Size | Speed on the 431 KB test page | Label |
|---|---|---|---|---|---|
| **ppmd-decode (this)** | One ES5 function | MIT | about 6.6 KB packed | Node 109 ms, Chromium 155 about 120 ms, Firefox 158 about 150 to 190 ms | confirmed |
| [7z-wasm](https://www.npmjs.com/package/7z-wasm) 1.2.0 | Whole 7-Zip 24.09 as WebAssembly | LGPL, plus the unRAR restriction | 1.65 MB (WASM) plus 83 KB (glue) | Node 53 to 68 ms, Chromium 55, Firefox 67 (warm); includes command-line start-up | confirmed (ran it) |
| [archive-wasm](https://www.npmjs.com/package/archive-wasm) 2.1.0 | libarchive 3.7.7 as WebAssembly | GPL-3.0-or-later | 562 KB | Node about 70 ms (warm) | confirmed (ran it) |
| [@exav/unpack-wasm](https://www.npmjs.com/package/@exav/unpack-wasm) 0.0.2 | Rust (ppmd-rust) as WebAssembly | MIT; ppmd-rust is CC0 or MIT-0 | 2.15 MB | Node about 235 ms (whole unpack path) | confirmed (ran it) |
| [libarchive.js](https://www.npmjs.com/package/libarchive.js) 2.0.2 | Worker wrapper around libarchive | MIT wrapper | 1.0 MB | not run | PPMd text found in the WASM; speed not measured |
| [compressjs](https://www.npmjs.com/package/compressjs) 1.0.3 ("PPM") | Pure JavaScript | GPL | small | 1.9 s (0.22 MB/s) | confirmed; it is a simple PPM, not variant H, and its output is bigger (129,422 versus 115,264 bytes) |
| [unrar-js](https://www.npmjs.com/package/unrar-js) 0.2.3, [7z-iterator](https://www.npmjs.com/package/7z-iterator) 2.2.13 | Pure JavaScript RAR and 7z readers | MIT | n/a | n/a | confirmed in the source: both say PPMd is not implemented |
| [@zip.js/zip.js](https://www.npmjs.com/package/@zip.js/zip.js) 2.23.0 | ZIP library | BSD-3-Clause | n/a | n/a | no PPMd; ZIP method 98 uses variant I, a different model |
| [ppmd-rust](https://github.com/hasenbanck/ppmd-rust) 1.5.0, [ppmd-turbo](https://github.com/scryer-media/ppmd-turbo) | Rust ports (variants H, I and 7-Zip's) | CC0 or MIT-0; Apache-2.0 | n/a | not published | confirmed (README); no WebAssembly build mentioned |
| pyppmd 1.3.1 | Python wrapper around the C code | n/a | n/a | decode 74 ms | confirmed; its encoder drops a byte on large inputs (see below) |

WebAssembly 7-Zip decodes this page about 2 times faster than this decoder, and is about 220 times larger. If you already ship a WebAssembly archive tool, use that. This module is for the case where a few KB of plain JavaScript in one file is the constraint.

**It agrees with 7-Zip.** This decoder decoded a stream made by real 7-Zip 24.09 byte for byte, and 7-Zip 24.09 tested and extracted a stream made by the reference C encoder wrapped in a hand-built `.7z` file (orders 16 and 32). One trap worth knowing: 7-Zip's command line quietly lowers PPMd memory to 8 MB for this page whatever you ask for, which makes the output 3.6% bigger (119,400 versus 115,264 bytes). Always take the memory value from the archive header (`fromProps` does), not from what you asked for.

**Encoder bug in pyppmd 1.3.1.** On large inputs its encoder drops one byte near a 32 KB output boundary, and its own decoder then fails. Fixtures here come from the C reference encoder instead.

**How the gain compares with published numbers.** On this page PPMd is 9.7% smaller than LZMA and 7.9% smaller than Brotli (best level). Matt Mahoney's [Large Text Compression Benchmark](https://mattmahoney.net/dc/text.html) has 7-Zip PPMd 14.2% smaller than xz on the first 100 MB of Wikipedia and 9.3% smaller on 1 GB, and decoding about 27 times slower (546 against 20 nanoseconds a byte). A Japanese test of 7-Zip on 597 HTML files ([note.com](https://note.com/komutai/n/ne51b6cb71b0d)) found PPMd 16.4% smaller than LZMA2, and 23% on JSON, but worse on PDF. So 9 to 12% on a single page is typical, if anything cautious, and much more on bigger text.

**Licensing.** PPMd variant H is by Dmitry Shkarin (2001). The 7-Zip files Ppmd7.c and Ppmd7Dec.c say "Igor Pavlov: Public domain" and "Dmitry Shkarin: Public domain"; libarchive's copy carries the same notice. This module is a fresh port from those files, so MIT applies to the port. It was not taken from unRAR (whose license restricts re-creating RAR compression) or from GPL code. This is a summary of what was read, not legal advice, and patents were not researched.

## For AI agents

- The decoder mirrors `Ppmd7.c` (model, sub-allocator, SEE and binary contexts) and `Ppmd7Dec.c` (symbol decoding) with the 7z range decoder. Do not "simplify" arithmetic that looks redundant: the allocator, `rescale`, `createSuccessors` and the SEE tables must match the encoder's choices exactly, or the output drifts after thousands of correct bytes, usually without an error. The model lives in one `ArrayBuffer`; offsets are bytes, 0 means null, and blocks are 12-byte units.
- Keep `ppmd7Decode` the only top-level function, with the export block starting at a line that begins with `if (typeof module`: `tools/ppmd-pack` cuts the file there. Keep lean-cut lines whole statements on one line, and every throw as `throw new Error('...')` on one line.
- Keep the file ES5 syntax and ASCII (repository rules). Do not slow the main loop: Node should stay near 3.5 MB/s on `fb_min`-sized text. Benchmark before and after any edit.
- `node test/run.js` compares against streams written by the C reference encoder (`test/fixtures`, orders 2-64, memory 2 KB-16 MB, several model restarts, memory that is not a multiple of 4) and checks truncation, 300 corrupted copies, a wrong `outSize`, bad arguments and globals. To change the fixtures, see `test/fixtures/make.js` (needs a C compiler and 7-Zip's PPMd7 sources). If `tools/ppmd-pack/ppmd7_encode.py` and `python3` are present, one more round trip runs through it.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
