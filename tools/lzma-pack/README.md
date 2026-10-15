# lzma-pack

Turns one HTML file into one smaller, self-unpacking HTML file using LZMA, and checks a hash of the result before running it. Python 3 standard library only (an optional minifier, terser or esbuild, shrinks the loader).

**Test it:** `python3 tools/lzma-pack/test/browser.py` (Playwright for Python with Chromium; offline). The decoder it embeds is tested separately: `node modules/lzma-decode/test/run.js`.

## What it is

`pack.py` compresses the page with LZMA and writes a wrapper page: the compressed bytes plus a 2.6 KB minified loader built from [`modules/lzma-decode`](../../modules/lzma-decode/README.md). Opening it unpacks the page, verifies the hash, and replaces itself with the real page. If the hash does not match (the file was opened and saved as text, or cut short), it shows a plain message instead of running anything.

## Why it exists

For a single-file offline game or tool that has to stay one file, a few extra percent matter. In the game this came from, LZMA made the file 24.7% smaller than ordinary deflate (147,730 to 111,241 bytes) with a loader of about 2.6 KB.

## Quick start

```
python3 tools/lzma-pack/pack.py mypage.html mypage.packed.html --title "My page"
```

Open `mypage.packed.html` by double-click. Ready-made examples: `example/packed-bytes.html` and `example/packed-base64.html` (both unpack `example/app.html`).

## Options

| Option | Meaning |
|---|---|
| `--title T` | Title of the wrapper page. |
| `--head HTML` | Extra HTML for the wrapper's head, for example a Content-Security-Policy meta tag. |
| `--encoding bytes\|base64` | `bytes` (default): smallest, stored raw, wrapper declared windows-1252. `base64`: about a third bigger, safe on any server or editor. |
| `--tune` | Try lc 0-4 and pb 0-2 and keep the smallest result (slower). |
| `--minifier auto\|terser\|esbuild\|none` | Finds `terser` or `esbuild` on the PATH, in a `node_modules/.bin`, or from the `TERSER` / `ESBUILD` environment variable. Without one the loader is about 7.5 KB. |

## How it differs from existing open source

- **The [`lzma` package on npm](https://www.npmjs.com/package/lzma)** (a JavaScript LZMA library that can compress as well as decompress) and **[kripken/lzma.js](https://github.com/kripken/lzma.js)** (as far as I know an Emscripten build of the C LZMA code) are the established ways to use LZMA from JavaScript. Use one of them if you need to *compress* in the browser. This decoder is smaller because it only decodes, and it is a single readable function.
- **`.xz` (LZMA2) decoders**, including WebAssembly builds, exist for the newer container; this decodes only LZMA1.
- **[Roadroller](https://github.com/lifthrasiir/roadroller)** (MIT, by lifthrasiir) is a far stronger packer for JavaScript source, built for size-limited demo contests such as js13k, and it can beat LZMA on code. By its own description it trades speed for size, so it suits small inputs of code; this packer is for whole pages with larger embedded data, where LZMA is fast and simple.
- **[js13k-packer](https://www.npmjs.com/package/js13k-packer)** wraps a contest entry for the js13k rules; it is about packaging files rather than a custom decoder.
- What is specific here: this packer produces a *single* HTML file, stores the compressed bytes raw (the `windows-1252` trick below) to avoid the 25-33% growth of text encodings, checks a hash of the unpacked page, and ships a decoder you can read in one sitting.

I confirmed that these projects exist, from web search results, but I did not install or benchmark them. Read each project's own README before relying on this comparison.

Inside this repository, [`tools/single-file-tools`](../single-file-tools/README.md) has a Zopfli-deflate packer that needs no decoder (browsers unpack deflate natively). For pages under roughly 10 KB, or when you want the simplest thing, use that. This tool pays off for larger pages, where LZMA's better ratio outweighs the 2.6 KB loader.

## Limits and gotchas

- **Charset header (important).** The `bytes` encoding declares the wrapper page `windows-1252` so each stored byte is exactly one character. A server that sends `Content-Type: text/html; charset=utf-8` overrides that, and the loader then refuses to run and shows a message. **GitHub Pages sends a utf-8 header**, so for Pages use `--encoding base64` (about a third bigger). `bytes` is fine from `file://`, from email attachments, and from servers that send no charset. The tests cover both.
- **The file must stay byte for byte.** Opening a `bytes` copy in an editor and saving it as text corrupts it. The hash check catches this and shows a message instead of running anything. Keep a copy of the original.
- **Small pages get bigger.** The loader is about 2.6 KB, so packing pays off above roughly 10 KB of input.
- **It replaces the page with `document.write`.** Your page's own scripts run after unpacking, but anything that relies on the wrapper (a `<base>` tag, a Content-Security-Policy meta tag) has to be passed with `--head`, and a strict CSP that forbids inline script will also block the loader.

## For AI agents

- `js_escape` only escapes NUL, CR, LF, quote, backslash and a `<` followed by `/` or `!`. If you change the wrapper, keep the payload in its own `<script>` so a minifier cannot fold it into the loader.
- `pack.py` embeds `modules/lzma-decode/lzma-decode.js` cut at `function lzmaDecodeFile`; keep that function last before the export line.
- Do not use `--tune` in tests; it is slow. `test/browser.py` checks the real unpack path (file://, HTTP with and without a charset header), a damaged payload, and a file re-saved as text.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Fancy, the Banana](https://github.com/JNFoo/fancy-banana)
