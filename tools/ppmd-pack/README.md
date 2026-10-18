# ppmd-pack

**Version 1.1.1 · API 1**

**Tested in:** Python 3 tests of the packer (lzma-pack 25 checks, ppmd-pack 30 checks); the packed page is byte for byte the same as before on a 38 KB sample, so the earlier browser results (ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5) still stand; not rerun in a browser, not run on a phone

Turns one HTML file into one smaller, self-unpacking HTML file using PPMd (the "PPMd7" / variant H compressor that 7-Zip offers), and checks a hash of the result before running it. It is the heavier sibling of [`lzma-pack`](../lzma-pack/README.md): the same wrapper page and options, a stronger compressor for text and code, and a bigger, slower decoder. Python 3 standard library only (an optional minifier, terser or esbuild, shrinks the loader); the encoder is pure Python, nothing is compiled or downloaded.

`pack.py` compresses the page with PPMd and writes a wrapper page: the compressed bytes plus a minified loader built from [`modules/ppmd-decode`](../../modules/ppmd-decode/ppmd-decode.js). While it unpacks, an "Opening..." line shows on the page's own background color, so a dark game never flashes white. The loader checks a hash of the compressed bytes, unpacks, checks a hash of the result, and replaces itself with the real page; if a hash does not match (the file was re-saved as text, or cut short) it shows a plain message instead of running anything. `ppmd7_encode.py` also works on its own: `encode(data, order, mem)` returns the raw 7z-style PPMd7 stream, byte for byte what the 7-Zip C encoder writes.

## Why it exists

A single-file page or game ships as one HTML file, so a smaller file is a faster download. PPMd compresses text and code better than LZMA (4 to 16% smaller data on the test set below), but it needs a bigger and slower decoder in the page, so it pays off only for larger pages. That is why it is its own tool next to `lzma-pack` and the Zopfli packer, not a replacement for them.

## Use

```
python3 tools/ppmd-pack/pack.py mypage.html mypage.packed.html --title "My page"
python3 tools/ppmd-pack/pack.py mypage.html mypage.packed.html --compare      # also prints the LZMA packer's sizes
```

Open `mypage.packed.html` by double-click. Examples: `example/packed-bytes.html` and `example/packed-base64.html` (both unpack `example/app.html`; bigger than the 2.7 KB original, since the loader alone is 7.3 KB: they show the mechanism, not the saving).

Test it: `python3 tools/ppmd-pack/test/run.py` (Python 3 and Node.js, no browser, about 20 seconds) and `python3 tools/ppmd-pack/test/browser.py` (Playwright for Python with Chromium, offline; real unpack paths, a damaged payload, a re-saved file). The decoder is tested separately: `node modules/ppmd-decode/test/run.js`.

## Options

| Option | Meaning |
|---|---|
| `--head HTML` | Extra HTML for the wrapper's head, such as a Content-Security-Policy meta tag. In such a tag the packer adds `'wasm-unsafe-eval'` to `script-src`; nothing else in the policy changes, and a page with no policy gets none. |
| `--encoding bytes\|base64` | `bytes` (default): smallest, stored raw, wrapper declared windows-1252. `base64`: about a third bigger, safe on any server or editor. |
| `--order N` | Model order, 2 to 64 (default 12). Higher helps repetitive pages and costs time. |
| `--mem BYTES` | Model memory, 2048 and up, `K`/`M` suffix accepted. Default: the smallest power of two at least 8 times the input, between 1 MB and 16 MB. **The page allocates this much at start** and frees it afterwards. Order and memory are written into the loader. |
| `--tune` | Try orders 4 to 32 with memory 1 to 16 MB (about 35 pure-Python encodings over all processors) and keep the smallest; never bigger than the default. Replaces `--order` and `--mem`. |
| `--compare` | Also build the LZMA packer's page (raw LZMA, lc=4 lp=0 pb=0, preset 9 extreme) and print both payloads and both net page sizes. |
| `--title T`, `--bg auto\|none\|COLOR`, `--minify-page` | Wrapper page title; color behind "Opening..." (as in lzma-pack); minify the page's own inline scripts first (needs terser or esbuild; off by default). |
| `--wasm` | Off by default. Also ship the WebAssembly PPMd decoder (9,317 bytes, stored raw); the loader tries it first and falls back to the JavaScript decoder if it is missing, refused or wrong. Needs `'wasm-unsafe-eval'` in the page's policy. Refuses a model memory that would not fit in one WebAssembly memory (1 GB with the page). |
| `--skip-node-check`, `--minifier auto\|terser\|esbuild\|none` | Skip the Node self-check below; pick the loader minifier (found on the PATH, in `node_modules/.bin`, or from `TERSER` / `ESBUILD`; without one the loader is about 22 KB). |

