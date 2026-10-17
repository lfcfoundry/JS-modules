# single-file-tools

**Version 1.1.0 · API 1**

**Tested in:** Chromium 153 and Firefox 157 (the bytes page unpacks from `file://` and from a server that sends no charset, 2026-10-17). Not run: Firefox 158, ungoogled Chromium 155, WebKitGTK, a phone.

Shrinking a game that is one HTML file with fonts and pictures inside it. These are the steps used for the owner's single-file games, each optional (`build-example.sh` runs them all).

| Tool | Does | Needs |
|---|---|---|
| `optfonts.py in.html out.html` | cuts every base64 `@font-face` down to the characters the file can actually show (typed, `\uXXXX`, `\u{...}`, JavaScript surrogate pairs like `😀`, CSS escapes like `content:"\2605"`, `&entity;`), keeps kerning, ligatures and tabular digits, re-embeds as woff2. Keeps each font's copyright and license text and warns about the SIL Open Font License. `--extra "ñé"` for text loaded later, `--format woff` when brotli is missing. `--report` also lists the characters the page prints that a font lacks; `--costs` measures what each layout feature costs in bytes per font. The `data:` type and `format()` hint are rewritten to say woff2 (or woff) | `pip install fonttools brotli` |
| `optsvg.js in.html out.html [--report]` | tightens inline `<svg>` anywhere in the page's markup with svgo, **without** merging, moving or renaming anything a style rule or script could point at; SVG text inside scripts, styles, textareas and comments is left alone. A picture with its own `<style>` is handled; one with a script inside, or never closed, is left as written and listed. `--report` adds the gzip-9 size of the whole file before and after, so you can see what the step really saves | `npm i svgo` |
| `pack.py in.html out.html "Title" [--bg COLOR] [--encoding base64\|bytes] [--fast \| --best \| --passes N]` | Zopfli-squeezes the page into a tiny self-extracting page that unpacks with the browser's own `DecompressionStream`; while it unpacks, a centered "Loading…" line shows on a dark background (`--bg`, default `#101018`). `--encoding bytes` is about 23% smaller but only for a file you open directly (see below). Zopfli passes: 15 by default, `--fast` 5, `--best` 60 | `pip install zopfli` |
| `build-example.sh game.html` | the whole pipeline in order; works from any folder and writes next to the input | the above plus terser, html-minifier-terser |

## Quick start
```
pip install fonttools brotli zopfli ; npm i svgo terser html-minifier-terser
./tools/single-file-tools/build-example.sh game.html      # writes game.slim.html and game.small.html next to game.html
```
Or run one step: `python3 tools/single-file-tools/optfonts.py game.html game.fonts.html --report`.

## What each step saves (measured, and which packer to pick)
Measured on a 1 MB one-file game (5 embedded fonts, 30 inline pictures, 572 KB of script, 276 KB of CSS) in Chromium 153 and Firefox 157. Sizes are after gzip level 9, because that is what a player's browser downloads from a normal server.

| Step | Saves after gzip | Time |
|---|---|---|
| `optfonts.py` | about 44.6 KB (13%) | 0.9 s |
| `optsvg.js` (with the picture fix) | about 3.6 KB; before the fix it skipped the two biggest pictures and saved 45 bytes | 0.2 s |
| html-minifier-terser (HTML, CSS, JS) | about 77.3 KB (27%) | 2.0 s |
| `pack.py` base64 (what you ship) | 272 KB file; about 206 KB on the wire from a server that compresses | 1.8 s (15 passes), 1.0 s (`--fast`), 5.4 s (`--best`) |

Zopfli passes against size, same payload: 1 pass +412 bytes, 5 passes +75, 15 passes +30, 60 passes 0, 1000 passes -60 bytes for 84 seconds. So 15 is the default, `--fast` is for iteration builds and `--best` for the last one.

| Need | Pick | File size on that game |
|---|---|---|
| A page hosted on GitHub Pages | `pack.py` (base64, the default): no decoder to maintain, and the server compresses it again | about 272 KB on disk, 206 KB on the wire |
| A file you hand out or double-click, no JavaScript decoder | `pack.py --encoding bytes` | about 210 KB |
| A file you hand out, smallest | `lzma-pack` (bytes) | about 190 KB |
| Lots of text, over about 60 KB compressed | `ppmd-pack` (4 to 16% under LZMA on text; slower to unpack) | see its README |

Base64 costs 33% on disk but nothing over the wire from a server that compresses. Opening times in Chromium were the same within noise for all of these.

## Bytes mode (`--encoding bytes`): where it works
The squeezed bytes are stored as they are, and the page declares itself windows-1252 so each byte becomes one character. Checked in Chromium 153 and Firefox 157: it unpacks from a file opened directly (`file://`) and from a server that sends no charset. It does **not** work from a server that sends `Content-Type: text/html; charset=utf-8`, which GitHub Pages does: the browser then reads the bytes as UTF-8, the gzip checksum fails and the page says "could not be unpacked" instead of showing wrong text. Use it for a copy you hand out, not for a page you host. It reuses `tools/lzma-pack/pack.py` for the escaping, so keep that folder next to this one.

