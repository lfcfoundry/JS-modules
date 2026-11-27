# core-plan

**Version 1.0.0 · API 1**

**Tested in:** ungoogled Chromium 156, Firefox 158 and WebKitGTK 2.52.6 (a 4-thread cloud machine), 2026-11-26.

## What it is and how it works

Decides how many helper workers a page should start, from what the device reports, and keeps a "last run" line so a page that crashed can say which step it was on. About 5 KB with comments.

- `navigator.hardwareConcurrency` counts logical threads. With 8 or more, about half are real cores on most laptops and desktops, so half are assumed.
- One core is kept free for the page itself.
- `navigator.deviceMemory` (Chromium-based browsers; missing in Firefox and Safari, where 4 GB is assumed) limits the count so the helpers use at most half of it.
- Never more than 8 helpers, and never more than 4 DuckDB threads, unless you raise the caps.

## Why it exists

Testers and modules here used to start one helper per logical thread, or a fixed 15. On a 4-core, 8-thread laptop a tester that started too many workers crashed Firefox. Every page now asks one small file for the plan, shows the same line about the device at the top, and puts it first in its copied results.

**Where it helps**

- Testers that sweep helper counts (1, 2, 4, ... up to the plan, never past it).
- Modules with a worker pool that need a safe default.
- Long tests that may crash a tab: the next load can say which step was running.

**Not for:** finding the true core count. Browsers do not report it. This is a safe guess, not a measurement.

## Use

```js
var p = LfcCorePlan.plan({ workerMB: 256 });     // memory one helper needs (default 256)
// p.workers: helpers to start; p.sweep: [1, 2, 4, ..., p.workers]; p.label: the line to show
document.getElementById('device').textContent = p.label;
// "This device reports 8 threads (about 4 real cores assumed) and 8 GB. Plan: 3 helpers (cores minus 1)."

LfcCorePlan.lastRun.step('Parquet, 4 helpers');  // before each risky step
LfcCorePlan.lastRun.done();                      // after the run
var note = LfcCorePlan.lastRun.previous();       // on load: "Last run did not finish. It stopped during: ..." or ''
```

## API

- `plan(opts)` returns `{ logical, cores, memGB, memKnown, workers, duckThreads, why, sweep, label }`.
  - `opts.workerMB` (default 256): memory one helper needs.
  - `opts.maxWorkers` (default 8): hard cap.
  - `opts.keepFree` (default 1): cores left for the page; 0 is allowed.
  - `opts.maxDuck` (default 4): DuckDB thread cap. When you pass it, the label names the DuckDB threads too.
  - `opts.env`: a `detect()` result to plan for another device (tests).
- `detect(nav)` returns `{ logical, cores, memGB, memKnown }` from `navigator` (or the object you pass). A missing or odd thread count counts as 4.
- `lastRun.step(name)`, `lastRun.done()`, `lastRun.previous()`, `lastRun.clear()`: one line in `sessionStorage`, which the browser clears with the tab. Nothing goes to `localStorage`. In a worker, or where storage is blocked, they quietly do nothing.
- `version` (`'1.0.0'`), `apiVersion` (1).

Global `LfcCorePlan` in a page or worker; `module.exports` in Node (where `plan()` with no `env` assumes 4 threads).

## How it compares

| | Threads it counts | Memory | Cap | Crash note |
|---|---|---|---|---|
| core-plan | logical, half assumed real from 8 up, minus 1 | at most half of `deviceMemory` (4 GB when unknown) | 8 | yes (`lastRun`) |
| `navigator.hardwareConcurrency` alone | logical | no | no | no |
| workerpool (npm) default | logical minus 1 | no | no | no |
| Node `os.availableParallelism()` | logical (Node only) | no | no | no |

The common default of "one helper per logical thread" doubles the helpers on a machine with hyper-threading, and each helper holds its own memory. Measured result on the cloud machine: not measured for speed. This file only picks the number.

## Limits

- Browsers do not say how many cores are real. Apple and phone chips without hyper-threading are planned at half their real cores from 8 threads up, which is safe but may leave speed unused.
- Chromium-based browsers round `deviceMemory` and cap it (8 in older versions; this Chromium 156 reported 16). Firefox and Safari do not report it.
- Firefox can be set to report fewer threads (privacy settings); the plan then follows what it reports.

## Tests

`node modules/core-plan/test/run.js` (1,809 checks: the rules on made-up devices from 1 to 256 threads and 0 to 8 GB, labels, Node with no storage). `node tests/core-plan-browser.js` with `CHROMIUM`, `FIREFOX` or `WEBKIT=1`: the plan reads the browser's own count, `lastRun` round-trips through `sessionStorage`, and the file runs inside a worker.

## For AI agents

Paste the file (or load it) before any code that starts workers, and size the pool with `plan().workers`. Show `plan().label` at the top of a tester and as the first line of its copied results. Call `lastRun.step()` before each step that may crash the tab and show `lastRun.previous()` on load. Do not start more helpers than `plan().workers` unless the user asks.

## Prior art and credits

No code is taken from elsewhere. The "keep one core for the page" default follows the common practice of worker pools such as workerpool (Apache-2.0, https://github.com/josdejong/workerpool), which defaults to the thread count minus one.
