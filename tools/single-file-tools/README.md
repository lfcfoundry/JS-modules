# single-file-tools

**Version 1.0.0 · API 1**

Shrinking a game that is one HTML file with fonts and pictures inside it. These are the steps used for the owner's single-file games, each optional (`build-example.sh` runs them all).

| Tool | Does | Needs |
|---|---|---|
| `optfonts.py in.html out.html` | cuts every base64 `@font-face` down to the characters the file can actually show (typed, `\uXXXX`, `\u{...}`, JavaScript surrogate pairs like `😀`, CSS escapes like `content:"\2605"`, `&entity;`), keeps kerning, ligatures and tabular digits, re-embeds as woff2. Keeps each font's copyright and license text and warns about the SIL Open Font License. `--extra "ñé"` for text loaded later, `--format woff` when brotli is missing | `pip install fonttools brotli` |
| `optsvg.js in.html out.html [--report]` | tightens inline `<svg>` anywhere in the page's markup with svgo, **without** merging, moving or renaming anything a style rule or script could point at; SVG text inside scripts, styles, textareas and comments is left alone | `npm i svgo` |
| `pack.py in.html out.html "Title" [--bg COLOR]` | Zopfli-squeezes the page into a tiny self-extracting page that unpacks with the browser's own `DecompressionStream`; while it unpacks, a centered "Loading…" line shows on a dark background (`--bg`, default `#101018`) | `pip install zopfli` |
| `build-example.sh game.html` | the whole pipeline in order; works from any folder and writes next to the input | the above plus terser, html-minifier-terser |

## Quick start
```
pip install fonttools brotli zopfli ; npm i svgo terser html-minifier-terser
./tools/single-file-tools/build-example.sh game.html      # writes game.slim.html and game.small.html next to game.html
```
Or run one step: `python3 tools/single-file-tools/optfonts.py game.html game.fonts.html --report`.

## Font licenses (read this before shipping)
Subsetting is a modification of the font. Most free web fonts are under the SIL Open Font License (OFL), which asks that every copy keeps the copyright notice and license text, and that a modified font does not use a declared Reserved Font Name. `optfonts.py` therefore:
- keeps the font's copyright, license text and license URL records (name IDs 0, 13 and 14) inside each subset;
- writes the same notice into a `/*! ... */` comment in front of the `@font-face` rule (an HTML minifier that strips all comments may remove it; check your build output, or keep the notice visible in a credits screen);
- prints a warning on screen when a font is under the OFL, and names the Reserved Font Name if there is one;
- warns when a font carries no license text at all.

It does not decide anything for you and it is not legal advice. Put the font's license text with your game.

## Tests
`python3 tools/single-file-tools/test/run.py` (Python 3; a few seconds). It builds a small fixture page with a test font made on the fly, runs each tool and checks that the glyphs the page can print survive, unused glyphs are dropped, the license records and warnings appear, SVG ids and scripts are unchanged, `build-example.sh` finds its tools from another folder, the Zopfli loader reports a damaged file and an old browser correctly, and the waiting page (centered "Loading…", dark default, `--bg` color, bad colors fall back, small growth, unpacked page unchanged). Cases whose tool is missing are skipped with a message: the font cases need `fonttools` (and run as woff when `brotli` is missing), the SVG and loader cases need Node.js, the SVG cases use a stand-in for svgo unless the real one is installed, and the real Zopfli command line needs `zopfli`. Nothing here opens a browser.

## Prior art
- **[subfont](https://www.npmjs.com/package/subfont)** (MIT) subsets the fonts a web page uses and can load them well; it works on pages served normally, not on a font already embedded as base64 in a one-file page.
- **fontTools `pyftsubset`** is the engine `optfonts.py` calls (its docs say `--no-hinting` can cut up to about 30%, and woff2 output needs the Brotli Python module).
- **svgo** is the engine `optsvg.js` calls; **Zopfli** is the engine `pack.py` calls. Nothing here replaces them; the value is in the safe settings and in knowing which glyphs and ids a one-file game really uses.
- General minifiers do not know which glyphs a one-file game can print or which SVG ids its script uses. These tools are small and conservative on purpose.

## Limits
- `pack.py` needs JavaScript and a 2023+ browser, decodes before first paint, and shows base64 in view-source; keep a normal copy for old browsers. A browser that can run scripts but lacks `DecompressionStream` is told so; one too old to read the loader shows a note after 8 seconds. While it unpacks, the page shows a small centered "Loading…" line on `--bg` (default dark `#101018`; text color follows the background; about 145 bytes more than the old plain white page). Unlike lzma-pack there is no `auto` mode that reads your page's own color: pass `--bg` to match a light or colored game. `--bg` takes a plain color (`#hex`, `rgb(...)`, `hsl(...)` or a name); anything else falls back to the default and says so. The line sits in an inline `style`, so a strict Content-Security-Policy that forbids inline styles shows plain white instead.
- `optfonts.py` only handles `@font-face` with `data:` base64 sources and single-quoted family names. It leaves the `data:font/ttf` type and any `format('truetype')` hint as they were while the bytes are now woff2 or woff; this works in the browsers tried, but other browsers are not checked.
- Glyph choice reads the page text. A character that only exists in data loaded later, built with `String.fromCharCode(...)` or computed in some other way is not seen: add it with `--extra`. A few JavaScript escapes such as `\d` look like CSS escapes; the worst result is one extra glyph.
- `optsvg.js` handles pictures written in the markup. Pictures a script builds from strings are not touched (on purpose).
- Always look at the result in a browser before shipping.

## For AI agents
- Run `python3 tools/single-file-tools/test/run.py` after any change; add a case there for every behavior you change.
- `optfonts.py` exposes `collect_chars(text, extra)` and `optimize(text, ...)` for tests; the command line is `main()`. Keep the `--format woff` option: it lets the checks run without brotli.
- Do not rename or merge SVG ids in `optsvg.js`; scripts and style rules point at them. Keep `<script>`, `<style>`, `<textarea>` and comments out of its reach.
- `pack.py` exposes `build_page(gzip_bytes, title, bg)`; it never raises on a bad `bg` (it falls back to `DEFAULT_BG`) and only the command line prints a note. The color goes into a style attribute, so keep it validated. The loader must stay plain ES5 so an old browser can at least read it and show a message. Keep the title escaped.
- Never remove the font copyright and license handling; the games ship these fonts.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
