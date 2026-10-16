# Provenance

All code in this repository was written for the games Apple Press and Fancy, the Banana by JNFoo with AI assistance (Claude, by Anthropic), then separated from the game and generalized. No third-party fonts or images are included. The only third-party source is the PPMd algorithm in `modules/ppmd-decode` and `tools/ppmd-pack`, a fresh JavaScript and Python port of the public-domain PPMd variant H code (Dmitry Shkarin, 2001; as cleaned up in 7-Zip and the LZMA SDK by Igor Pavlov, who placed it in the public domain). It was ported from those public-domain files only, not from unRAR or any GPL code.

Tools in `tools/single-file-tools`, `tools/lzma-pack`, `tools/ppmd-pack` and `tools/fuzz-kit` call out to separate open-source programs you install yourself (fontTools, brotli, zopfli, svgo, terser, esbuild, html-minifier-terser, Playwright, Puppeteer, Firefox). Those keep their own licenses and are not part of this repository.

Original games: https://github.com/JNFoo/apple-press and https://github.com/JNFoo/fancy-banana (the games themselves are not open source; only the code in this repository is MIT)

**Copyright holder and branding.** Copyright (c) 2026 LFC Foundry, MIT License (see LICENSE). Forged by LFC Foundry (https://github.com/JNFoo). While the code is open under the MIT License, the name "LFC Foundry" and associated project identities are reserved. If you fork, significantly modify, or commercially redistribute this software, you must change the external public product name and branding. When you copy a module into your own project, keep its MIT header as the rule above says.
