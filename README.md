# JS-modules

Small, dependency-free pieces for single-file browser games, taken out of **[Apple Press](https://github.com/lfcfoundry/apple-press)** ([play it](https://lfcfoundry.github.io/apple-press/)) and **[Fancy, the Banana](https://github.com/lfcfoundry/fancy-banana)** ([play it](https://lfcfoundry.github.io/fancy-banana/)) and cleaned up so anyone, or any AI helper working with a human, can drop them into another project.

MIT License. Copyright (c) 2026 LFC Foundry. Use, change and sell anything built with it. Keeping the license line is the only ask.

Live demos: **https://lfcfoundry.github.io/JS-modules/**

<!-- glance:start (written by tools/versions/versions.py) -->
## All at a glance

Every piece in one place, by name. The tables below give the version, the sizes (readable and gzipped) and what each piece does.

**Modules & Tools (42)**

- Device and browser adaptation: [env-probes](modules/env-probes/README.md), [field-report](modules/field-report/README.md), [frame-kit](modules/frame-kit/README.md), [fx-governor](modules/fx-governor/README.md), [image-decode](modules/image-decode/README.md), [slow-note](modules/slow-note/README.md)
- Saving and data safety: [save-kit](modules/save-kit/README.md), [tab-guard](modules/tab-guard/README.md)
- Games - Looks and effects: [cartoon-3d-kit](modules/cartoon-3d-kit/README.md), [fly-to-mini](modules/fly-to-mini/README.md), [sprite-baker](modules/sprite-baker/README.md), [stage-curtains](modules/stage-curtains/README.md), [sticker-text](modules/sticker-text/README.md)
- Games - Controls: [back-close](modules/back-close/README.md), [hold-press](modules/hold-press/README.md), [pad-nav](modules/pad-nav/README.md), [wake-keeper](modules/wake-keeper/README.md)
- Games - Assist: [grown-ups-door](modules/grown-ups-door/README.md), [spotlight-tour](modules/spotlight-tour/README.md)
- Games - Math: [idle-core](modules/idle-core/README.md)
- Games - Testing: [canvas-probe](tools/canvas-probe/README.md), [firefox-stand-in](tools/firefox-stand-in/README.md), [fuzz-kit](tools/fuzz-kit/README.md), [speed-guard](tools/speed-guard/README.md), [speed-lab](tools/speed-lab/README.md), [storage-probe](tools/storage-probe/README.md), [test-isolation](tools/test-isolation/README.md), [test-runner](tools/test-runner/README.md), [webkit-driver](tools/webkit-driver/README.md)
- App - Efficiency: [memory-compression](modules/memory-compression/README.md), [single-file-tools](tools/single-file-tools/README.md)
- Model simulation: [walker-sim](modules/walker-sim/README.md)
- Visualization: [gif-writer](modules/gif-writer/README.md), [netflow-engine](modules/netflow-engine/README.md), [netflow-layers](modules/netflow-layers/README.md), [netflow-sankey](modules/netflow-sankey/README.md)
- Size and packaging: [lzma-decode](modules/lzma-decode/README.md), [lzma-pack](tools/lzma-pack/README.md), [pcodec-js](modules/pcodec-js/README.md), [ppmd-decode](modules/ppmd-decode/README.md), [ppmd-pack](tools/ppmd-pack/README.md), [zip-open](modules/zip-open/README.md)

**Story editor packages (10)**

- Story data: [story-diff](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-diff/README.md), [story-format](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-format/README.md), [story-outline](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-outline/README.md), [twine-import](https://github.com/lfcfoundry/story-editor/blob/main/packages/twine-import/README.md)
- Story validation: [story-check](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-check/README.md)
- Story flow: [story-map](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-map/README.md)
- Story build and distribute: [story-player](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-player/README.md)
- Story packaging: [zip-page](https://github.com/lfcfoundry/story-editor/blob/main/packages/zip-page/README.md)
- Story testing: [contract-kit](https://github.com/lfcfoundry/story-editor/blob/main/packages/contract-kit/README.md), [qa-kit](https://github.com/lfcfoundry/story-editor/blob/main/packages/qa-kit/README.md)

**AI knowledge base (1)**

- Working with an AI helper: [ai-collab-kit](https://github.com/lfcfoundry/story-editor/blob/main/packages/ai-collab-kit/README.md)

<!-- glance:end -->

<!-- tables:start (written by tools/versions/versions.py; edit modules.json, not this) -->
## Pick a piece

Grouped by what a piece does. The live page, with demos and a quick finder, is **https://lfcfoundry.github.io/JS-modules/**.

**How to read the tables.** *Version* is the label of the newest release; its first number is the API number, so the same first number means a drop-in copy. *Size* is the file as it sits in the repository (readable, with comments); *Gzipped* is that file compressed. A piece marked *(tool)* is for building and testing: it is not shipped inside a game or story. Story Editor packages are measured on their built `global` file. Every table has the same columns. Minified sizes and lean builds are in each piece's own README. Written by `python3 tools/versions/versions.py sizes`.
Every piece has a size.

### Modules & Tools (42)

#### Device and browser adaptation

Make a game behave on slow phones, privacy-focused browsers and power-saving screens.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [env-probes](modules/env-probes/README.md) | 1.1.0 | 16.2 | 5.4 | Detects privacy modes that blur timers, scramble canvas reads or block storage. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/env-probes/demo.html) |
| [field-report](modules/field-report/README.md) | 1.0.2 | 21.3 | 7.6 | Hidden buttons that save a speed report and an error log from a real device. No network. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/field-report/demo.html) |
| [frame-kit](modules/frame-kit/README.md) | 1.2.1 | 38.9 | 12.1 | Frame pacing for canvas games: smooth frame time, effect governor, job pump, frame meter. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/frame-kit/demo.html) |
| [fx-governor](modules/fx-governor/README.md) | 1.1.1 | 6.2 | 2.5 | Steps visual effects down when the device cannot keep up; never back up mid-play. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/fx-governor/demo.html) |
| [image-decode](modules/image-decode/README.md) | 1.2.0 | 20.6 | 7.2 | Loads pictures with no freeze at first draw, the right way per browser, plus WebP/AVIF checks. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/image-decode/demo.html) |
| [slow-note](modules/slow-note/README.md) | 1.0.0 | 9.7 | 3.7 | A short private note of errors, slow taps and long frames, copyable as text. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/slow-note/demo.html) |