After packing, the packer runs the page's real decoder in a bare Node sandbox; the result must equal the input page, show no error and leave no global behind. Without Node.js it says so and **nothing has verified the packed data** (PPMd is not in the Python standard library, so there is no Python-side decoder). The input must be valid UTF-8 (a leading byte order mark is dropped). The hash check on the compressed bytes runs before decoding because a re-saved or cut PPMd stream can make the lean decoder spin forever; it catches accidents, not tampering.

## How it compares

Three packers live in this repository; none is best for every file.

| | Zopfli deflate ([`single-file-tools`](../single-file-tools/README.md) `pack.py`) | [`lzma-pack`](../lzma-pack/README.md) | `ppmd-pack` (this tool) |
|---|---|---|---|
| Decoder in the page | none: the browser unzips (`DecompressionStream`, browsers since 2023) | about 2.3 KB | about 7.3 KB (5.0 KB more than LZMA) |
| Size of the compressed data | biggest (LZMA was 10 to 25% smaller on our games) | middle | smallest on text and code: 4 to 16% under LZMA's on our test set |
| Unpacking time (431 KB page, in a browser) | fastest (native) | about 25 to 65 ms | about 115 to 190 ms (4 to 8 times slower than LZMA) |
| Packing time | slow (Zopfli) | seconds | pure Python, about 90 to 130 KB/s (a 431 KB page about 4 s, a 5 MB page about a minute) |
| Use it when | pages under about 10 KB, or you want the simplest thing | pages of 10 KB and up (the usual choice) | the page holds **about 60 KB or more of compressed data** and you can spend a few MB and about 0.1 to 0.2 s |

Where 60 KB comes from: the decoder costs 5.4 KB more than LZMA's and wins back about 5 to 15% of typical text and code, so break-even is 54 KB of LZMA data at 10% and 108 KB at 5%. Packed pictures and audio gain nothing from either. Run `--compare` on your own file.

**Ten test files** (default settings, `--encoding bytes`, terser loader; each page unpacked and checked in Node; "packed page" is the whole output file; bytes, smaller is better). A few rows:

| Input | Size | LZMA packed page | PPMd packed page | Payload, PPMd vs LZMA |
|---|---:|---:|---:|---:|
| `html_demo-frame-kit.html` | 17,425 | 8,956 | 13,240 | 5,521 vs 6,206 (-11.0%) |
| `json_story-nodes.json` | 181,527 | 64,581 | 60,888 | 51,992 vs 60,435 (-14.0%) |
| `html_banana-game.min.html` | 431,473 | 133,434 | 129,579 | 118,874 vs 127,531 (-6.8%) |
| `js_three.min.js` | 691,648 | 145,049 | 144,699 | 133,611 vs 138,877 (-3.8%) |

The data is smaller with PPMd on nine of ten files (4 to 16%; the exception is base64 audio, already dense), but the whole page is clearly smaller only on three files (3 to 4%), where LZMA's data was above about 60 KB and PPMd's gain above about 5%; on `three.min.js` it is a tie (-0.2%). Minified JavaScript gains least. `--tune` took `json_story-nodes.json` from 60,888 to 56,168 bytes (-7.8%, 18 s on two processors).

