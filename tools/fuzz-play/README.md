# fuzz-play

A robot that plays your browser game badly on purpose, and checks the rules that must always hold. It found real bugs in Apple Press that hand testing missed (a stuck curtain, an auto-clicker showing the wrong numbers, flyers left over after a restart).

```
npm i playwright-core
CHROMIUM=/path/to/chrome node fuzz-play.js --url file:///path/game.html --actions ./examples/dom-actions.js --seconds 60 --seed 1
```
Options: `--viewport 412x800`, `--throttle 4` (CPU slowdown), `--init "localStorage.setItem('k','v')"`, `--check-every 5`. Exit code 1 when an invariant fails, a page error is thrown, or a stuck state lasts too long. The same seed repeats the same run.

Write an actions file for your game (see `examples/dom-actions.js`, which works on most click pages with no game code): `actions` (weighted random moves), `invariants(page)` (list of what is wrong, for example `count > total`, `NaN` in text), and optional `stuck(page)`.

**Firefox:** Playwright cannot drive stock Firefox, so `inpage.js` runs the same idea inside the page; inject it with `marionette-lite`.

## How it differs
Monkey-testing tools such as gremlins.js click randomly and watch for errors. This one is built around **your own invariants**, repeatable seeds, CPU throttling, and a "stuck" check, which is what catches the quiet bugs in games.

## fuzz-play or fuzz-kit?
Both run seeded random play against your invariants. [`fuzz-kit`](../fuzz-kit/README.md) is the more elaborate sibling.

| | fuzz-play | fuzz-kit |
|---|---|---|
| Shape | One ready-to-run robot (`fuzz-play.js`, Node + Playwright) plus `inpage.js` for Firefox | An engine (`fuzz-core.js`, runs in the page or in Node) plus Playwright (Python) and Puppeteer runners |
| Your input | An actions file: weighted moves and `invariants(page)` | An adapter: weighted ops, `invariants`, `before`, `liveness` |
| Stuck check | Reports a state that lasts too long | Liveness: from anywhere, ordinary input must lead somewhere, with nudges to try to get out |
| Replay | Same seed repeats the run | Same seed repeats the run, and `stopAt` stops on the exact failing operation; each failure carries the tail of operation names |
| Extras | CPU throttling, viewport, init script | Input helpers (junk saves, key and pointer events), `strip-test-hooks.js` to keep test code out of the shipped file |
| Size | About 6 KB of code | About 8 KB engine plus 7 KB of runners |

Start with `fuzz-play` for a quick look at a click-style page. Move to `fuzz-kit` when the game has real state to steer through, or when you want one source file for the tested page and the shipped page.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
