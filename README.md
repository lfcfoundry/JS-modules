# JS-modules

Small, dependency-free pieces for single-file browser games, taken out of **[Apple Press](https://github.com/lfcfoundry/apple-press)** ([play it](https://lfcfoundry.github.io/apple-press/)) and **[Fancy, the Banana](https://github.com/lfcfoundry/fancy-banana)** ([play it](https://lfcfoundry.github.io/fancy-banana/)) and cleaned up so anyone, or any AI helper working with a human, can drop them into another project.

MIT License. Copyright (c) 2026 LFC Foundry. Use, change and sell anything built with it. Keeping the license line is the only ask.

Live demos: **https://lfcfoundry.github.io/JS-modules/**

## Pick a piece

Grouped by what a piece does. The live page, with demos and a quick finder, is **https://lfcfoundry.github.io/JS-modules/**.

### Games

#### Saving and data safety

Keep a player's progress safe and let them move it between devices.

| Module | One line | Global | Version |
|---|---|---|---|
| [save-kit](modules/save-kit/README.md) | Safe localStorage saves, backup slot, checksummed copy-paste save codes with a size limit on what a paste may unpack to. | `SaveKit` | 1.0.0 · API 1 |

#### Device and browser adaptation

Make a game behave on slow phones, privacy-focused browsers and power-saving screens.

| Module | One line | Global | Version |
|---|---|---|---|
| [env-probes](modules/env-probes/README.md) | Detects privacy modes that round timers (including Firefox's 16.67 ms clock), scramble canvas read-back or block storage, and says what it found in plain words. | `EnvProbes` | 1.1.0 · API 1 |
| [fx-governor](modules/fx-governor/README.md) | Steps visual effects down when the device cannot keep up; never back up behind the player. | `FxGovernor` | 1.1.0 · API 1 |
| [frame-kit](modules/frame-kit/README.md) | Frame pacing for canvas games: even-dt smooths the frame time, quality-governor steps effects down and back up, job-pump spreads heavy jobs across frames, frame-meter shows frames a second, hitches and tap delay in plain words. | `EvenDt`, `QualityGovernor`, `JobPump`, `FrameMeter` | 1.1.0 · API 1 |

#### Controls

Let players hold a button, or play with a gamepad.

| Module | One line | Global | Version |
|---|---|---|---|
| [hold-press](modules/hold-press/README.md) | Hold-to-repeat for buttons that survives Android Chrome pointercancel. | `HoldPress` | 1.0.0 · API 1 |
| [pad-nav](modules/pad-nav/README.md) | Gamepad API to DOM focus: move through buttons, menus, sliders and drop-downs with a controller, no game code. | `PadNav` | 1.0.0 · API 1 |
| [tab-guard](modules/tab-guard/README.md) | Keeps one open copy of a page in charge (Web Locks), so two tabs do not overwrite each other's saved data, and tells the game when the other copy closes. | `TabGuard` | 1.0.0 · API 1 |
| [wake-keeper](modules/wake-keeper/README.md) | Keeps the screen awake only while a game wants it: released on pause, hidden tab and idle, asked again when allowed. | `WakeKeeper` | 1.0.0 · API 1 |
| [back-close](modules/back-close/README.md) | Makes the phone back swipe or back button close the top panel instead of leaving the page (CloseWatcher, with an opt-in history fallback for browsers without it). | `BackClose` | 1.0.0 · API 1 |

#### Looks and effects

Curtains, flying elements, lettering and 3D-looking sprites, plus a written style guide.

| Module | One line | Global | Version |
|---|---|---|---|
| [stage-curtains](modules/stage-curtains/README.md) | Velvet stage curtains that slide shut over a page, then fly open. | `StageCurtains` | 1.0.0 · API 1 |
| [fly-to-mini](modules/fly-to-mini/README.md) | A big element scrolls away and a copy flies to its sticky mini version (and back). | `FlyToMini` | 1.2.0 · API 1 |
| [sticker-text](modules/sticker-text/README.md) | Die-cut sticker lettering in plain CSS text-shadow rings, no images. | `StickerText` | 1.0.0 · API 1 |
| [sprite-baker](modules/sprite-baker/README.md) | Tiny software 3D rasterizer that bakes shaded sprites to canvases once at load, or one frame per tick; also makes silhouette masks and packs sprite sheets. | `SpriteBaker` | 1.2.0 · API 1 |
| [cartoon-3d-kit](modules/cartoon-3d-kit/README.md) | A written style guide plus demo for the soft, glossy cartoon 3D look done in plain CSS and SVG. | none | 1.0.0 · API 1 |

#### Game math

The numbers behind idle and clicker games.

| Module | One line | Global | Version |
|---|---|---|---|
| [idle-core](modules/idle-core/README.md) | Tested maths for idle/clicker games: costs, buy-many and buy-max, milestones, away income, boost queue, number format. | `IdleCore` | 1.0.0 · API 1 |

#### Size and packaging

Unpack a smaller file inside the game. The tools that pack it are under Tools.

| Module | One line | Global | Version |
|---|---|---|---|
| [lzma-decode](modules/lzma-decode/README.md) | Small readable LZMA1 decoder (ES5), tested against Python's lzma. Browsers can only unpack gzip and deflate natively. | `lzmaDecode` | 1.0.0 · API 1 |
| [ppmd-decode](modules/ppmd-decode/README.md) | A PPMd (7-Zip PPMd7) decoder in one ES5 function, about 6.6 KB packed. It unpacks web-page data about 10% smaller than LZMA, but about 4 times slower. PPMd is by Dmitry Shkarin; the public-domain code it follows is Igor Pavlov's, from 7-Zip. | `ppmd7Decode` | 1.0.0 · API 1 |

#### Files, charts and simulation

Open zip and Excel files safely, draw flow charts, write animated GIFs and simulate random walkers.

| Module | One line | Global | Version |
|---|---|---|---|
| [gif-writer](modules/gif-writer/README.md) | Writes animated GIFs from canvas pictures with one shared palette, storing only the pixels that changed (about 6.8 times smaller than gifenc on a mostly still animation). | `GifWriter` | 1.0.0 · API 1 |
| [zip-open](modules/zip-open/README.md) | Opens .zip and Excel .xlsx files safely: limits counted on what really unpacks, so a zip bomb stops at the limit with a plain-words note. | `ZipOpen` | 1.0.0 · API 1 |
| [river-layout](modules/river-layout/README.md) | Lays out a flow chart (Sankey) from a plain list of links, with about half the weighted crossings of d3-sankey on the charts measured, backward links drawn instead of crashing, and an SVG drawer. | `RiverLayout` | 1.0.0 · API 1 |
| [walker-sim](modules/walker-sim/README.md) | Simulates random walkers on a network with seeded, repeatable runs, 16 random-number distributions, 95% ranges and the exact odds to check against (about 1.75 million walkers a second). | `WalkerSim` | 1.0.0 · API 1 |

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
| [lzma-pack](tools/lzma-pack/README.md) | Packs one HTML file into a smaller self-unpacking file with LZMA and a hash check (Python 3 standard library). | 1.0.0 · API 1 |
| [ppmd-pack](tools/ppmd-pack/README.md) | Packs one HTML file into a self-unpacking file with PPMd, the 7-Zip text compressor (PPMd by Dmitry Shkarin; public-domain code by Igor Pavlov, 7-Zip). Pure Python; pays off above about 60 KB of compressed data. | 1.0.0 · API 1 |
| [single-file-tools](tools/single-file-tools/README.md) | Font subsetting, safe inline-SVG tightening and a Zopfli self-extracting packer for one-file games. | 1.1.0 · API 1 |

**Testing.** Test a game by playing it at random, shrinking any failure to a short replay, and by counting what it draws.

| Tool | One line | Version |
|---|---|---|
| [fuzz-kit](tools/fuzz-kit/README.md) | Seeded, reproducible random-input fuzzer engine with weighted operations, invariants, liveness checks and failure shrinking; Playwright and Puppeteer runners with real input and CPU throttling; stock-Firefox recipe; test-hook stripper. | 1.1.0 · API 1 |
| [canvas-probe](tools/canvas-probe/README.md) | Test-build counter for canvas 2D games: calls per frame, save/restore leaks, overhanging drawImage sources, draws below half size, style-write repeats, painted area. | 1.1.0 · API 1 |
| [storage-probe](tools/storage-probe/README.md) | Page that tells you in plain words whether copies of a page saved in different folders share their saved data, see each other's writes and locks; one button, copyable report. | 1.1.0 · API 1 |
| [firefox-stand-in](tools/firefox-stand-in/README.md) | Runs a Playwright-for-Python test in stock Firefox (through Selenium and geckodriver) without rewriting it; says plainly which calls it supports and stops with a clear message on the rest. | 1.0.0 · API 1 |
| [webkit-driver](tools/webkit-driver/README.md) | Drives WebKitGTK or GNOME Web from Node with no dependencies, using the call names of Playwright and Puppeteer (goto, evaluate, waitForFunction, mouse, keyboard, screenshot, console errors), so a test written for them can also run in WebKit. | 1.0.0 · API 1 |

#### For the story editor

**Size and packaging.** Pack a finished story page into a smaller page.

| Package | One line |
|---|---|
| [zip-page](https://github.com/lfcfoundry/story-editor/blob/main/packages/zip-page/README.md) | Wrap a finished HTML page into a smaller page that unzips itself, with a pure-JS inflater fallback. |

**Testing.** Run tests on stock Firefox, generate random stories and keep two implementations in step.

| Package | One line |
|---|---|
| [qa-kit](https://github.com/lfcfoundry/story-editor/blob/main/packages/qa-kit/README.md) | Tiered test runner and a Playwright-style API over WebDriver BiDi for stock Firefox; seeded random-story generator. |
| [contract-kit](https://github.com/lfcfoundry/story-editor/blob/main/packages/contract-kit/README.md) | A guide and a small helper for keeping two implementations of one rule set from drifting apart: seeded random inputs, a side-by-side comparison, a field table and a time limit. |

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
CHROMIUM=/path/to/chrome node tests/run.js      # CHROMIUM optional if Playwright finds a browser (see Test browsers below)
npm run test:kits                               # gif-writer, zip-open, river-layout, walker-sim, frame-kit, sprite-baker, pad-nav, tab-guard, back-close, lzma, fuzz-kit, canvas-probe, storage-probe, firefox-stand-in, webkit-driver (needs python3 and Playwright for Python for the browser parts)
```

29 checks: maths and save logic in Node, the browser pieces (curtains, hold-press, fly-to-mini, probes, governor, sticker text) in Chromium. For humans and AI helpers: read [AGENTS.md](AGENTS.md), [llms.txt](llms.txt) and [modules.json](modules.json). What changed in each version: [CHANGELOG.md](CHANGELOG.md) (and a `CHANGELOG.md` in every module and tool folder).

### Test browsers

Browser checks run in **Firefox 158** (the stress test) and **ungoogled Chromium 155**, on Linux. Results in this repository's docs name the exact browser and version, for example "Firefox 158" or "Chromium 155 (ungoogled)". Older stand-ins (Chromium 141 and 153, Firefox 157) are retired; numbers in the docs that were measured on them still say so, and are not re-measured unless a change needs it. Rules for anyone running the tests:

- Run one browser at a time. Two at once make timing checks flaky.
- Point the test at the browser you installed: `CHROMIUM=/path/to/chrome` for the Chromium checks, `FIREFOX_PATH` (and `GECKODRIVER_PATH` for [firefox-stand-in](tools/firefox-stand-in/README.md)) for Firefox. A bare run that falls back to some other build gives unfair timing numbers, so say which one ran.
- Not covered yet: WebKit and Safari, and real phones (the Pixel and an iPhone). A passing desktop run is not a phone result.

## More from LFC Foundry

- [Apple Press](https://github.com/lfcfoundry/apple-press): a clicker game for kids ([play](https://lfcfoundry.github.io/apple-press/))
- [Story Editor](https://github.com/lfcfoundry/story-editor): an offline editor for branching stories, plus MIT packages cut from it: story format and checker, game builder and player, story map layout, a self-unzipping page packer, and a Firefox test kit ([try it](https://lfcfoundry.github.io/story-editor/))
- [Fancy Banana](https://github.com/lfcfoundry/fancy-banana): a one-tap flying-banana arcade game ([play](https://lfcfoundry.github.io/fancy-banana/))
- [Pineapple Defense](https://github.com/lfcfoundry/pineapple-defense): a flick-to-throw pineapples-at-penguins game that uses a few of these pieces ([play](https://lfcfoundry.github.io/pineapple-defense/))
- [JS-modules](https://github.com/lfcfoundry/JS-modules): this repository ([demos](https://lfcfoundry.github.io/JS-modules/))
