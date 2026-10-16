# ppmd-pack

Turns one HTML file into one smaller, self-unpacking HTML file using PPMd (the "PPMd7" / variant H compressor that 7-Zip offers), and checks a hash of the result before running it. It is the heavier sibling of [`lzma-pack`](../lzma-pack/README.md): the same wrapper page and options, a stronger compressor for text and code, and a bigger, slower decoder. Python 3 standard library only (an optional minifier, terser or esbuild, shrinks the loader). The encoder is pure Python; nothing is compiled and nothing is downloaded.

**Test it:** `python3 tools/ppmd-pack/test/run.py` (Python 3 and Node.js, no browser, about 20 seconds) and `python3 tools/ppmd-pack/test/browser.py` (Playwright for Python with Chromium; offline). The decoder it embeds is tested separately: `node modules/ppmd-decode/test/run.js`.

## What it is

`pack.py` compresses the page with PPMd and writes a wrapper page: the compressed bytes plus a minified loader built from [`modules/ppmd-decode`](../../modules/ppmd-decode/ppmd-decode.js). While it unpacks, a small "Opening..." line shows on the page's own background color (read from the input page, or given with `--bg`), so a dark game never flashes white. Opening the file checks a hash of the compressed bytes, unpacks the page, checks a hash of the result, and replaces itself with the real page. If a hash does not match (the file was opened and saved as text, or cut short), it shows a plain message instead of running anything.

`ppmd7_encode.py` can also be used on its own: `encode(data, order, mem)` returns the raw 7z-style PPMd7 stream. It is a port of the public-domain C code in the 7-Zip / LZMA SDK (Ppmd7.c, Ppmd7Enc.c), and its output is **byte for byte what that C encoder writes**, checked as described below.

## Should you use it? (the honest table)

Three packers exist in this repository. None is best for every file.

| | Zopfli deflate ([`single-file-tools`](../single-file-tools/README.md) `pack.py`) | [`lzma-pack`](../lzma-pack/README.md) | `ppmd-pack` (this tool) |
|---|---|---|---|
| Decoder in the page | none: the browser unzips (`DecompressionStream`, browsers since 2023) | about 2.3 KB | about 7.3 KB (5.0 KB more than LZMA) |
| Size of the compressed data | biggest (LZMA was 10 to 25% smaller on our games) | middle | smallest on text and code: 4 to 16% under LZMA's on our test set (table below) |
| Unpacking time (431 KB page, in a browser) | fastest (native) | about 25 to 65 ms | about 115 to 190 ms (4 to 8 times slower than LZMA) |
| Memory while unpacking | small | small | allocates the model memory, 1 to 16 MB by default (`--mem`), plus the page itself, and frees it afterwards |
| Packing time | slow (Zopfli) | seconds | pure Python, about 90 to 130 KB/s; `--tune` runs about 35 encodings |
| Use it when | pages under about 10 KB, or you want the simplest thing | pages of 10 KB and up (the usual choice) | the page holds **about 60 KB or more of compressed data**, and you can spend a few MB and about 0.1 to 0.2 s at start |

Where the 60 KB comes from: the PPMd decoder costs 5.4 KB more than LZMA's, and PPMd wins back only about 5 to 15% of the data on typical text and code. 5.4 KB divided by 10% is 54 KB of LZMA data to break even; divided by 5% it is 108 KB. Below that, `lzma-pack` gives the smaller page, and it decodes faster. Packed pictures and audio (already compressed) gain nothing from either. Run `--compare` on your own file: it builds both and prints the net page sizes.

## Measured on ten files

Default settings (order 12, memory chosen from the input size), `--encoding bytes`, terser for the loader, each page unpacked and checked in Node. "Packed page" is the whole output file: payload plus loader plus wrapper. Rows that are not HTML (`.md`, `.js`, `.json`, `.css`) stand for the same kind of content inside a page; the packer treats any UTF-8 text the same way.

