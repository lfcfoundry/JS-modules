# lzma-pack

**Version 1.1.1 · API 1**

**Tested in:** ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time (tests/lzma-wasm-browser.js, a policy given without the token came out carrying it and the WebAssembly decoder ran in all four); 24 packer checks pass. Not run: a phone or Safari itself

Turns one HTML file into one smaller, self-unpacking HTML file using LZMA, and checks a hash of the result before running it. Python 3 standard library only (an optional minifier, terser or esbuild, shrinks the loader).

**Test it:** `python3 tools/lzma-pack/test/run.py` (Python 3 and Node.js, no browser, a few seconds) and `python3 tools/lzma-pack/test/browser.py` (Playwright for Python with Chromium; offline). The decoder it embeds is tested separately: `node modules/lzma-decode/test/run.js`.

## What it is

`pack.py` compresses the page with LZMA and writes a wrapper page: the compressed bytes plus a minified loader (measured with terser on the example page: 2,340 bytes in `bytes` mode and 2,148 in `base64` mode, including the long payload name; the Opening line adds roughly 0.1 KB more) built from [`modules/lzma-decode`](../../modules/lzma-decode/README.md). While it unpacks, a small "Opening..." line shows on the page's own background color (read from the input page, or given with `--bg`), so a dark game never flashes white. Opening it unpacks the page, verifies the hash, and replaces itself with the real page. If the hash does not match (the file was opened and saved as text, or cut short), it shows a plain message instead of running anything.

## Why it exists

For a single-file offline game or tool that has to stay one file, a few extra percent matter. **How much it gains depends on the file.** In the game this came from, LZMA made the file 24.7% smaller than ordinary deflate (147,730 to 111,241 bytes) with a loader of about 2.6 KB. On a page that was already squeezed with Zopfli the gain was only about 10% (249,190 to 224,251 bytes). Expect 10 to 25 percent; try both packers on your own file. (An automatic `--auto` mode that builds both and keeps the smaller one is an idea, not part of this tool.)

## Quick start

```
python3 tools/lzma-pack/pack.py mypage.html mypage.packed.html --title "My page"
```

Open `mypage.packed.html` by double-click. Ready-made examples: `example/packed-bytes.html` and `example/packed-base64.html` (both unpack `example/app.html`). They are rebuilt from `example/app.html` with the current packer (payload in `__lzmaPackedPayload_7f3a9c21`, no `var s=`), 5,287 and 5,511 bytes; the license notice comment in their head is passed with `--head`:

```
python3 tools/lzma-pack/pack.py tools/lzma-pack/example/app.html tools/lzma-pack/example/packed-bytes.html --title "lzma-pack example" --head "$(cat license-comment.txt)"
python3 tools/lzma-pack/pack.py tools/lzma-pack/example/app.html tools/lzma-pack/example/packed-base64.html --title "lzma-pack example" --head "$(cat license-comment.txt)" --encoding base64
```

(`license-comment.txt` is the `<!-- ... -->` block from the top of `app.html`, with the emoji left out because `--head` writes non-ASCII characters as `&#...;`.)

## Options

| Option | Meaning |
|---|---|
| `--title T` | Title of the wrapper page. |
| `--head HTML` | Extra HTML for the wrapper's head, for example a Content-Security-Policy meta tag. A Content-Security-Policy meta tag in it gets `'wasm-unsafe-eval'` added to its `script-src` (or a `script-src` built from its `default-src` when there is none); nothing else in the policy changes, and a page with no policy gets none. |
| `--encoding bytes\|base64` | `bytes` (default): smallest, stored raw, wrapper declared windows-1252. `base64`: about a third bigger, safe on any server or editor. |
| `--tune` | Try lc 0-4 and pb 0-2 and keep the smallest result (slower). |
| `--bg auto\|none\|COLOR` | Color behind the "Opening..." line. `auto` (default) reads it from the input: an inline `<body style>`, the last `html`/`body`/`:root` rule that sets a background (a `var(--name)` is looked up), or a `theme-color` meta tag; white if none is found. `none` shows nothing. Or a plain color such as `#101018`, `rgb(16,16,24)` or `black`. |
| `--minify-page` | First minify the page's own inline scripts (needs terser or esbuild), then pack. Off by default; see "Minifying the page first" below. |
| `--wasm` | Off by default. Also ship the WebAssembly decoder (4,087 bytes, stored raw behind the LZMA data): the loader tries it first and uses the JavaScript decoder if it is missing, refused or wrong. See "Optional WebAssembly loader" below. |
| `--skip-node-check` | Do not run the packed page's own decoder in Node after packing (see below). |
| `--minifier auto\|terser\|esbuild\|none` | Finds `terser` or `esbuild` on the PATH, in a `node_modules/.bin`, or from the `TERSER` / `ESBUILD` environment variable. Without one the loader is about 8.4 KB. |

## Optional WebAssembly loader (new in 1.1.0)

`--wasm` writes a loader that tries the WebAssembly LZMA decoder first (`modules/lzma-decode/wasm/lzma-decode.wasm`) and falls back to the JavaScript decoder, which is always in the page too. It is off by default because it costs file size: the WebAssembly bytes cannot be LZMA-packed themselves, so the page grows by about 4.5 KB.

| Page (packed, `bytes` encoding, terser) | Default | With `--wasm` | Change (smaller is better) |
|---|---|---|---|
| Pineapple Defense, 569,513 bytes in | 148,360 | 152,880 | +4,520 bytes (+3.0%) |
| Fancy the Banana, 701,727 bytes in | 184,728 | 189,228 | +4,500 bytes (+2.4%) |

