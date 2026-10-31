# test-runner

**Version 1.3.0 · API 1**

**Tested in:** Node unit tests; calibrate in Firefox 158, Chromium 155, WebKitGTK 2.52.6

## What it is and how it works

The shared helpers every browser check here needs, in one folder. Node only.

- Starts the test browsers once and keeps them open.
- Runs fair head-to-head timing, skips builds whose inputs did not change, and proves a WebAssembly path matches its JavaScript twin.
- Catches drawings that changed by accident and names the commit that broke something.

## Why it exists

Each check was rewriting the same server, browser launch, fair-turn timing and tables, and starting a browser cost seconds on every run. One place makes checks shorter to write and quicker to run.

**Where it helps**

- Cross-browser checks for modules and games.
- Speed comparisons that are fair to both sides.
- Faster test loops with warm browsers.

**Not for:** checks that need a blank profile unless you ask for a cold launch.

## Quick start
```js
const T = require('./tools/test-runner/runner.js');
T.main(async (b, which, outFile) => {                // node my-check.js chromium|firefox|webkit [out.json]; line 1 prints the real browser version
  const page = await b.newPage(); await page.goto('http://127.0.0.1:1234/page.html');
  const ms = await T.rotate(['js', 'wasm'], 5, (name) => page.evaluate((n) => run(n), name));   // takes turns, drops the warm-up round, returns the medians
  console.log(T.table(T.speedGuard([{ name: 'job', before: ms.js, after: ms.wasm }]), [{ key: 'name', title: 'job', align: 'left' }, { key: 'ratio', title: 'times faster' }, { key: 'verdict', title: 'speed guard', align: 'left' }]));
  return !T.speedGuard([{ before: ms.js, after: ms.wasm }])[0].slower;       // false = exit 1
});
```
Keep the browsers open between runs:
```
node tools/test-runner/cli.js warm start            # all three (or name some); about the same time as one cold start of each, once
node tools/test-runner/cli.js warm status           # which are warm and their versions
node tools/test-runner/cli.js warm stop
node tools/test-runner/cli.js all tests/my-check.js # the same check in the three browsers, one at a time, one summary table
```
Long runs and machine restarts: the test machine can restart without warning and every process is lost, while files on disk survive. So `all` keeps a **ledger** and a **heartbeat** (`ledger.js`, state in `.cache/test-runner/ledger/`, or `TEST_RUNNER_LEDGER`):
```
node tools/test-runner/cli.js all tests/my-check.js       # a cell = (build, browser, check file + arguments); each finished cell is written to disk
node tools/test-runner/cli.js all tests/my-check.js       # after a crash or restart: the same command skips the browsers that already passed and continues
node tools/test-runner/cli.js all --fresh tests/my-check.js    # run everything again
node tools/test-runner/cli.js status [tests/my-check.js]  # ALIVE, FINISHED or DEAD (also: all --status ...)
```
The build is `TEST_RUNNER_BUILD` when set, otherwise a fingerprint of the commit plus every uncommitted change, so an edited file runs everything again. A failed cell always runs again. The heartbeat file records the process id, the machine's boot id and the time (every cell and every 5 s); `status` says DEAD with the reason when the boot id changed (the machine restarted) or the process is gone without a finish mark, and exits 0 for ALIVE or a clean FINISHED, 1 for FINISHED with failing cells and 2 for DEAD. A reminder that lives outside the machine (a scheduled self-reminder) should run `status` first.

A check written with `T.launch` / `T.main` takes a warm browser when there is one and starts a new one when there is not; line 1 says `(warm)` when it took one. Only one check uses a browser at a time (a lock file; a second one waits, and says so if it gives up), because two pages in one browser at once make timings flaky.

