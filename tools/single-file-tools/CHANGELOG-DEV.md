# single-file-tools developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-24

### Quick
Fonts with double-quoted family names are now shrunk too, and the packer can read your page's background color with --bg auto.

### Deep
Shipped in JS-modules PR 160 (merged 2026-10-24).
optfonts.py now handles @font-face rules whose font-family is written in double quotes (before, those fonts were skipped with no message and shipped at full size). pack.py accepts --bg auto, which reads the page's own background color the way lzma-pack does and falls back to the default dark color with a note when it finds none. Packer run time and size on a 1,743,600 byte script page (one run, Python, lower is better): --fast 1.8 s and 806,753 bytes, default 15 passes 3.4 s and 793,521 bytes, --best 60 passes 10.5 s and 793,417 bytes; the defaults are kept because 60 passes saves 0.013 percent for three times the time. Two new checks in the test file; the double-quote check fails without the fix.

## 1.1.0 · API 1 · 2026-10-16

### Quick
The packer can make files about 23% smaller to hand out and now defaults to a faster setting. More pictures are handled.

### Deep
Packer: `--encoding bytes` makes a file you hand out about 23 percent smaller (210 KB instead of 272 KB on a 1 MB test game; it works from a double-clicked file, not from a server that forces utf-8 such as GitHub Pages), and Zopfli now defaults to 15 passes, about 3 times faster than the old 60 (1.8 s instead of 5.4 s) for 30 bytes more output, with `--fast` (1.0 s) and `--best`. Pictures: ones with a style inside are now handled (the test game's two biggest pictures were skipped before, saving 45 bytes; now the step saves about 3.6 KB after compression), ones with a script inside or no end are left alone and listed, and `--report` shows the real size saved after compression. Fonts: `--report` lists characters a font lacks, `--costs` shows what each layout feature costs in bytes, and the font type label now says woff2. README has the measured numbers and says which packer to pick.

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