**With `--wasm`** the page grows by about 9.7 KB (the 9,317-byte program plus about 380 bytes of loader) and unpacks about 1.5 to 2.1 times sooner. Apple Press page (2026.10.17.1445, 703,049 bytes; PPMd order 12, 8 MB), time from page start to unpacked page ready, median of 5 runs, one browser at a time (size in bytes: smaller is better; ms: lower is better):

| Page | Size (bytes) | Chromium 155 (ms) | Firefox 158 (ms) | WebKitGTK 2.52.6 (ms) | GNOME Web 46.5 (ms) |
|---|---:|---:|---:|---:|---:|
| LZMA | 191,584 | 106 | 89 | 120 | 119 |
| LZMA, `--wasm` | 196,119 | 64 | 74 | 86 | 114 |
| PPMd | 188,602 | 313 | 313 | 392 | 376 |
| PPMd, `--wasm` | 198,362 | 194 | 204 | 184 | 182 |
| PPMd `--wasm`: times faster than PPMd (higher is better) | | 1.6x | 1.5x | 2.1x | 2.1x |

For this page LZMA is the better choice on both counts: PPMd with `--wasm` still opens 1.6 to 3 times slower than LZMA and is 6.8 KB **bigger** than the LZMA page, instead of 3.0 KB smaller. It pays only where PPMd's smaller data wins by more than the 9.7 KB (roughly 2 MB for a page like this) and the opening time is acceptable. Numbers move by about 10 to 20% from run to run. On a page whose policy forbids WebAssembly the loader uses the JavaScript decoder (all four browsers: the page opened in 317 to 438 ms, the same as a plain PPMd page). Not run on a phone.

**Other tools** (checked October 15, 2026; I found no other tool that packs a web page with PPMd into one self-unpacking file, and no other standalone JavaScript PPMd decoder):