| Input | Size (bytes) | LZMA packed page | PPMd packed page | Page difference | Payload difference |
|---|---:|---:|---:|---:|---:|
| `html_demo-frame-kit.html` | 17,425 | 8,956 | 13,240 | 4,284 (+47.8%) | 5,521 vs 6,206 (-11.0%) |
| `html_demo-cartoon-3d-kit.html` | 20,554 | 9,866 | 14,149 | 4,283 (+43.4%) | 6,409 vs 7,100 (-9.7%) |
| `md_readme-frame-kit.md` | 29,129 | 13,964 | 17,176 | 3,212 (+23.0%) | 9,371 vs 11,103 (-15.6%) |
| `js_howler.min.js` | 36,173 | 11,973 | 15,735 | 3,762 (+31.4%) | 7,954 vs 9,162 (-13.2%) |
| `html_audio-base64.html` | 80,027 | 56,895 | 61,900 | 5,005 (+8.8%) | 52,973 vs 52,959 (+0.0%) |
| `json_story-nodes.json` | 181,527 | 64,581 | 60,888 | **-3,693 (-5.7%)** | 51,992 vs 60,435 (-14.0%) |
| `css_bootstrap.min.css` | 232,803 | 27,504 | 30,301 | 2,797 (+10.2%) | 22,192 vs 24,304 (-8.7%) |
| `html_banana-game.min.html` | 431,473 | 133,434 | 129,579 | **-3,855 (-2.9%)** | 118,874 vs 127,531 (-6.8%) |
| `html_mixed-app.html` | 539,598 | 118,826 | 113,927 | **-4,899 (-4.1%)** | 103,666 vs 113,272 (-8.5%) |
| `js_three.min.js` | 691,648 | 145,049 | 144,699 | **-350 (-0.2%)** | 133,611 vs 138,877 (-3.8%) |

Read it like this: the compressed data is smaller with PPMd on nine of ten files (4 to 16%; the exception is base64 audio, which is already dense), but the whole page ends up clearly smaller only on three files (3 to 4%), the ones where LZMA's data was above about 60 KB *and* PPMd's gain was above about 5%; on `three.min.js` it is a tie (-0.2%). Minified JavaScript gains least. Page sizes change by a few bytes whenever the loader or wrapper changes; rerun `--compare` for exact numbers.

`--tune` (orders 4 to 32, memory 1 to 16 MB, capped by the input size) found these extra gains over the defaults: `json_story-nodes.json` 60,888 to 56,168 bytes (-7.8%, order 6, 2 MB; 18 s on two processors) and `html_banana-game.min.html` 129,579 to 126,034 bytes (-2.7%, order 12, 8 MB; 54 s). On `html_demo-cartoon-3d-kit.html` the default was already the best (1 s). Memory is the setting that matters most for big pages; the default (a power of two at least 8 times the input, between 1 and 16 MB) was within about 1 to 5% of the best setting.

**Encoder speed:** about 90 to 130 KB of input per second in pure Python 3.13 on one processor (132 KB/s over the ten files above at default settings; 91 to 107 KB/s for three large files at order 12 with 16 MB; 88 KB/s averaged over 231 runs that include tiny model memory and many restarts). A 431 KB page takes about 4 seconds; `--tune` multiplies that by the number of settings divided by your processors.

## Quick start

```
python3 tools/ppmd-pack/pack.py mypage.html mypage.packed.html --title "My page"
python3 tools/ppmd-pack/pack.py mypage.html mypage.packed.html --compare      # also prints the LZMA packer's sizes
```