## Font licenses (read this before shipping)
Subsetting is a modification of the font. Most free web fonts are under the SIL Open Font License (OFL), which asks that every copy keeps the copyright notice and license text, and that a modified font does not use a declared Reserved Font Name. `optfonts.py` therefore:
- keeps the font's copyright, license text and license URL records (name IDs 0, 13 and 14) inside each subset;
- writes the same notice into a `/*! ... */` comment in front of the `@font-face` rule (an HTML minifier that strips all comments may remove it; check your build output, or keep the notice visible in a credits screen);
- prints a warning on screen when a font is under the OFL, and names the Reserved Font Name if there is one;
- warns when a font carries no license text at all.

It does not decide anything for you and it is not legal advice. Put the font's license text with your game.

## Tests
`python3 tools/single-file-tools/test/run.py` (Python 3; a few seconds). It builds a small fixture page with a test font made on the fly, runs each tool and checks that the glyphs the page can print survive, unused glyphs are dropped, the license records and warnings appear, SVG ids and scripts are unchanged, `build-example.sh` finds its tools from another folder, the Zopfli loader reports a damaged file and an old browser correctly (in base64 and bytes mode, including a server that forces utf-8), the skipped-picture cases, the missing-character and `--costs` reports, and the waiting page (centered "Loading…", dark default, `--bg` color, bad colors fall back, small growth, unpacked page unchanged). Cases whose tool is missing are skipped with a message: the font cases need `fonttools` (and run as woff when `brotli` is missing), the SVG and loader cases need Node.js, the SVG cases use a stand-in for svgo unless the real one is installed, and the real Zopfli command line needs `zopfli`. Nothing here opens a browser.

## Prior art
- **[subfont](https://www.npmjs.com/package/subfont)** (MIT) subsets the fonts a web page uses and can load them well; it works on pages served normally, not on a font already embedded as base64 in a one-file page.
- **fontTools `pyftsubset`** is the engine `optfonts.py` calls (its docs say `--no-hinting` can cut up to about 30%, and woff2 output needs the Brotli Python module).
- **svgo** is the engine `optsvg.js` calls; **Zopfli** is the engine `pack.py` calls. Nothing here replaces them; the value is in the safe settings and in knowing which glyphs and ids a one-file game really uses.
- General minifiers do not know which glyphs a one-file game can print or which SVG ids its script uses. These tools are small and conservative on purpose.

## Limits
- `pack.py` needs JavaScript and a 2023+ browser, decodes before first paint, and shows base64 (or, in bytes mode, unreadable bytes) in view-source; keep a normal copy for old browsers. A browser that can run scripts but lacks `DecompressionStream` is told so; one too old to read the loader shows a note after 8 seconds. While it unpacks, the page shows a small centered "Loading…" line on `--bg` (default dark `#101018`; text color follows the background; about 145 bytes more than the old plain white page). Unlike lzma-pack there is no `auto` mode that reads your page's own color: pass `--bg` to match a light or colored game. `--bg` takes a plain color (`#hex`, `rgb(...)`, `hsl(...)` or a name); anything else falls back to the default and says so. The line sits in an inline `style`, so a strict Content-Security-Policy that forbids inline styles shows plain white instead.
- `optfonts.py` only handles `@font-face` with `data:` base64 sources and single-quoted family names. It rewrites the `data:` type and the `format()` hint in those rules to say woff2 (or woff); a rule that lists several `src` entries gets the same label on all of them.
- `--costs` subsets each font once per layout feature, so it takes a few seconds per font; it measures the bytes of the font, not of the whole page after gzip.
- Glyph choice reads the page text. A character that only exists in data loaded later, built with `String.fromCharCode(...)` or computed in some other way is not seen: add it with `--extra`. A few JavaScript escapes such as `\d` look like CSS escapes; the worst result is one extra glyph.
- `optsvg.js` handles pictures written in the markup. Pictures a script builds from strings are not touched (on purpose).
- Always look at the result in a browser before shipping.

## For AI agents
- Run `python3 tools/single-file-tools/test/run.py` after any change; add a case there for every behavior you change.
- `optfonts.py` exposes `collect_chars(text, extra)` and `optimize(text, ...)` for tests; the command line is `main()`. Keep the `--format woff` option: it lets the checks run without brotli.
- Do not rename or merge SVG ids in `optsvg.js`; scripts and style rules point at them. Keep `<script>`, `<style>`, `<textarea>` and comments outside pictures out of its reach, and never hand svgo a picture that has a script inside.
- `pack.py` exposes `build_page(gzip_bytes, title, bg)` (base64, a str) and `build_page_bytes(gzip_bytes, title, bg)` (bytes mode, bytes); it never raises on a bad `bg` (it falls back to `DEFAULT_BG`) and only the command line prints a note. The color goes into a style attribute, so keep it validated. The loader must stay plain ES5 so an old browser can at least read it and show a message. Keep the title escaped.
- Never remove the font copyright and license handling; the games ship these fonts.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
