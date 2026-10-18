# lzma-pack

**Version 1.1.2 · API 1**

**Tested in:** Python 3 tests of the packer (lzma-pack 25 checks, ppmd-pack 30 checks); the packed page is byte for byte the same as before on a 38 KB sample, so the earlier browser results (ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5) still stand; not rerun in a browser, not run on a phone

Turns one HTML file into one smaller, self-unpacking HTML file using LZMA, and checks a hash of the result before running it. Python 3 standard library only (an optional minifier, terser or esbuild, shrinks the loader).

`pack.py` compresses the page with LZMA and writes a wrapper page: the compressed bytes plus a minified loader built from [`modules/lzma-decode`](../../modules/lzma-decode/README.md) (2,340 bytes in `bytes` mode and 2,148 in `base64` mode with terser on the example page; the "Opening..." line adds roughly 0.1 KB). While it unpacks, an "Opening..." line shows on the page's own background color (read from the input page, or given with `--bg`), so a dark game never flashes white. Opening the file unpacks the page, verifies the hash and replaces itself with the real page. If the hash does not match (the file was saved as text, or cut short) it shows a plain message and runs nothing.

Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry

## Why it exists

A single-file offline game or tool that has to stay one file can use a few extra percent. **How much it gains depends on the file.** In the game this came from, LZMA made the file 24.7% smaller than ordinary deflate (147,730 to 111,241 bytes) with a loader of about 2.6 KB. On a page already squeezed with Zopfli the gain was only about 10% (249,190 to 224,251 bytes). Expect 10 to 25 percent; try both packers on your own file. An automatic mode that builds both and keeps the smaller is an idea, not part of this tool.

## Use

```
python3 tools/lzma-pack/pack.py mypage.html mypage.packed.html --title "My page"
```

Open `mypage.packed.html` by double-click. Ready-made examples: `example/packed-bytes.html` (5,287 bytes) and `example/packed-base64.html` (5,511 bytes); both unpack `example/app.html`.

**Test it:** `python3 tools/lzma-pack/test/run.py` (Python 3 and Node.js, no browser, a few seconds) and `python3 tools/lzma-pack/test/browser.py` (Playwright for Python with Chromium, offline). The embedded decoder is tested separately: `node modules/lzma-decode/test/run.js`.

## Options

| Option | Meaning |
|---|---|
| `--title T` | Title of the wrapper page. |
| `--head HTML` | Extra HTML for the wrapper's head, for example a Content-Security-Policy meta tag. In such a tag the packer adds `'wasm-unsafe-eval'` to `script-src` (or builds a `script-src` from `default-src`); nothing else in the policy changes, and a page with no policy gets none. |
| `--encoding bytes\|base64` | `bytes` (default): smallest, stored raw, wrapper declared windows-1252. `base64`: about a third bigger, safe on any server or editor. |
| `--tune` | Try lc 0-4 and pb 0-2 and keep the smallest result (slower). |
| `--bg auto\|none\|COLOR` | Color behind "Opening...". `auto` (default) reads it from the input (inline `<body style>`, the last `html`/`body`/`:root` background rule, or a `theme-color` meta tag; white if none). `none` shows nothing. Or a color such as `#101018`. |
| `--minify-page` | First minify the page's own inline scripts (needs terser or esbuild). Off by default. |
| `--wasm` | Off by default. Also ship the 4,087-byte WebAssembly decoder; the loader tries it first and uses the JavaScript decoder if it is missing, refused or wrong. |
| `--skip-node-check` | Do not run the packed page's own decoder in Node after packing. |
| `--minifier auto\|terser\|esbuild\|none` | Finds `terser` or `esbuild` on the PATH, in a `node_modules/.bin`, or from the `TERSER` / `ESBUILD` environment variable. Without one the loader is about 8.4 KB. |