Open `mypage.packed.html` by double-click. Ready-made examples: `example/packed-bytes.html` and `example/packed-base64.html` (both unpack `example/app.html`; the license notice comment in their head is passed with `--head`, as in the [lzma-pack quick start](../lzma-pack/README.md#quick-start)):

```
python3 tools/ppmd-pack/pack.py tools/ppmd-pack/example/app.html tools/ppmd-pack/example/packed-bytes.html --title "ppmd-pack example" --head "$(cat license-comment.txt)"
python3 tools/ppmd-pack/pack.py tools/ppmd-pack/example/app.html tools/ppmd-pack/example/packed-base64.html --title "ppmd-pack example" --head "$(cat license-comment.txt)" --encoding base64
```

The example page is only 2.7 KB, so the packed copies are bigger than the original (the loader alone is 7.3 KB). They show the mechanism, not the saving; see the table above for real sizes.

## Options

| Option | Meaning |
|---|---|
| `--title T` | Title of the wrapper page. |
| `--head HTML` | Extra HTML for the wrapper's head, for example a Content-Security-Policy meta tag. |
| `--encoding bytes\|base64` | `bytes` (default): smallest, stored raw, wrapper declared windows-1252. `base64`: about a third bigger, safe on any server or editor. |
| `--order N` | Model order, 2 to 64 (default 12). Higher orders help repetitive pages and cost time. |
| `--mem BYTES` | Model memory, 2048 and up; a `K` or `M` suffix is accepted (`4M`). Default: the smallest power of two that is at least 8 times the input size, kept between 1 MB and 16 MB. **The page allocates this much memory at start** (and frees it when it is done). The decoder must use the same order and memory as the encoder, so both are written into the loader. |
| `--tune` | Try orders 4, 6, 8, 12, 16, 24, 32 with memory 1, 2, 4, 8, 16 MB (capped by the input size) and keep the smallest result. Replaces `--order` and `--mem`. Slow: one pure-Python encoding per setting, spread over all processors. The default setting is always one of the candidates, so the result is never bigger than the default's. |
| `--compare` | Also build the LZMA packer's page for the same input (raw LZMA, lc=4 lp=0 pb=0, preset 9 extreme) and print both payloads and both net page sizes (payload plus loader). |
| `--bg auto\|none\|COLOR` | Color behind the "Opening..." line, exactly as in lzma-pack. |
| `--minify-page` | First minify the page's own inline scripts (needs terser or esbuild), then pack. Off by default. |
| `--skip-node-check` | Do not run the packed page's own decoder in Node after packing (see below). |
| `--minifier auto\|terser\|esbuild\|none` | Finds `terser` or `esbuild` on the PATH, in a `node_modules/.bin`, or from the `TERSER` / `ESBUILD` environment variable. Without one the loader is about 22 KB (the decoder is embedded as written). |

## What the packer checks

The packer reuses [`lzma-pack`](../lzma-pack/pack.py)'s helpers (background detection, byte escaping, minifier lookup, page minifier) by importing that file, so the two tools stay in step. After packing it checks its work:

1. **The shipped page, in Node.** The page's two scripts (the shipped JavaScript decoder, the byte reader and the hash) run in a bare Node sandbox and must write back the input page, show no error message and leave no global variable behind. This is the check that matters, because it runs the code the player gets. Without Node.js the packer says so on screen and **nothing has verified the packed data**; there is no second, Python-side decoder here (lzma-pack has one because Python ships an LZMA decoder; PPMd is not in the Python standard library).
2. **The encoder itself** is tested against the 7-Zip C encoder (see "How the encoder is tested").

Other things it does:
- The input must be valid UTF-8, because the loader decodes the page as UTF-8. Anything else is refused with the offset of the first bad byte. A leading byte order mark is accepted; the unpacked page comes back without it.
- The loader checks a hash of the **compressed bytes before it decodes anything**, then a hash of the result. Reason: the loader leaves out the decoder's own input checks (lines marked `// lean-cut`, to save space), and a PPMd stream that was re-saved or cut can make the decoder spin forever instead of failing. Checking first turns that into the plain message. The hash is a 32-bit "multiply by 31" sum: it catches accidents, not tampering.
- The failure message is "This file was changed (maybe opened and saved as text, or cut short) or the device has too little free memory. Please download it again and open the file itself in a browser." A browser that cannot allocate the model memory also lands here.
- The decoder is cut at the export block (`if (typeof module`), the `// lean-cut` lines are dropped, and every `throw new Error('...')` becomes `throw 0`. The tests check that no `Error(` text and no `lean-cut` line reaches the page.

## How the encoder is tested

- Ten fixtures in `test/fixtures/` (inputs plus the output of the real C encoder, built from the 7-Zip / LZMA SDK sources) must match byte for byte, including runs with only 2 to 4 KB of model memory so the model restarts many times. They run with no C compiler. `test/make_fixtures.py` rebuilds them from a compiled encoder.
- With `PPMD_REF_ENCODER=/path/to/compiled-encoder`, `test/run.py` also compares 48 more settings against the real program.
- When this tool was written, the Python encoder was compared with the C encoder on 265 cases, all byte for byte identical: 38 test files under 120 KB at orders 6, 12 and 32 with 1 MB and with 2,048 bytes of memory, three larger files (180 to 430 KB) at order 12 with 16 MB, and 34 more with odd memory sizes (3,001 to 200,003 bytes), orders 2 to 64, empty and one-byte input, and random bytes.
- Streams are decoded by `modules/ppmd-decode` in Node (`test/run.py`), and by the loader inside a real Chromium page (`test/browser.py`).

## Credit in the packed page

Every packed page starts with a short HTML comment crediting Dmitry Shkarin (PPMd variant H), Igor Pavlov (the public-domain 7-Zip code this follows) and LFC Foundry (the port). PPMd is public domain, so this is a courtesy, not a legal duty. It adds about 150 bytes and players never see it.

## Limits and gotchas

- **Memory.** The packed page allocates `--mem` bytes when it starts (1 to 16 MB by default). That is fine for a desktop or a recent phone; on a very low-memory device the allocation can fail and the page shows the message instead. Use a smaller `--mem` (the cost is a larger file) or `lzma-pack` for such targets.
- **Speed.** The loader runs before the page can start, and it is about 4 to 8 times slower than LZMA's: a 431 KB page took about 115 to 190 ms in a browser against 25 to 65 ms. The loader waits about 30 ms so the browser can paint the "Opening..." line first (painting is up to the browser). For a game that must open instantly on slow phones, `lzma-pack` or the Zopfli packer is the safer choice.
- **Charset header (important).** Exactly as in lzma-pack: the `bytes` encoding declares the wrapper `windows-1252`; a server that sends `charset=utf-8` (GitHub Pages does) overrides it and the loader shows its message. Use `--encoding base64` for such servers. The browser test covers both.
- **The file must stay byte for byte.** Opening a `bytes` copy in an editor and saving it as text corrupts it; the hash check catches this. Keep a copy of the original.
- **It replaces the page with `document.write`.** The same notes as in lzma-pack apply: a `<base>` tag or Content-Security-Policy meta tag has to be passed with `--head`, and a strict CSP that forbids inline script blocks the loader (and one that forbids inline styles shows plain white instead of the colored "Opening..." page).
- **The background color is a guess** (`--bg auto` reads simple CSS only).
- **Pure Python is slow for big inputs.** A 5 MB page takes about a minute to encode; `--tune` on it takes much longer. Use the default setting for big files and `--tune` for the final build.
- **Same order and memory on both sides.** If you use the stream elsewhere (for example with `modules/ppmd-decode` directly), pass the same `order` and `mem` you encoded with. A different value gives garbage, not an error.
- **Little-endian machines only** (every browser target), for both the encoder and the decoder.

## For AI agents

- `pack.py` loads `tools/lzma-pack/pack.py` with `importlib` and calls its helpers (`opening_style`, `js_escape`, `CP1252_HI`, `find_minifier`, `minify`, `minify_page`, `cp1252_text`, `NODE_HARNESS`, `pack`). Do not copy them here; if you rename one there, change this file. Do not edit lzma-pack from this folder's work.
- The decoder source is `modules/ppmd-decode/ppmd-decode.js` cut at the first `\nif (typeof module`, so the file must stay ONE top-level function above the export block. `// lean-cut` lines are dropped and `throw new Error(...)` (on one line) becomes `throw 0`. `decoder_source()` stops with a message if an `Error(` or `lean-cut` is left.
- The payload lives in a global with the long name `PAYLOAD_NAME` (`__ppmdPackedPayload_5c2e8d14`); the loader copies it into a local `s` and deletes the global. It sits in its own `<script>` so a minifier cannot fold it. Tests look for both.
- `ppmd7_encode.py` keeps the whole model in one `bytearray` viewed as bytes, 16-bit and 32-bit words (`memoryview.cast`), with the same layout and the same allocator as the C code, so that restarts and gluing happen at exactly the same moments. Do not "simplify" the allocator: the output would stop matching the C encoder (and the decoder would diverge). The hot path searches contexts with slices and `bytes.find`, and sums with `itertools.compress`; changes should be timed on `html_banana-game.min.html`-sized input.
- `encode_job` is module level so `--tune` can use a process pool; `pack(..., jobs=1)` forces one process.
- `test/run.py` needs no browser. `test/browser.py` checks the real unpack path (file://, HTTP with and without a charset header), the "Opening..." page with JavaScript off, a damaged payload and a file re-saved as text. Do not use `--tune` on large inputs in tests.

## Prior art

Checked on October 15, 2026 (details and sources for the decoder side are in [modules/ppmd-decode](../../modules/ppmd-decode/README.md)). I found no other tool that packs a web page with PPMd into one self-unpacking file, and no other standalone JavaScript PPMd decoder. The tools below are the nearby alternatives:

| Tool | How it compresses | Decoder in the page | Speed in the page | Notes |
|---|---|---|---|---|
| **ppmd-pack (this)** | PPMd var.H (7-Zip's text compressor) | about 6.6 KB | 115 to 190 ms for a 431 KB page | 9 to 12% under LZMA on a single page; pure Python packer |
| [lzma-pack](../lzma-pack/README.md) (this repository) | LZMA | about 2.1 KB | 25 to 65 ms | the usual choice |
| [single-file-tools](../single-file-tools/README.md) (this repository) | Zopfli deflate | none (the browser unzips) | 3 to 4 ms in Firefox 158 and Chromium 155 | biggest output, fastest start |
| Built-in `DecompressionStream("brotli")` | Brotli | none | 4 ms in Firefox 158 | Firefox 158 only; Chromium 155 cannot do it. On the 431 KB test page Brotli's best level is 125,210 bytes, 2% under LZMA and 7.9% over PPMd |
| [Roadroller](https://github.com/lifthrasiir/roadroller) 2.1.0 (MIT) | Context mixing, made for JavaScript in size contests | about 0.7 KB | **8.4 s** in Node for the 431 KB test page | the strongest packer for JavaScript text (about 110 KB of information against PPMd's 115 KB here), but it prints its output as text, so the file is bigger than that, and it is built for 1 to 30 KB inputs |
| [js13k-packer](https://www.npmjs.com/package/js13k-packer) | minify, Roadroller, zip | zip | n/a | packaging for a contest, not a decoder |
| [RegPack](https://github.com/Siorki/RegPack) (MIT) | repeated-pattern substitution | tiny | fast | meant for 1 to 4 KB programs |
| JsExe, pnginator | deflate inside a PNG, read back through a canvas | tiny | fast | pnginator needs an HTTP server in Chrome |
| [fflate](https://www.npmjs.com/package/fflate), pako, tiny-inflate | deflate libraries | 3.8 KB (fflate inflate only, measured), 30 KB, 3.5 KB | fast | deflate is the weakest of these on text |
| [lzma-js](https://www.npmjs.com/package/lzma), [xz-decompress](https://www.npmjs.com/package/xz-decompress) | LZMA | larger than ours | slower than WebAssembly | xz-decompress is a 20 KB WebAssembly wrapper |
| [7z-wasm](https://www.npmjs.com/package/7z-wasm) | whole 7-Zip as WebAssembly | 1.65 MB plus 83 KB | 55 to 67 ms | far too big for a one-file page |

What this means for choosing: PPMd sits between LZMA and context mixing. It is a better trade than Roadroller when you cannot make the player wait seconds, and a worse one than LZMA or deflate when the page is small or starts often on slow phones.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