- **Built-in `DecompressionStream("brotli")`**: no decoder, 4 ms in Firefox 158; Firefox 158 only, Chromium 155 cannot do it. On the 431 KB test page Brotli's best level is 125,210 bytes, 2% under LZMA and 7.9% over PPMd.
- **[Roadroller](https://github.com/lifthrasiir/roadroller) 2.1.0 (MIT)**: context mixing for JavaScript in size contests, decoder about 0.7 KB, but **8.4 s** in Node for the 431 KB test page (a Node figure, not measured in a test browser). Strongest for JavaScript text, but it prints text, so the file is bigger, and it is built for 1 to 30 KB inputs.
- Smaller or different tools: [js13k-packer](https://www.npmjs.com/package/js13k-packer) (contest packaging), [RegPack](https://github.com/Siorki/RegPack) (MIT, 1 to 4 KB programs), JsExe and pnginator (deflate in a PNG), [fflate](https://www.npmjs.com/package/fflate), pako and tiny-inflate (deflate decoders 3.8 KB, 30 KB, 3.5 KB; fflate inflate only, measured; deflate is weakest on text), [lzma-js](https://www.npmjs.com/package/lzma) and [xz-decompress](https://www.npmjs.com/package/xz-decompress) (LZMA, larger decoders, slower than WebAssembly), and [7z-wasm](https://www.npmjs.com/package/7z-wasm) (whole 7-Zip as WebAssembly, 1.65 MB plus 83 KB, 55 to 67 ms; far too big for a one-file page).

PPMd sits between LZMA and context mixing: a better trade than Roadroller when the player cannot wait seconds, a worse one than LZMA or deflate when the page is small or starts often on slow phones.

## What it is not

- **Not for low-memory devices.** The page allocates `--mem` bytes at start (1 to 16 MB by default) and frees them afterwards; on a very low-memory device that can fail and the page shows the plain message. Use a smaller `--mem` (a larger file) or `lzma-pack`.
- **Not instant.** The loader is about 4 to 8 times slower than LZMA's (a 431 KB page took about 115 to 190 ms in a browser against 25 to 65 ms) and waits about 30 ms so "Opening..." can paint. For a game that must open instantly on slow phones, use `lzma-pack` or the Zopfli packer.
- **Not for servers that force `charset=utf-8`** (GitHub Pages does) with `bytes` encoding, which declares `windows-1252`: the loader shows its message. Use `--encoding base64` there.
- **Not editable.** The file must stay byte for byte; saving a `bytes` copy as text in an editor corrupts it (the hash check catches this). Keep a copy of the original.
- **Not friendly to strict policies.** It replaces the page with `document.write`: pass a `<base>` tag or policy meta tag with `--head`; a policy forbidding inline script blocks the loader, and one forbidding inline styles shows plain white instead of the colored "Opening..." page. The background color is a guess (`--bg auto` reads simple CSS only).
- **Not fast for big inputs.** Pure Python: use the default setting for big files and `--tune` for the final build.
- **Not forgiving about settings.** Elsewhere (for example `modules/ppmd-decode`) pass the same `order` and `mem` you encoded with; a different value gives garbage, not an error.
- **Little-endian machines only** (every browser target), for the encoder and the decoder.

## For AI agents

- `pack.py` loads `tools/lzma-pack/pack.py` with `importlib` and calls its helpers (`opening_style`, `js_escape`, `find_minifier`, `minify_page`, `NODE_HARNESS`, `pack` and more). Do not copy them here, and do not edit lzma-pack from this folder's work.
- The decoder source is `modules/ppmd-decode/ppmd-decode.js` cut at the first `\nif (typeof module`, so that file must stay ONE top-level function above the export block. `// lean-cut` lines are dropped and one-line `throw new Error(...)` becomes `throw 0`; `decoder_source()` stops if an `Error(` or `lean-cut` is left.
- `ppmd7_encode.py` keeps the whole model in one `bytearray` with the same layout and allocator as the C code. Do not "simplify" the allocator: the output would stop matching the C encoder.
- `encode_job` is module level so `--tune` can use a process pool; `pack(..., jobs=1)` forces one process. Do not use `--tune` on large inputs in tests.
- Encoder tests: ten fixtures in `test/fixtures/` (inputs plus the real C encoder's output) must match byte for byte, including tiny model memory so the model restarts often; `test/make_fixtures.py` rebuilds them from a compiled encoder, and `PPMD_REF_ENCODER=/path/to/compiled-encoder` makes `test/run.py` compare 48 more settings.

## Prior art and credits

- **PPMd variant H** is the algorithm of Dmitry Shkarin. `ppmd7_encode.py` is a port of the public-domain C code by Igor Pavlov (Ppmd7.c, Ppmd7Enc.c and Ppmd.h from the 7-Zip / LZMA SDK), itself based on Shkarin's PPMd var.H (stated in the file's header). Every packed page starts with a short HTML comment (about 150 bytes) crediting Dmitry Shkarin (PPMd variant H), Igor Pavlov (the public-domain 7-Zip code this follows) and LFC Foundry (the port); PPMd is public domain, so this is a courtesy, not a legal duty.
- The decoder in the packed page is `modules/ppmd-decode`, written for this repository (its README has its own credits). `pack.py` loads and reuses helper functions from `tools/lzma-pack/pack.py` of this repository.
- An optional minifier (terser or esbuild) is used on the loader if installed; no code from either is in this tool.
- Brotli, Roadroller, js13k-packer, RegPack, JsExe, pnginator, fflate, pako, tiny-inflate, lzma-js, xz-decompress and 7z-wasm are named for comparison only; their code is not used here.

## Full research notes

The long version of this page (the full ten-file table with page differences, the extra `--tune` runs, the speed measurements behind the encoder figures, the step-by-step list of what the packer checks and how the encoder is tested, and the long decoder-side prior-art comparison) is kept in the project's private knowledge base. The changelog is `CHANGELOG.md` in this folder.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