Time from opening the file until the unpacked page starts (milliseconds, median of 9 loads for Pineapple Defense, 5 for Fancy; the number includes the browser's own page work and a 30 ms timer in the loader, so only the difference matters; smaller is better):

| Browser | Pineapple default | Pineapple `--wasm` | Fancy default | Fancy `--wasm` |
|---|---|---|---|---|
| ungoogled-chromium 155.0.8059.39-1 | 104.0 | 77.7 | 117.9 | 87.4 |
| Firefox 158.0 (reports 158.0b5) | 150.0 | 132.0 | 149.0 | 130.0 |
| WebKitGTK 2.52.6 | 84.0 | 70.0 | 100.0 | 76.0 |
| GNOME Web 46.5 | 111.0 | 88.0 | 117.0 | 95.0 |

The saving is 14 to 30 ms on a desktop; a phone is not measured. Whether 4.5 KB for 14 to 30 ms is worth it is the game owner's call; a game that is already close to a size limit should keep the default.

What the page needs: `'wasm-unsafe-eval'` in the `script-src` of the wrapper's Content-Security-Policy (the `--head` option; the packer adds it for you to every policy it finds there, so every packed page carries it). Chromium and Firefox refuse WebAssembly without it and the page then simply uses the JavaScript decoder (checked in both with a policy that lacks the word, made by cutting the token out of a packed page: the page still opened and no WebAssembly instance was made). WebKitGTK 2.52.6 and GNOME Web 46.5 did not refuse WebAssembly under that policy, so the fallback was not exercised there; it is exercised in Node by the packer's own check below. Pages without any policy need nothing.

The self-check runs the page's loader four times in Node: with a WebAssembly that counts its calls (the decoder must run exactly once and return the exact length), with no WebAssembly at all, with WebAssembly whose compile step throws (as a refusing policy does), and with a decoder that returns a wrong length. All four must write the input page back. A damaged `lzma-decode.wasm` is therefore caught at pack time instead of silently making every page slow.

## Minifying the page first

`--minify-page` runs terser (or esbuild) over the page's own inline classic scripts before compressing. It leaves alone module scripts, scripts with `src`, data blocks (JSON, templates) and any script the minifier cannot parse. Names at the top level of a script keep their names, so `onclick="..."` handlers and scripts that call each other still work; only names inside functions are shortened. The packer's checks then compare the unpacked page with the minified page.

Measured on the real Fancy, the Banana page (701,722 bytes, one big inline script): 184,549 bytes packed, 133,455 with `--minify-page` (27.7% smaller). I opened the original, the packed page and the minified packed page in Firefox 158 and ungoogled-chromium 155: all three showed the same page (19 canvases, 58 buttons) with no errors. That is a load check, not a play-through, so play your game once before shipping the minified version. It is off by default because it changes your game's code.

## What the packer checks

After packing it checks its own work twice, and stops with an error message if either fails:
1. Python's own `lzma` unpacks the data and compares it with the input.
2. If Node.js is installed, the packed page's two scripts (the shipped JavaScript decoder, the byte reader and the hash) run in a bare Node sandbox and must write back the input page, show no error message and leave no global variable behind. This is the check that matters, because it runs the code the player gets. Without Node the packer says so on screen and skips it.

The input must be valid UTF-8, because the loader decodes the unpacked page as UTF-8. Anything else (a Windows-1252 file, for example) is refused with the offset of the first bad byte. A leading byte order mark is accepted; the unpacked page comes back without it, which is what a browser does with a BOM anyway.

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
- **Small pages get bigger.** The loader is under 3 KB, so packing pays off above roughly 10 KB of input.
- **It replaces the page with `document.write`.** Your page's own scripts run after unpacking, but anything that relies on the wrapper (a `<base>` tag, a Content-Security-Policy meta tag) has to be passed with `--head`, and a strict CSP that forbids inline script will also block the loader. The "Opening..." colors are an inline `style` attribute, so a CSP that forbids inline styles shows plain white until the page is unpacked (use `--bg none` to leave it out).
- **The hash is for accidents.** It is a 32-bit "multiply by 31" sum: it catches a cut-off or re-saved file, not tampering.
- **The background color is a guess.** `auto` reads simple CSS only (it will not follow a color set by script). Check the first moment of a dark game once, or pass `--bg`.
- **Character set after unpacking (reasoned, not tested).** In `bytes` mode the wrapper declares windows-1252; after `document.write` the window is the same one. If your game builds URLs with non-ASCII text in the query string, test that once in the packed copy.
- **The packed page waits about 30 ms before it starts unpacking**, to give the browser a chance to paint the "Opening..." line first. Painting is up to the browser; it is not guaranteed.

## For AI agents

- `js_escape` only escapes NUL, CR, LF, quote, backslash and a `<` followed by `/` or `!`. If you change the wrapper, keep the payload in its own `<script>` so a minifier cannot fold it into the loader.
- `pack.py` embeds `modules/lzma-decode/lzma-decode.js` cut at the line `function lzmaDecodeFile`; keep that function last before the export line, and do not write that phrase at the start of a line in a comment above it.
- The payload lives in a global with the long name `PAYLOAD_NAME` (`__lzmaPackedPayload_...`). The loader copies it into a local `s` and deletes the global at once. Do not go back to `var s=...`: a game that declares its own top-level `let s` would stop working. Tests look for this.
- Do not use `--tune` in tests; it is slow. `test/run.py` needs no browser: it covers the leaked variable, the Node round trip (including a deliberately broken decoder), the UTF-8 refusal, the background detection and the `Opening...` line. `test/browser.py` checks the real unpack path (file://, HTTP with and without a charset header), a damaged payload, and a file re-saved as text.
- Pass `check_node=False` to `pack.pack()` in tests that do not need the Node check.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