## API
`runner.js`: `launch(which, { cold, lock, lockWaitMs })` gives `{ version(), newPage(), close(), warm }` · `main(fn)` · `serve(routes)` (a local page server; routes map a path to text, bytes or a function) · `pageResult(b, url, key)` (a fresh page, waits for `window[key]`) · `rotate(names, reps, run)` · `median(list)` · `speedGuard(rows, limit)` (more than 5% slower is flagged; the owner's rule) · `guarded(b, which, fn, opts)` (the noise guard: calibrates first, reruns `fn` while the machine is more than 15% off its quiet baseline, `ok: false` when every try was noisy; save the baseline once with `node tools/test-runner/cli.js calibrate --save` on a quiet machine) · `calibrate(b, ms)` · · `table(rows, columns)` · `warmInfo(which)` · `lock(which)` · `asText(fn)`.

`twin.js`: `same(a, b)` compares by bits (0 and -0 differ, NaN equals NaN; typed arrays, arrays and objects item by item) · `twin(cases, jsSide, wasmSide)` gives `{ tried, differing, names }` · `twinSource` is the same code as text for a page.

`stamp.js`: `node tools/test-runner/stamp.js build [--force|--list] [id...]` rebuilds the wasm of every module whose `wasm/` sources changed (build.sh then embed.py) and skips the rest; `stamp.js run <name> --in <paths> [--out <files>] -- <command...>` does the same for any command. Stamps are kept in `.cache/test-runner/`.

`fingerprint.js`: `gate(name, browser, version)`, `.check(label, hash)`, `.finish()` and `pageHash(selector)` (runs in the page: a 64-bit fingerprint of a canvas's pixels). Near matches (the owner's 99.5% rule): `await g.checkPixels(label, hash, () => page.evaluate(F.pagePixels, selector))` passes a picture when 99.5% of its pixels or more are identical to the stored ones and prints the exact percentage (`NEAR closed 99.833% identical`); the pixels are fetched only when the hash differs. `gate(..., { threshold })` or `FINGERPRINT_THRESHOLD` changes the 99.5 (100 = exact). The stored pixels are gzipped files next to the baseline in `tests/fingerprints/<name>/`. Data results still have to be byte-identical; this is for drawings. Baselines live in `tests/fingerprints/<name>.json`, per browser and version; `FINGERPRINT_UPDATE=1` accepts the pictures as they are.

`bisect.js`: `node tools/test-runner/bisect.js <good> <bad> -- <command...>` names the first bad commit by halving, in a throwaway copy of the files (exit code 125 = this commit cannot be tested).

## How it compares
| | test-runner | Playwright Test / Vitest browser mode | hand-written scaffolding per check |
|---|---|---|---|
| Needs a package install | `puppeteer-core` only | large | the same |
| Drives WebKitGTK | yes, through `tools/webkit-driver` | WebKit builds only | only where copied |
| Keeps browsers open between runs | yes (`warm`) | its own server mode | no |
| Fair timing helper (turn-taking, warm-up dropped) | yes | no | each one different |
| WebAssembly-versus-JavaScript equality helper | yes (`twin`) | no | each one different |

## Prior art and credits
Written for this repository (LFC Foundry, MIT). It drives browsers through [puppeteer-core](https://github.com/puppeteer/puppeteer) (Apache-2.0) and `tools/webkit-driver`. The halving search in `bisect.js` is the idea behind `git bisect`, run in a git worktree so a check can use its own files; the fingerprint hash is two 32-bit FNV-1a-style hashes, not a cryptographic one.

## Limits
- A warm browser keeps state between checks (cookies, caches); every check opens a fresh page, but a check that depends on a blank profile should use `launch(which, { cold: true })`.
- One client per browser at a time; the lock is a file in the temp folder and ends with the process, and a dead owner is ignored.
- The warm folder is `$TMPDIR/test-runner-warm` (`TEST_RUNNER_WARM` changes it); a machine restart clears it. The ledger and heartbeat live in `.cache/test-runner/ledger/` on disk and survive a restart; they know only the cells run through `cli.js all`, and a check that dies half way through one browser starts that browser again.
- `pageHash` reads a canvas; a page that draws with CSS or the DOM needs a screenshot hash of your own.
- Fingerprints differ between browsers and between versions by design, so the baseline is kept per browser and version; a new version records itself instead of failing.
- The stamp only knows files you name as inputs; a build that reads something else (a compiler version, an environment variable) needs `--force` after that changes.
- Timing numbers still come from the real browsers one at a time; Node here only runs the pass or fail checks.

## For AI agents
Use `T.main` and `T.launch` in any new browser check instead of copying a launch block; start `warm start` once at the beginning of a session; use `T.rotate` for any two-way timing, and `T.speedGuard` before you ask for a merge. For a WebAssembly module, `twin` is the equality check; `stamp.js build` rebuilds only what changed. Read the browsers branch README of the knowledge base before the first run.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