#### Saving and data safety

Keep a player's progress safe and let them move it between devices.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [save-kit](modules/save-kit/README.md) | 1.2.1 | 26.5 | 9.1 | Safe saves in localStorage: backup slot, checksums, copy-paste save codes. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/save-kit/demo.html) |
| [tab-guard](modules/tab-guard/README.md) | 1.1.0 | 9.6 | 3.4 | Keeps one tab in charge so two tabs never overwrite each other's saves. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/tab-guard/demo.html) |

#### Games - Looks and effects

Curtains, flying elements, lettering and 3D-looking sprites.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [cartoon-3d-kit](modules/cartoon-3d-kit/README.md) | 1.2.0 | 49.3 | 20.2 | A written style guide and demo for the soft, glossy cartoon 3D look in CSS and SVG. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/cartoon-3d-kit/demo.html) |
| [fly-to-mini](modules/fly-to-mini/README.md) | 1.2.0 | 18.1 | 6.3 | A big element scrolls away and a copy flies to its sticky mini version. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/fly-to-mini/demo.html) |
| [sprite-baker](modules/sprite-baker/README.md) | 1.7.0 | 54.5 | 17.9 | Tiny software 3D rasterizer that bakes shaded sprites to canvases. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/sprite-baker/demo.html) |
| [stage-curtains](modules/stage-curtains/README.md) | 1.3.0 | 42.4 | 14.9 | Velvet stage curtains that slide shut over a page and fly open. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/stage-curtains/demo.html) |
| [sticker-text](modules/sticker-text/README.md) | 1.1.0 | 5.0 | 2.1 | Die-cut sticker lettering in plain CSS, no images. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/sticker-text/demo.html) |

