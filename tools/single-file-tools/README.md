# single-file-tools

Shrinking a game that is one HTML file with fonts and pictures inside it. These are the steps used for Apple Press, each optional (`build-example.sh` runs them all).

| Tool | Does | Needs |
|---|---|---|
| `optfonts.py in.html out.html` | cuts every base64 `@font-face` down to the characters the file can actually show (typed, `\uXXXX`, `&entity;`), keeps kerning, ligatures and tabular digits, re-embeds as woff2. `--extra "ñé"` for text loaded later | `pip install fonttools brotli` |
| `optsvg.js in.html out.html` | tightens inline `<svg>` with svgo, **without** merging, moving or renaming anything a style rule or script could point at | `npm i svgo` |
| `pack.py in.html out.html "Title"` | Zopfli-squeezes the page into a tiny self-extracting page that unpacks with the browser's own `DecompressionStream` | `pip install zopfli` |
| `build-example.sh game.html` | the whole pipeline in order | the above plus terser, html-minifier-terser |

## Trade-offs
`pack.py` needs JavaScript and a 2023+ browser, decodes before first paint, and shows base64 in view-source; keep a normal copy for old browsers. `optfonts.py` only handles `@font-face` with `data:` base64 sources and single-quoted family names. Always look at the result in a browser before shipping.

## How it differs
General minifiers do not know which glyphs a one-file game can print or which SVG ids its script uses. These are small and conservative on purpose.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
