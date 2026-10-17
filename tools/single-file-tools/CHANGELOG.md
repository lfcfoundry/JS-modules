# single-file-tools changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16
Packer: `--encoding bytes` makes a file you hand out about 23 percent smaller (210 KB instead of 272 KB on a 1 MB test game; it works from a double-clicked file, not from a server that forces utf-8 such as GitHub Pages), and Zopfli now defaults to 15 passes, about 3 times faster than the old 60 (1.8 s instead of 5.4 s) for 30 bytes more output, with `--fast` (1.0 s) and `--best`. Pictures: ones with a style inside are now handled (the test game's two biggest pictures were skipped before, saving 45 bytes; now the step saves about 3.6 KB after compression), ones with a script inside or no end are left alone and listed, and `--report` shows the real size saved after compression. Fonts: `--report` lists characters a font lacks, `--costs` shows what each layout feature costs in bytes, and the font type label now says woff2. README has the measured numbers and says which packer to pick.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- Early October 2026: First version: font subsetting, safe inline-SVG tightening and a Zopfli self-extracting packer.
- 2026-10-15: Font license notices are kept, CSS escapes are read correctly, and tests were added.
- 2026-10-15: The Zopfli packer shows a "Loading..." page (`--bg`) instead of a white one.