**What the packer checks.** After packing it stops with an error if either check fails: (1) Python's own `lzma` unpacks the data and matches the input; (2) if Node.js is installed, the packed page's scripts run in a bare Node sandbox and must write back the input page, show no error and leave no global variable behind. Without Node it says so and skips this. The input must be valid UTF-8 (anything else is refused with the offset of the first bad byte); a leading byte order mark is accepted and dropped on unpacking.

**`--minify-page`** runs terser (or esbuild) over the page's inline classic scripts before packing. It leaves module scripts, scripts with `src`, data blocks and unparsable scripts alone, and top-level names keep their names so `onclick="..."` handlers still work. On the real Fancy, the Banana page (701,722 bytes): 184,549 bytes packed, 133,455 with `--minify-page` (27.7% smaller; smaller is better). The original, packed and minified packed pages showed the same page (19 canvases, 58 buttons) with no errors in Firefox 158 and ungoogled-chromium 155. That is a load check, not a play-through: play your game once before shipping it. Off by default because it changes your game's code.

**`--wasm`** costs file size because the WebAssembly bytes cannot be LZMA-packed (smaller is better):

| Page (packed, `bytes`, terser) | Default | With `--wasm` | Change |
|---|---|---|---|
| Pineapple Defense, 569,513 bytes in | 148,360 | 152,880 | +4,520 bytes (+3.0%) |
| Fancy the Banana, 701,727 bytes in | 184,728 | 189,228 | +4,500 bytes (+2.4%) |