#### Games - Controls

Let players hold a button, or play with a gamepad.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [back-close](modules/back-close/README.md) | 1.2.0 | 9.1 | 3.1 | Makes the phone's back swipe close the top panel instead of leaving the page. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/back-close/demo.html) |
| [hold-press](modules/hold-press/README.md) | 1.1.0 | 13.0 | 4.1 | Hold-to-repeat buttons that survive Android Chrome's pointercancel. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/hold-press/demo.html) |
| [pad-nav](modules/pad-nav/README.md) | 1.1.0 | 29.2 | 9.6 | Gamepad to focus: move through buttons, menus and sliders with a controller. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/pad-nav/demo.html) |
| [wake-keeper](modules/wake-keeper/README.md) | 1.1.0 | 8.2 | 2.7 | Keeps the screen awake only while a game wants it. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/wake-keeper/demo.html) |

#### Games - Assist

Show a new player around, and keep small children away from the buttons that matter.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [grown-ups-door](modules/grown-ups-door/README.md) | 1.0.0 | 14.8 | 5.1 | A hold-and-drag task a young child will not finish, in front of grown-up buttons. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/grown-ups-door/demo.html) |
| [spotlight-tour](modules/spotlight-tour/README.md) | 1.1.0 | 12.3 | 4.7 | A first-visit tour: dimmed page, bright window, Skip and Back, remembers who saw it. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/spotlight-tour/demo.html) |

#### Games - Math

The numbers behind idle and clicker games.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [idle-core](modules/idle-core/README.md) | 1.2.0 | 22.8 | 7.7 | Tested maths for idle and clicker games: costs, buy-max, away income, number format. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/idle-core/demo.html) |

#### Games - Testing

Test a game by playing it at random, shrinking any failure to a short replay, counting what it draws and driving real browsers.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [canvas-probe](tools/canvas-probe/README.md) *(tool)* | 1.1.0 | 28.8 | 8.8 | Test-build counter for canvas 2D games: calls per frame, leaks, repeated style writes. | — |
| [firefox-stand-in](tools/firefox-stand-in/README.md) *(tool)* | 1.0.0 | 11.0 | 4.0 | Runs a Playwright-for-Python test in stock Firefox without rewriting it. | — |
| [fuzz-kit](tools/fuzz-kit/README.md) *(tool)* | 1.3.2 | 80.2 | 26.1 | Seeded random-input fuzzer for games, with failure shrinking and browser runners. | — |
| [speed-guard](tools/speed-guard/README.md) *(tool)* | 1.0.0 | 7.4 | 2.9 | Flags speed-history steps over 5% slower than the last release; lists the browser checks to re-run. | — |
| [speed-lab](tools/speed-lab/README.md) *(tool)* | 1.1.1 | 20.5 | 7.4 | A one-button speed test on the device: switches parts off and says what costs time. | [Demo](https://lfcfoundry.github.io/JS-modules/tools/speed-lab/demo.html) |
| [storage-probe](tools/storage-probe/README.md) *(tool)* | 1.1.0 | 19.4 | 7.2 | A one-button page that says whether copies of a page share their saved data. | [Demo](https://lfcfoundry.github.io/JS-modules/tools/storage-probe/storage-probe.html) |
| [test-isolation](tools/test-isolation/README.md) *(tool)* | 1.1.0 | 6.5 | 2.4 | Prefixes every localStorage key on a test page so tests never touch the real save. | — |
| [test-runner](tools/test-runner/README.md) *(tool)* | 1.1.0 | 38.6 | 13.2 | Warm browsers, fair timing, skipped rebuilds, wasm-vs-JS twin test, picture gate and bisect. | — |
| [webkit-driver](tools/webkit-driver/README.md) *(tool)* | 1.4.0 | 23.6 | 8.6 | Drives WebKitGTK or GNOME Web from Node with Playwright-style calls, no dependencies. | — |

#### App - Efficiency

Keep a one-file app small and light: smaller data in memory, smaller pages on the wire.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [memory-compression](modules/memory-compression/README.md) | 2.3.4 | 313.3 | 96.2 | Keeps big arrays, bytes and lists of objects packed in memory and brings them back exactly. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/memory-compression/demo.html) |
| [single-file-tools](tools/single-file-tools/README.md) *(tool)* | 1.1.0 | 27.5 | 10.4 | Font subsetting, safe inline-SVG tightening and a Zopfli self-extracting packer. | — |

#### Model simulation

Simulate random walkers over a graph.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [walker-sim](modules/walker-sim/README.md) | 2.3.0 | 66.3 | 21.4 | Simulates random walkers on a network: seeded runs, 95% ranges, exact odds. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/walker-sim/demo.html) |

