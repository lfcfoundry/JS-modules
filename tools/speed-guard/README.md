# speed-guard

**Version 1.0.0 · API 1**

**Tested in:** ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web 46.5 (it reads their rows; it runs no browser)

## What it is and how it works

A one-command speed check for a release. It runs nothing, so it costs no browser time.

- It reads the speed-history files.
- It compares each step's newest release with the one before.
- It lists steps that got more than about 5% slower, and which browser checks to re-run.

## Why it exists

Any slowdown over about 5% needs the owner's OK, and checking that by eye across browsers and steps is slow and error-prone.

**Where it helps**

- Release checks before merging.
- Spotting slowdowns early.
- Re-running only the checks a change affects.

**Not for:** trends over many releases; it compares the last two.

## Use
```
python3 tools/speed-guard/speed-guard.py                       # all products
python3 tools/speed-guard/speed-guard.py --product js-modules  # one product
python3 tools/speed-guard/speed-guard.py --limit 5 --floor 1   # slower-than percent, and the whole-millisecond tie width
python3 tools/speed-guard/speed-guard.py --ok accepted.tsv     # slowdowns the owner accepted: release <TAB> part of the test text
python3 tools/speed-guard/speed-guard.py --plan [BASE]         # the browser checks the changed files affect, and the command to run only those
```
- **Order of work:** `--plan`, run the checks it names in the four browsers, add the new rows to the speed history, then run the guard. It exits 1 when any step is SLOWER, so it can gate a merge.
- **Where the files are:** `--history DIR`, or `$SPEED_HISTORY`, else `/mnt/project-files/speed-history`.
- **Ties:** a step whose values differ by 1 ms or less is a tie, because Firefox and WebKit read whole milliseconds (`--floor`).
- **Steps with one release** are not compared.

## How it compares

| Alternative | What it does | Why it does not fit this job |
|---|---|---|
| Lighthouse CI | Tracks audit scores over time | Built for served pages and its own scores, not our per-browser speed rows |
| github-action-benchmark | Compares benchmark results in CI | Tied to GitHub Actions; our rows come from real-device runs |
| **speed-guard** | Reads the speed-history rows, compares them direction-aware against the 5% rule and lists which browser checks a change affects | Only as good as the rows added at each release |

This is a feature comparison from each project's public documentation. No speed comparison was measured.

## Limits
- It trusts the rows. The same `test` and `browser` text must be used at every release, as the speed-history rules already say, or the steps are not matched.
- It compares the newest release with the one before it, not a trend.
- `--plan` uses the same picker as `tests/kits.js --changed`; a changed file no check knows about is listed with the checks that watch it, which may be none.

Test it: `python3 tools/speed-guard/test/run.py` (9 checks).
