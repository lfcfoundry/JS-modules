# JS-modules

Small, dependency-free pieces for single-file browser games, taken out of **[Apple Press](https://github.com/lfcfoundry/apple-press)** ([play it](https://lfcfoundry.github.io/apple-press/)) and **[Fancy, the Banana](https://github.com/lfcfoundry/fancy-banana)** ([play it](https://lfcfoundry.github.io/fancy-banana/)) and cleaned up so anyone, or any AI helper working with a human, can drop them into another project.

MIT License. Copyright (c) 2026 LFC Foundry. Use, change and sell anything built with it. Keeping the license line is the only ask.

Live demos: **https://lfcfoundry.github.io/JS-modules/**

<!-- glance:start (written by tools/versions/versions.py) -->
## All at a glance

Every piece in one place. Numbers are gzipped KB (smaller is better); the tables below give the readable size, the version and what each piece does.

**Modules (26)**

- Saving and data safety: [save-kit](modules/save-kit/README.md) 9.1
- Device and browser adaptation: [env-probes](modules/env-probes/README.md) 5.4, [fx-governor](modules/fx-governor/README.md) 2.5, [frame-kit](modules/frame-kit/README.md) 12.1, [slow-note](modules/slow-note/README.md) 3.7
- Controls: [hold-press](modules/hold-press/README.md) 4.1, [pad-nav](modules/pad-nav/README.md) 9.6, [tab-guard](modules/tab-guard/README.md) 3.4, [wake-keeper](modules/wake-keeper/README.md) 2.7, [back-close](modules/back-close/README.md) 3.1
- First visit and grown-ups: [grown-ups-door](modules/grown-ups-door/README.md) 5.1, [spotlight-tour](modules/spotlight-tour/README.md) 4.7
- Looks and effects: [stage-curtains](modules/stage-curtains/README.md) 10.3, [fly-to-mini](modules/fly-to-mini/README.md) 6.3, [sticker-text](modules/sticker-text/README.md) 2.1, [sprite-baker](modules/sprite-baker/README.md) 17.9, [cartoon-3d-kit](modules/cartoon-3d-kit/README.md)
- Game math: [idle-core](modules/idle-core/README.md) 7.7
- Size and packaging: [lzma-decode](modules/lzma-decode/README.md) 3.6, [ppmd-decode](modules/ppmd-decode/README.md) 7.8
- Files, charts and simulation: [gif-writer](modules/gif-writer/README.md) 7.3, [zip-open](modules/zip-open/README.md) 9.3, [memory-compression](modules/memory-compression/README.md) 83.5, [netflow-sankey](modules/netflow-sankey/README.md) 11.3, [netflow-layers](modules/netflow-layers/README.md) 9.1, [walker-sim](modules/walker-sim/README.md) 18.8

**Story editor packages (7)**

- Story data: [story-format](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-format/README.md), [twine-import](https://github.com/lfcfoundry/story-editor/blob/main/packages/twine-import/README.md), [story-outline](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-outline/README.md), [story-diff](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-diff/README.md)
- Checking: [story-check](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-check/README.md)
- Drawing: [story-map](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-map/README.md)
- Playing and building: [story-player](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-player/README.md)

**Tools (14)**

- For games: [lzma-pack](tools/lzma-pack/README.md), [ppmd-pack](tools/ppmd-pack/README.md), [single-file-tools](tools/single-file-tools/README.md), [fuzz-kit](tools/fuzz-kit/README.md), [canvas-probe](tools/canvas-probe/README.md), [storage-probe](tools/storage-probe/README.md), [firefox-stand-in](tools/firefox-stand-in/README.md), [test-isolation](tools/test-isolation/README.md), [speed-lab](tools/speed-lab/README.md), [webkit-driver](tools/webkit-driver/README.md)
- For the story editor: [zip-page](https://github.com/lfcfoundry/story-editor/blob/main/packages/zip-page/README.md), [qa-kit](https://github.com/lfcfoundry/story-editor/blob/main/packages/qa-kit/README.md), [contract-kit](https://github.com/lfcfoundry/story-editor/blob/main/packages/contract-kit/README.md), [ai-collab-kit](https://github.com/lfcfoundry/story-editor/blob/main/packages/ai-collab-kit/README.md)

<!-- glance:end -->

## Pick a piece

Grouped by what a piece does. The live page, with demos and a quick finder, is **https://lfcfoundry.github.io/JS-modules/**.

**Size** in the module tables is the file as it sits in this repository (readable, with comments) and the same file gzipped, the way a web server sends it. `frame-kit` counts its four pieces together, and `cartoon-3d-kit` is a style guide with no script. Each module's README gives its minified size and any lean build. The column is filled in by `python3 tools/versions/versions.py sizes`.

### Games

#### Saving and data safety

Keep a player's progress safe and let them move it between devices.

| Module | Size | One line | Global | Version |
|---|---|---|---|---|
| [save-kit](modules/save-kit/README.md) | 26.5 KB · 9.1 KB gz | Safe localStorage saves, backup slot, checksummed copy-paste save codes with a size limit on what a paste may unpack to. | `SaveKit` | 1.2.1 · API 1 |

#### Device and browser adaptation

Make a game behave on slow phones, privacy-focused browsers and power-saving screens.

| Module | Size | One line | Global | Version |
|---|---|---|---|---|
| [env-probes](modules/env-probes/README.md) | 16.2 KB · 5.4 KB gz | Detects privacy modes that round timers (including Firefox's 16.67 ms clock), scramble canvas read-back or block storage, and says what it found in plain words. | `EnvProbes` | 1.1.0 · API 1 |
| [fx-governor](modules/fx-governor/README.md) | 6.2 KB · 2.5 KB gz | Steps visual effects down when the device cannot keep up; never back up behind the player. | `FxGovernor` | 1.1.1 · API 1 |
| [frame-kit](modules/frame-kit/README.md) | 38.9 KB · 12.1 KB gz | Frame pacing for canvas games: even-dt smooths the frame time, quality-governor steps effects down and back up, job-pump spreads heavy jobs across frames, frame-meter shows frames a second, hitches and tap delay in plain words. | `EvenDt`, `QualityGovernor`, `JobPump`, `FrameMeter` | 1.2.1 · API 1 |
| [slow-note](modules/slow-note/README.md) | 9.7 KB · 3.7 KB gz | Keeps a short note, only on the device, of the errors, slow taps and long frames a page had; copyable as plain text, nothing is sent anywhere. | `SlowNote` | 1.0.0 · API 1 |

#### Controls

Let players hold a button, or play with a gamepad.

| Module | Size | One line | Global | Version |
|---|---|---|---|---|
| [hold-press](modules/hold-press/README.md) | 13.0 KB · 4.1 KB gz | Hold-to-repeat for buttons that survives Android Chrome pointercancel. | `HoldPress` | 1.1.0 · API 1 |
| [pad-nav](modules/pad-nav/README.md) | 29.2 KB · 9.6 KB gz | Gamepad API to DOM focus: move through buttons, menus, sliders and drop-downs with a controller, no game code. | `PadNav` | 1.1.0 · API 1 |
| [tab-guard](modules/tab-guard/README.md) | 9.6 KB · 3.4 KB gz | Keeps one open copy of a page in charge (Web Locks), so two tabs do not overwrite each other's saved data, and tells the game when the other copy closes. | `TabGuard` | 1.1.0 · API 1 |
| [wake-keeper](modules/wake-keeper/README.md) | 8.2 KB · 2.7 KB gz | Keeps the screen awake only while a game wants it: released on pause, hidden tab and idle, asked again when allowed. | `WakeKeeper` | 1.1.0 · API 1 |
| [back-close](modules/back-close/README.md) | 9.1 KB · 3.1 KB gz | Makes the phone back swipe or back button close the top panel instead of leaving the page (CloseWatcher, with an opt-in history fallback for browsers without it). | `BackClose` | 1.2.0 · API 1 |

#### First visit and grown-ups

Show a new player around, and keep small children away from the buttons that matter.

| Module | Size | One line | Global | Version |
|---|---|---|---|---|
| [grown-ups-door](modules/grown-ups-door/README.md) | 14.8 KB · 5.1 KB gz | A hold-then-drag task a young child will not finish, in front of the buttons and links a grown-up should press (a speed bump, not security). | `GrownUpsDoor` | 1.0.0 · API 1 |
| [spotlight-tour](modules/spotlight-tour/README.md) | 12.3 KB · 4.7 KB gz | A first-time tour: one dimmed layer, a bright window over the current part, Skip and Back, remembers who saw it and gives a finishing gift once. | `SpotlightTour` | 1.1.0 · API 1 |

#### Looks and effects

Curtains, flying elements, lettering and 3D-looking sprites, plus a written style guide.

| Module | Size | One line | Global | Version |
|---|---|---|---|---|
| [stage-curtains](modules/stage-curtains/README.md) | 29.8 KB · 10.3 KB gz | Velvet stage curtains that slide shut over a page, then fly open. | `StageCurtains` | 1.1.0 · API 1 |
| [fly-to-mini](modules/fly-to-mini/README.md) | 18.1 KB · 6.3 KB gz | A big element scrolls away and a copy flies to its sticky mini version (and back). | `FlyToMini` | 1.2.0 · API 1 |
| [sticker-text](modules/sticker-text/README.md) | 5.0 KB · 2.1 KB gz | Die-cut sticker lettering in plain CSS text-shadow rings, no images. | `StickerText` | 1.1.0 · API 1 |
| [sprite-baker](modules/sprite-baker/README.md) | 54.5 KB · 17.9 KB gz | Tiny software 3D rasterizer that bakes shaded sprites to canvases once at load, or one frame per tick; also makes silhouette masks and packs sprite sheets. | `SpriteBaker` | 1.5.0 · API 1 |
| [cartoon-3d-kit](modules/cartoon-3d-kit/README.md) | n/a | A written style guide plus demo for the soft, glossy cartoon 3D look done in plain CSS and SVG. | none | 1.2.0 · API 1 |

#### Game math

The numbers behind idle and clicker games.

| Module | Size | One line | Global | Version |
|---|---|---|---|---|
| [idle-core](modules/idle-core/README.md) | 22.8 KB · 7.7 KB gz | Tested maths for idle/clicker games: costs, buy-many and buy-max, milestones, away income, boost queue, number format. | `IdleCore` | 1.2.0 · API 1 |

#### Size and packaging

Unpack a smaller file inside the game. The tools that pack it are under Tools.

| Module | Size | One line | Global | Version |
|---|---|---|---|---|
| [lzma-decode](modules/lzma-decode/README.md) | 9.3 KB · 3.6 KB gz | Small readable LZMA1 decoder (ES5), tested against Python's lzma. Browsers can only unpack gzip and deflate natively. | `lzmaDecode` | 1.1.0 · API 1 |
| [ppmd-decode](modules/ppmd-decode/README.md) | 25.6 KB · 7.8 KB gz | A PPMd (7-Zip PPMd7) decoder in one ES5 function, about 6.6 KB packed. It unpacks web-page data about 10% smaller than LZMA, but about 4 times slower. PPMd is by Dmitry Shkarin; the public-domain code it follows is Igor Pavlov's, from 7-Zip. | `ppmd7Decode` | 1.1.0 · API 1 |

#### Files, charts and simulation

Open zip and Excel files safely, draw flow charts, write animated GIFs and simulate random walkers.

| Module | Size | One line | Global | Version |
|---|---|---|---|---|
| [gif-writer](modules/gif-writer/README.md) | 20.3 KB · 7.3 KB gz | Writes animated GIFs from canvas pictures with one shared palette, storing only the pixels that changed (about 6.8 times smaller than gifenc on a mostly still animation). | `GifWriter` | 1.1.0 · API 1 |
| [zip-open](modules/zip-open/README.md) | 26.8 KB · 9.3 KB gz | Opens .zip and Excel .xlsx files safely: limits counted on what really unpacks, so a zip bomb stops at the limit with a plain-words note. | `ZipOpen` | 1.1.0 · API 1 |
| [memory-compression](modules/memory-compression/README.md) | 270.0 KB · 83.5 KB gz | Keeps big data packed in memory and brings it back exactly, in one file with one pack/unpack: bytes and typed arrays (a 120 MB scene shrinks to 52%, 41% in small mode, and restores in about 175 ms, against 525 ms with lz4js and 1.2 s with fflate) and big lists of plain JavaScript objects (300,000 link objects shrink to 14% of their JSON text, 35% for msgpackr with records). Picks the right layer by itself; MemoryCompressionJSO stays as an alias. | `MemoryCompression` | 2.0.0 · API 2 |
| [netflow-sankey](modules/netflow-sankey/README.md) | 33.3 KB · 11.3 KB gz | Lays out a flow chart (Sankey) from a plain list of links, with about half the weighted crossings of d3-sankey on the charts measured, backward links drawn instead of crashing, and an SVG drawer. | `NetflowSankey` | 2.0.0 · API 2 |
| [netflow-layers](modules/netflow-layers/README.md) | 28.2 KB · 9.1 KB gz | Lays out a graph in rows (top to bottom or left to right) with story order, tags instead of very long links, a column for the pages every route passes, and tall maps cut into columns; 20,000-page maps draw in about 0.4 s. | `NetflowLayers` | 1.2.0 · API 1 |
| [walker-sim](modules/walker-sim/README.md) | 59.8 KB · 18.8 KB gz | Simulates random walkers on a network with seeded, repeatable runs, 16 random-number distributions, 95% ranges and the exact odds to check against (about 6 million walkers a second). | `WalkerSim` | 2.1.0 · API 2 |

### Story editor

Packages for interactive stories. They live with the [Story Editor](https://github.com/lfcfoundry/story-editor) they are generated from, under `packages/`.

#### Story data

Create, clean, import and save stories in one shared file format.

| Package | One line |
|---|---|
| [story-format](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-format/README.md) | Create, clean, search, import and export interactive stories as JSON, with a JSON Schema. Twine import lives in twine-import. |
| [twine-import](https://github.com/lfcfoundry/story-editor/blob/main/packages/twine-import/README.md) | Reads Twine stories (Twine 2 HTML, Twee 3, Twine 1) and turns SugarCube and Harlowe code into rules, with a plain-words report. |
| [story-outline](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-outline/README.md) | Turns an indented outline into pages and choices, or into a whole branching story. |
| [story-diff](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-diff/README.md) | Says in plain words what one edit did to a story, such as "Add page “The Cellar”". |

#### Checking

Find dead ends and endings nobody can reach before a reader does.

| Package | One line |
|---|---|
| [story-check](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-check/README.md) | Exact checker for branching stories with items, numbers and dice: dead ends and endings no player can reach. |

#### Drawing

See a story's shape: maps of its pages and simulated readers.

| Package | One line |
|---|---|
| [story-map](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-map/README.md) | Layered, arc and matrix drawings of a story graph (SVG) and seeded simulated players. |

#### Playing and building

Turn a story into a game, or play it from code or a terminal.

| Package | One line |
|---|---|
| [story-player](https://github.com/lfcfoundry/story-editor/blob/main/packages/story-player/README.md) | Build one offline HTML game from a story, or play a story from code or a terminal. |

### Tools

For building and testing. Not shipped inside a game or story.

#### For games

**Size and packaging.** Pack a finished one-file game into a smaller file.

| Tool | One line | Version |
|---|---|---|
| [lzma-pack](tools/lzma-pack/README.md) | Packs one HTML file into a smaller self-unpacking file with LZMA and a hash check (Python 3 standard library). | 1.1.2 · API 1 |
| [ppmd-pack](tools/ppmd-pack/README.md) | Packs one HTML file into a self-unpacking file with PPMd, the 7-Zip text compressor (PPMd by Dmitry Shkarin; public-domain code by Igor Pavlov, 7-Zip). Pure Python; pays off above about 60 KB of compressed data. | 1.1.1 · API 1 |
| [single-file-tools](tools/single-file-tools/README.md) | Font subsetting, safe inline-SVG tightening and a Zopfli self-extracting packer for one-file games. | 1.1.0 · API 1 |

**Testing.** Test a game by playing it at random, shrinking any failure to a short replay, and by counting what it draws.

| Tool | One line | Version |
|---|---|---|
| [fuzz-kit](tools/fuzz-kit/README.md) | Seeded, reproducible random-input fuzzer engine with weighted operations, invariants, liveness checks and failure shrinking; Playwright and Puppeteer runners with real input and CPU throttling; stock-Firefox recipe; test-hook stripper. | 1.1.0 · API 1 |
| [canvas-probe](tools/canvas-probe/README.md) | Test-build counter for canvas 2D games: calls per frame, save/restore leaks, overhanging drawImage sources, draws below half size, style-write repeats, painted area. | 1.1.0 · API 1 |
| [storage-probe](tools/storage-probe/README.md) | Page that tells you in plain words whether copies of a page saved in different folders share their saved data, see each other's writes and locks; one button, copyable report. | 1.1.0 · API 1 |
| [firefox-stand-in](tools/firefox-stand-in/README.md) | Runs a Playwright-for-Python test in stock Firefox (through Selenium and geckodriver) without rewriting it; says plainly which calls it supports and stops with a clear message on the rest. | 1.0.0 · API 1 |
| [test-isolation](tools/test-isolation/README.md) | Puts a prefix in front of every localStorage key on a test page, so a speed test or random-play run never touches the real saved game. | 1.1.0 · API 1 |
| [speed-lab](tools/speed-lab/README.md) | One-button speed test run on the device: compares your page with parts switched off, keeps the scene in view and uncovered, and says the answer in plain sentences with a copyable table. | 1.1.1 · API 1 |
| [webkit-driver](tools/webkit-driver/README.md) | Drives WebKitGTK or GNOME Web from Node with no dependencies, using the call names of Playwright and Puppeteer (goto, evaluate, waitForFunction, mouse, keyboard, screenshot, console errors), so a test written for them can also run in WebKit. | 1.2.0 · API 1 |

#### For the story editor

**Size and packaging.** Pack a finished story page into a smaller page.

| Package | One line |
|---|---|
| [zip-page](https://github.com/lfcfoundry/story-editor/blob/main/packages/zip-page/README.md) | Wrap a finished HTML page into a smaller page that unzips itself, with a pure-JS inflater fallback. |

**Testing.** Run tests on stock Firefox, generate random stories and keep two implementations in step.

| Package | One line |
|---|---|
| [qa-kit](https://github.com/lfcfoundry/story-editor/blob/main/packages/qa-kit/README.md) | Tiered test runner and a Playwright-style API over WebDriver BiDi for stock Firefox; seeded random-story generator. |
| [contract-kit](https://github.com/lfcfoundry/story-editor/blob/main/packages/contract-kit/README.md) | A guide and a helper (about 7.2 KB minified) for keeping two implementations of one rule set from drifting apart: seeded random inputs, a side-by-side comparison (also for async functions), shrinking a failing input to a small one, a field table and a time limit; runs in browsers too. |

**Working with an AI helper.** A written process for a person and an AI assistant building software together.

| Package | One line |
|---|---|
| [ai-collab-kit](https://github.com/lfcfoundry/story-editor/blob/main/packages/ai-collab-kit/README.md) | A written process and templates for a person and an AI assistant building software together. |

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

**Every module and tool says which browsers its release was tested in.** The newest release's list is the **Tested in** line near the top of its README; each release's list is the **Tested in** line in its `CHANGELOG.md` entry. A line names each browser with its version, says "not recorded" where the old records do not show it, and says what was not run. Older builds (Chromium 141 and 153, Firefox 155 and 157) were stand-ins before this rule; entries that were tested on them still say so, and are not re-measured unless a change needs it. `versions.py set ... --tested "..."` writes the line; see [tools/versions/README.md](tools/versions/README.md).

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