#### Visualization

Draw maps, flow charts and animated pictures from data.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [gif-writer](modules/gif-writer/README.md) | 1.3.0 | 41.1 | 16.2 | Writes animated GIFs from canvas frames with one shared palette. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/gif-writer/demo.html) |
| [netflow-engine](modules/netflow-engine/README.md) | 2.2.2 | 205.2 | 64.2 | Netflow Map's engine as an adaptable module: nine views, network layouts, add-on hand-over. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/netflow-engine/demo.html) |
| [netflow-layers](modules/netflow-layers/README.md) | 1.3.1 | 32.8 | 10.5 | Lays out a graph in rows, with tags for long links and tall maps cut into columns. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/netflow-layers/demo.html) |
| [netflow-sankey](modules/netflow-sankey/README.md) | 2.3.0 | 48.2 | 17.3 | Lays out a Sankey flow chart from a list of links, with an SVG drawer. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/netflow-sankey/demo.html) |

#### Size and packaging

Open zip and Excel files safely, and pack a finished page into a smaller file that unpacks itself.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [lzma-decode](modules/lzma-decode/README.md) | 1.3.0 | 22.2 | 8.7 | LZMA decoder: WebAssembly first, small readable JavaScript fallback; tested against Python's lzma. | [Demo](https://lfcfoundry.github.io/JS-modules/tools/lzma-pack/example/packed-base64.html) |
| [lzma-pack](tools/lzma-pack/README.md) *(tool)* | 2.0.0 | 27.7 | 10.6 | Packs one HTML file into a smaller self-unpacking file with LZMA (Python 3). | — |
| [pcodec-js](modules/pcodec-js/README.md) | 1.5.1 | 188.8 | 73.3 | Pcodec number compression for web pages: unpack, and optionally pack, big lists of numbers. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/pcodec-js/demo.html) |
| [ppmd-decode](modules/ppmd-decode/README.md) | 1.3.0 | 45.3 | 16.3 | A PPMd (7-Zip PPMd7) decoder: WebAssembly first, JavaScript fallback; smaller than LZMA. | [Demo](https://lfcfoundry.github.io/JS-modules/tools/ppmd-pack/example/packed-base64.html) |
| [ppmd-pack](tools/ppmd-pack/README.md) *(tool)* | 2.0.0 | 47.8 | 14.6 | Packs one HTML file into a self-unpacking file with PPMd (pure Python). | — |
| [zip-open](modules/zip-open/README.md) | 1.3.0 | 32.1 | 11.2 | Opens .zip and .xlsx files safely, with limits counted on what really unpacks. | [Demo](https://lfcfoundry.github.io/JS-modules/modules/zip-open/demo.html) |

### Story editor packages (10)

Packages for interactive stories. They live with the [Story Editor](https://github.com/lfcfoundry/story-editor) they are generated from, under `packages/`.

#### Story data

Create, clean, import and save stories in one shared file format.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [story-diff](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-diff/README.md) | 1.0.0 | 6.1 | 2.0 | Says in plain words what one edit did to a story. | — |
| [story-format](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-format/README.md) | 2.0.0 | 49.4 | 14.0 | Create, clean, search, import and export interactive stories as JSON, with a schema. | — |
| [story-outline](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-outline/README.md) | 1.0.0 | 25.7 | 7.9 | Turns an indented outline into pages and choices, or a whole branching story. | — |
| [twine-import](https://github.com/lfcfoundry/story-editor/blob/main/packages/twine-import/README.md) | 1.0.0 | 93.4 | 25.0 | Reads Twine stories (Twine 2 HTML, Twee 3, Twine 1) and turns their code into rules. | — |

#### Story validation

Find dead ends and endings nobody can reach before a reader does.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [story-check](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-check/README.md) | 1.0.0 | 72.0 | 20.0 | Exact checker for branching stories: dead ends and endings no player can reach. | — |

#### Story flow

See a story's shape: maps of its pages and simulated readers.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [story-map](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-map/README.md) | 1.0.0 | 60.0 | 17.8 | Layered, arc and matrix drawings of a story graph, plus simulated players. | — |

#### Story build and distribute

Turn a story into a game, or play it from code or a terminal.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [story-player](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-player/README.md) | 1.0.1 | 73.3 | 24.2 | Builds one offline HTML game from a story, or plays a story from code or a terminal. | — |

#### Story packaging

Pack a finished story page into a smaller page.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [zip-page](https://github.com/lfcfoundry/story-editor/blob/main/packages/zip-page/README.md) | 1.0.0 | 6.5 | 2.7 | Shrinks a finished HTML page into a self-unzipping page. | — |

#### Story testing

Run tests on stock Firefox, generate random stories and keep two implementations in step.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [contract-kit](https://github.com/lfcfoundry/story-editor/blob/main/packages/contract-kit/README.md) | 1.1.0 | 16.3 | 5.7 | Keeps two implementations of one rule set in step: random inputs, side-by-side comparison. | — |
| [qa-kit](https://github.com/lfcfoundry/story-editor/blob/main/packages/qa-kit/README.md) | 0.2.1 | 93.1 | 30.3 | Tiered test runner and Playwright-style API for stock Firefox, plus a random-story generator. | — |

### AI knowledge base (1)

#### Working with an AI helper

A written process for a person and an AI assistant building software together.

| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |
|---|---|---:|---:|---|---|
| [ai-collab-kit](https://github.com/lfcfoundry/story-editor/blob/main/packages/ai-collab-kit/README.md) | — | 13.8 | 6.3 | A written process and templates for a person and an AI assistant building software together. | — |
<!-- tables:end -->

## How to use a module

Every module is **no dependencies** and, apart from `frame-kit` (four small files, each usable alone), **one file**, and works two ways:

```html
<script src="modules/save-kit/save-kit.js"></script>
<script>var kit = SaveKit.create({ key: 'mygame', schema: { score: 'num' } });</script>
```

```js
const SaveKit = require('./modules/save-kit/save-kit.js');   // Node / bundlers
```

Copy just the file you need. Each folder has a README (what it does, how it differs from what already exists, limits) and a `demo.html` you can open straight from disk.

## Why these and not others

Only parts that are **not already well covered by open source** were kept. Large general libraries (animation, audio, physics, fuzzers, test runners) are not repeated here. What is here are the small, specific fixes learned by shipping one real game to phones and desktops: a curtain half stuck out of place on Android, a hold that dies on `pointercancel`, a save that was overwritten by a `NaN`, Firefox privacy mode rounding the clock to 100 ms. Each module README names the closest existing project and says how this one differs.

## Not included, on purpose

The games' own art, characters, text, sounds and secret content stay in Apple Press and Fancy, the Banana and are not licensed here. `cartoon-3d-kit` teaches the technique with a generic blob character instead.

## Tests

```
npm i playwright-core
CHROMIUM=/path/to/chrome node tests/run.js      # CHROMIUM is required: the browser tests refuse to run without it and print the real Chromium version (see Test browsers below)
npm run test:kits                               # slow-note, spotlight-tour, speed-lab, test-isolation, gif-writer, zip-open, memory-compression, netflow-sankey, walker-sim, frame-kit, sprite-baker, pad-nav, tab-guard, back-close, lzma, fuzz-kit, canvas-probe, storage-probe, firefox-stand-in, webkit-driver (needs python3 and Playwright for Python for the browser parts)
```

29 checks: maths and save logic in Node, the browser pieces (curtains, hold-press, fly-to-mini, probes, governor, sticker text) in Chromium. For humans and AI helpers: read [AGENTS.md](AGENTS.md), [llms.txt](llms.txt) and [modules.json](modules.json). What changed in each version: [CHANGELOG.md](CHANGELOG.md) (and a `CHANGELOG.md` in every module and tool folder).

### Test browsers

Browser checks run only in the browsers kept on the `browsers` branch of the private knowledge-base repository: **Firefox 158** (the stress test), **ungoogled Chromium 155** and **WebKitGTK 2.52.6** (GNOME Web 46.5), on Linux. The branch can change (a version updated, a browser added or removed), so read its README before each run and use what it says then. Every result in this repository's docs names the exact browser and version, for example "Firefox 158" or "Chromium 155 (ungoogled)".

**Every module and tool says which browsers its release was tested in.** The newest release's list is the **Tested in** line near the top of its README; each release's list is the **Tested in** line in its full changelog entry, which the maintainers keep privately (the repo's `CHANGELOG.md` files are the short end-user versions). A line names each browser with its version, says "not recorded" where the old records do not show it, and says what was not run. Older builds (Chromium 141 and 153, Firefox 155 and 157) were stand-ins before this rule; entries that were tested on them still say so, and are not re-measured unless a change needs it. `versions.py set ... --tested "..."` writes the line; see [tools/versions/README.md](tools/versions/README.md).

Rules for anyone running the tests:

- Run one browser at a time. Two at once make timing checks flaky.
- Point the test at the browser you installed: `CHROMIUM=/path/to/chrome` for the Chromium checks, `FIREFOX_PATH` (and `GECKODRIVER_PATH` for [firefox-stand-in](tools/firefox-stand-in/README.md)) for Firefox. A bare run that falls back to some other build gives unfair timing numbers, so say which one ran.
- WebKitGTK and GNOME Web can only be driven through WebDriver (Playwright and Puppeteer cannot); the recipe is in the branch README.
- Not covered yet: Safari itself, and real phones (the Pixel and an iPhone). A passing desktop run is not a phone result.

## More from LFC Foundry

- [Apple Press](https://github.com/lfcfoundry/apple-press): a clicker game for kids ([play](https://lfcfoundry.github.io/apple-press/))
- [Story Editor](https://github.com/lfcfoundry/story-editor): an offline editor for branching stories, plus MIT packages cut from it: story format and checker, game builder and player, story map layout, a self-unzipping page packer, and a Firefox test kit ([try it](https://lfcfoundry.github.io/story-editor/))
- [Fancy Banana](https://github.com/lfcfoundry/fancy-banana): a one-tap flying-banana arcade game ([play](https://lfcfoundry.github.io/fancy-banana/))
- [Pineapple Defense](https://github.com/lfcfoundry/pineapple-defense): a flick-to-throw pineapples-at-penguins game that uses a few of these pieces ([play](https://lfcfoundry.github.io/pineapple-defense/))
- [JS-modules](https://github.com/lfcfoundry/JS-modules): this repository ([demos](https://lfcfoundry.github.io/JS-modules/))