Time from opening the file until the unpacked page starts (milliseconds, smaller is better; median of 9 loads for Pineapple, 5 for Fancy; includes the browser's own page work and a 30 ms timer in the loader, so only the difference matters):

| Browser | Pineapple default | Pineapple `--wasm` | Fancy default | Fancy `--wasm` |
|---|---|---|---|---|
| ungoogled-chromium 155.0.8059.39-1 | 104.0 | 77.7 | 117.9 | 87.4 |
| Firefox 158.0 (reports 158.0b5) | 150.0 | 132.0 | 149.0 | 130.0 |
| WebKitGTK 2.52.6 | 84.0 | 70.0 | 100.0 | 76.0 |
| GNOME Web 46.5 | 111.0 | 88.0 | 117.0 | 95.0 |

The saving is 14 to 30 ms on a desktop; a phone is not measured. A game already close to a size limit should keep the default. It needs `'wasm-unsafe-eval'` in the wrapper's `script-src` (the packer adds it to every policy it finds in `--head`). Chromium and Firefox refuse WebAssembly without it and the page then uses the JavaScript decoder (checked in both with a policy cut of the word); WebKitGTK 2.52.6 and GNOME Web 46.5 did not refuse it there, so that fallback was not exercised in them. The packer's own Node check covers four cases (counting WebAssembly, none, one whose compile step throws, one returning a wrong length), so a damaged `lzma-decode.wasm` is caught at pack time.

## How it compares

The projects below were found by web search; they were not installed or benchmarked here, so no speed or size numbers are given. Read each project's own README before relying on this.

| Alternative | What it is | Use it instead when |
|---|---|---|
| [`lzma` on npm](https://www.npmjs.com/package/lzma) and [kripken/lzma.js](https://github.com/kripken/lzma.js) (as far as known, an Emscripten build of the C LZMA code) | JavaScript LZMA that can compress as well as decompress | you need to compress in the browser. This decoder is smaller because it only decodes. |
| `.xz` (LZMA2) decoders, including WebAssembly builds | the newer container | you have `.xz` data; this tool decodes only LZMA1. |
| [Roadroller](https://github.com/lifthrasiir/roadroller) (MIT) | a far stronger packer for JavaScript source, built for contests such as js13k; by its own description it trades speed for size | the input is small code and size matters most. This tool is for whole pages with larger embedded data, where LZMA is fast and simple. |
| [js13k-packer](https://www.npmjs.com/package/js13k-packer) | wraps a contest entry for the js13k rules | you are entering that contest. |
| [`tools/single-file-tools`](../single-file-tools/README.md) (this repository) | Zopfli-deflate packer with no decoder (browsers unpack deflate natively) | the page is under roughly 10 KB, or you want the simplest thing. |

What is specific here: one HTML file, compressed bytes stored raw (the `windows-1252` trick) to avoid the 25-33% growth of text encodings, a hash check of the unpacked page, and a decoder you can read in one sitting.

## What it is not

- **Charset header (important).** `bytes` mode declares the wrapper `windows-1252`. A server that sends `charset=utf-8` overrides that, and the loader then refuses to run and shows a message. **GitHub Pages sends a utf-8 header**, so use `--encoding base64` there. `bytes` is fine from `file://`, from email attachments and from servers that send no charset. The tests cover both.
- **The file must stay byte for byte.** Saving a `bytes` copy from an editor as text corrupts it; the hash check catches this and runs nothing. Keep the original.
- **Small pages get bigger.** The loader is under 3 KB, so packing pays off above roughly 10 KB of input.
- **It replaces the page with `document.write`.** Page scripts run after unpacking, but a `<base>` tag or a Content-Security-Policy meta tag must be passed with `--head`, and a strict policy that forbids inline script blocks the loader. The "Opening..." colors are an inline `style`, so a policy that forbids inline styles shows plain white until unpacked (use `--bg none`).
- **The hash is for accidents.** It is a 32-bit "multiply by 31" sum: it catches a cut-off or re-saved file, not tampering.
- **The background color is a guess.** `auto` reads simple CSS only, not colors set by script. Check a dark game's first moment once, or pass `--bg`.
- **Character set after unpacking (reasoned, not tested).** In `bytes` mode the window stays windows-1252 after `document.write`; if your game builds URLs with non-ASCII text in the query string, test the packed copy once.
- **A wait of about 30 ms** before unpacking lets the browser paint "Opening..." first; painting is up to the browser, not guaranteed.

## For AI agents

- `js_escape` only escapes NUL, CR, LF, quote, backslash and a `<` followed by `/` or `!`. If you change the wrapper, keep the payload in its own `<script>` so a minifier cannot fold it into the loader.
- `pack.py` embeds `modules/lzma-decode/lzma-decode.js` cut at the line `function lzmaDecodeFile`; keep that function last before the export line, and do not write that phrase at the start of a line in a comment above it.
- The payload lives in a global with the long name `PAYLOAD_NAME` (`__lzmaPackedPayload_...`); the loader copies it into a local `s` and deletes the global at once. Do not go back to `var s=...`: a game with its own top-level `let s` would break. Tests look for this.
- Do not use `--tune` in tests (slow). `test/run.py` needs no browser (leaked variable, Node round trip including a deliberately broken decoder, UTF-8 refusal, background detection, the `Opening...` line). `test/browser.py` checks the real unpack path (file://, HTTP with and without a charset header), a damaged payload and a file re-saved as text. Pass `check_node=False` to `pack.pack()` in tests that do not need the Node check.

## Prior art and credits

Written for this repository. The source header of `pack.py` credits no outside code, and it imports only the Python 3 standard library (`argparse`, `base64`, `json`, `lzma`, and similar).

- The LZMA algorithm and format were designed by Igor Pavlov. Compression here is done by Python's own `lzma` module (liblzma), which is part of Python and is not copied into this repository.
- The decoder inside every packed page is `modules/lzma-decode`, written from the published LZMA specification; its credits are in [`modules/lzma-decode`](../../modules/lzma-decode/README.md). The optional WebAssembly loader uses that module's `wasm/lzma-decode.wasm`.
- `terser` and `esbuild` are optional outside programs that `pack.py` runs if it finds them, to shrink the loader. Nothing from them is stored in this repository.
- The `lzma` npm package, kripken/lzma.js, Roadroller (lifthrasiir, MIT), js13k-packer and the `.xz` decoders are named for comparison only; no code was taken from them.

## Full research notes

The long version of this page (the step-by-step account of the WebAssembly loader and its self-check, the full comparison write-up, and the example rebuild commands) is kept in the project's private knowledge base.
