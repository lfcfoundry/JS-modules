# JS-modules

Small, dependency-free pieces for single-file browser games, taken out of **[Apple Press](https://github.com/JNFoo/apple-press)** ([play it](https://jnfoo.github.io/apple-press/)) and **[Fancy, the Banana](https://github.com/JNFoo/fancy-banana)** ([play it](https://jnfoo.github.io/fancy-banana/)) and cleaned up so anyone, or any AI helper working with a human, can drop them into another project.

MIT License. Copyright (c) 2026 JNFoo. Use, change and sell anything built with it. Keeping the license line is the only ask.

Live demos: **https://jnfoo.github.io/JS-modules/**

## Pick a piece

Grouped by what a piece does. The live page, with demos and a quick finder, is **https://jnfoo.github.io/JS-modules/**.

### Games

#### Saving and data safety

Keep a player's progress safe and let them move it between devices.

| Module | One line | Global |
|---|---|---|
| [save-kit](modules/save-kit/README.md) | Safe localStorage saves, backup slot, checksummed copy-paste save codes. | `SaveKit` |

#### Device and browser adaptation

Make a game behave on slow phones, privacy-focused browsers and power-saving screens.

| Module | One line | Global |
|---|---|---|
| [env-probes](modules/env-probes/README.md) | Detects privacy modes that round timers, scramble canvas read-back or block storage. | `EnvProbes` |
| [fx-governor](modules/fx-governor/README.md) | Steps visual effects down when the device cannot keep up; never back up behind the player. | `FxGovernor` |
| [frame-kit](modules/frame-kit/README.md) | Frame pacing for canvas games: even-dt smooths the frame time, quality-governor steps effects down and back up, job-pump spreads heavy jobs across frames, frame-meter shows frames a second, hitches and tap delay in plain words. | `EvenDt`, `QualityGovernor`, `JobPump`, `FrameMeter` |

#### Controls

Let players hold a button, or play with a gamepad.

| Module | One line | Global |
|---|---|---|
| [hold-press](modules/hold-press/README.md) | Hold-to-repeat for buttons that survives Android Chrome pointercancel. | `HoldPress` |
| [pad-nav](modules/pad-nav/README.md) | Gamepad API to DOM focus: move through buttons and menus with a controller, no game code. | `PadNav` |
| [tab-guard](modules/tab-guard/README.md) | Keeps one open copy of a page in charge (Web Locks), so two tabs do not overwrite each other's saved data. | `TabGuard` |
| [wake-keeper](modules/wake-keeper/README.md) | Keeps the screen awake only while a game wants it: released on pause, hidden tab and idle, asked again when allowed. | `WakeKeeper` |
| [back-close](modules/back-close/README.md) | Makes the phone back swipe or back button close the top panel instead of leaving the page (CloseWatcher). | `BackClose` |

#### Looks and effects

Curtains, flying elements, lettering and 3D-looking sprites, plus a written style guide.

| Module | One line | Global |
|---|---|---|
| [stage-curtains](modules/stage-curtains/README.md) | Velvet stage curtains that slide shut over a page, then fly open. | `StageCurtains` |
| [fly-to-mini](modules/fly-to-mini/README.md) | A big element scrolls away and a copy flies to its sticky mini version (and back). | `FlyToMini` |
| [sticker-text](modules/sticker-text/README.md) | Die-cut sticker lettering in plain CSS text-shadow rings, no images. | `StickerText` |
| [sprite-baker](modules/sprite-baker/README.md) | Tiny software 3D rasterizer that bakes shaded sprites to canvases once at load. | `SpriteBaker` |
| [cartoon-3d-kit](modules/cartoon-3d-kit/STYLE-GUIDE.md) | A written style guide plus demo for the soft, glossy cartoon 3D look done in plain CSS/SVG/canvas. | none |

#### Game math

The numbers behind idle and clicker games.

| Module | One line | Global |
|---|---|---|
| [idle-core](modules/idle-core/README.md) | Tested maths for idle/clicker games: costs, milestones, away income, boost queue, number format. | `IdleCore` |

#### Size and packaging

Unpack a smaller file inside the game. The tools that pack it are under Tools.

| Module | One line | Global |
|---|---|---|
| [lzma-decode](modules/lzma-decode/README.md) | Small readable LZMA1 decoder (ES5), tested against Python's lzma. Browsers can only unpack gzip and deflate natively. | `lzmaDecode` |

### Story editor

Packages for interactive stories. They live with the [Story Editor](https://github.com/JNFoo/p-see-story-editor) they are generated from, under `packages/`.

#### Story data

Create, clean and save stories in one shared file format.

| Package | One line |
|---|---|
| [story-format](https://github.com/JNFoo/p-see-story-editor/blob/main/packages/story-format/README.md) | Create, clean, import and export interactive stories as JSON, with a JSON Schema. |

#### Checking

Find dead ends and endings nobody can reach before a reader does.

| Package | One line |
|---|---|
| [story-check](https://github.com/JNFoo/p-see-story-editor/blob/main/packages/story-check/README.md) | Exact checker for branching stories with items, numbers and dice: dead ends and endings no player can reach. |

#### Drawing

See a story's shape: maps of its pages and simulated readers.

| Package | One line |
|---|---|
| [story-map](https://github.com/JNFoo/p-see-story-editor/blob/main/packages/story-map/README.md) | Layered, arc and matrix drawings of a story graph (SVG) and seeded simulated players. |

#### Playing and building

Turn a story into a game, or play it from code or a terminal.

| Package | One line |
|---|---|
| [story-player](https://github.com/JNFoo/p-see-story-editor/blob/main/packages/story-player/README.md) | Build one offline HTML game from a story, or play a story from code or a terminal. |

### Tools

For building and testing. Not shipped inside a game or story.

#### For games

**Size and packaging.** Pack a finished one-file game into a smaller file.

| Tool | One line |
|---|---|
| [lzma-pack](tools/lzma-pack/README.md) | Packs one HTML file into a smaller self-unpacking file with LZMA and a hash check (Python 3 standard library). |
| [single-file-tools](tools/single-file-tools/README.md) | Font subsetting, safe inline-SVG tightening and a Zopfli self-extracting packer for one-file games. |

**Testing.** Test a game by playing it at random, or by driving Firefox from a script.

| Tool | One line |
|---|---|
| [fuzz-play](tools/fuzz-play/README.md) | Random-play robot with invariants (Playwright), plus an in-page version for Firefox. |
| [fuzz-kit](tools/fuzz-kit/README.md) | Seeded, reproducible random-input fuzzer engine with weighted operations, invariants and liveness checks; Playwright and Puppeteer runners; test-hook stripper. |
| [canvas-probe](tools/canvas-probe/README.md) | Test-build counter for canvas 2D games: calls per frame, save/restore leaks, overhanging drawImage sources, draws below half size, style-write repeats, painted area. |
| [storage-probe](tools/storage-probe/README.md) | Page that tells you in plain words whether copies of a page saved in different folders share their saved data, see each other's writes and locks; one button, copyable report. |
| [marionette-lite](tools/marionette-lite/README.md) | Drive Firefox from Python with the standard library only. |

#### For the story editor

**Size and packaging.** Pack a finished story page into a smaller page.

| Package | One line |
|---|---|
| [zip-page](https://github.com/JNFoo/p-see-story-editor/blob/main/packages/zip-page/README.md) | Wrap a finished HTML page into a smaller page that unzips itself, with a pure-JS inflater fallback. |

**Testing.** Run tests on stock Firefox and generate random stories.

| Package | One line |
|---|---|
| [qa-kit](https://github.com/JNFoo/p-see-story-editor/blob/main/packages/qa-kit/README.md) | Tiered test runner and a Playwright-style API over WebDriver BiDi for stock Firefox; seeded random-story generator. |

**Working with an AI helper.** A written process for a person and an AI assistant building software together.

| Package | One line |
|---|---|
| [ai-collab-kit](https://github.com/JNFoo/p-see-story-editor/blob/main/packages/ai-collab-kit/README.md) | A written process and templates for a person and an AI assistant building software together. |

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
CHROMIUM=/path/to/chrome node tests/run.js      # CHROMIUM optional if Playwright finds a browser
npm run test:kits                               # frame-kit, sprite-baker, pad-nav, tab-guard, back-close, lzma, fuzz-kit, canvas-probe, storage-probe (needs python3 and Playwright for Python for the browser parts)
```

27 checks: maths and save logic in Node, the browser pieces (curtains, hold-press, fly-to-mini, probes, governor, sticker text) in Chromium. For humans and AI helpers: read [AGENTS.md](AGENTS.md), [llms.txt](llms.txt) and [modules.json](modules.json).

## More from JNFoo

- [Apple Press](https://github.com/JNFoo/apple-press): a clicker game for kids ([play](https://jnfoo.github.io/apple-press/))
- [Story Editor](https://github.com/JNFoo/p-see-story-editor): an offline editor for branching stories, plus MIT packages cut from it: story format and checker, game builder and player, story map layout, a self-unzipping page packer, and a Firefox test kit ([try it](https://jnfoo.github.io/p-see-story-editor/))
- [Fancy Banana](https://github.com/JNFoo/fancy-banana): a one-tap flying-banana arcade game ([play](https://jnfoo.github.io/fancy-banana/))
- [Pineapple Defense](https://github.com/JNFoo/pineapple-defense): a flick-to-throw pineapples-at-penguins game that uses a few of these pieces ([play](https://jnfoo.github.io/pineapple-defense/))
- [JS-modules](https://github.com/JNFoo/JS-modules): this repository ([demos](https://jnfoo.github.io/JS-modules/))
