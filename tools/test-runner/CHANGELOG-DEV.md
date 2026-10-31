# test-runner developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.4.0 · API 1 · 2026-10-31

### Quick
abSequential(timeA, timeB, opts) stops once the 90% interval of the median ratio is clear of 5%; verdicts slower/ok/faster/inconclusive.

### Details
Copied from qa-guide/ab-sequential/ab-sequential.js 1.0.0 (approved by the owner 2026-10-31 1:58 PM Eastern). Paired rounds with alternating order, seeded bootstrap 90% interval of the median ratio, minRounds 4, maxRounds 16, noisy when MAD sigma > 0.15. Old rule false-flags 23-36% on noisy machines, new 0.3-8.5% (QA-SPEEDUP-AUDIT-2026.10.31.md section 2).

### Deep
ab.js: early-stop A/B timing rule.

## 1.3.0 · API 1 · 2026-10-25

### Quick
Noise guard: a fixed calibration loop that stops timings on a noisy machine.

### Deep
Shipped in JS-modules PR 173.
Adds the noise guard (noise.js): calibrate(), judge(), guarded(), and cli.js calibrate [--save]. A fixed 1.5 s calibration of three parts (an integer loop, JSON parse and stringify of a fixed blob, typed-array copies; recorded apart, any one off marks the batch noisy) is compared with a saved quiet baseline per browser; more than 15% off marks the batch noisy and it is rerun (3 tries, 20 s apart) instead of published.

## 1.2.1 · API 1 · 2026-10-24

### Quick
GNOME Web is out of the default list: a full run is now three browsers, not four.

### Deep
Shipped in JS-modules PR 161 (merged 2026-10-24).
Following the 2026-10-24 rule that GNOME Web is no longer a test browser: test-runner's browser list, warm start and all-browser run use Chromium, Firefox and WebKitGTK only; usage lines in about 30 check files under tests/ no longer offer epiphany. A full run therefore starts three browsers instead of four (README figures: WebKitGTK check about 5 s, GNOME Web about 8 s; not re-timed). tools/webkit-driver and fuzz-kit still accept epiphany if someone names it; older results that name GNOME Web are kept as measured.

## 1.2.0 · API 1 · 2026-10-24

### Quick
Long runs survive a machine restart: cli.js all skips the browsers that already passed for this build, a heartbeat file records the boot id, and cli.js status says ALIVE, FINISHED or DEAD.

### Deep
test-runner 1.2.0 makes long test runs resumable and checkable after a machine restart (the test machine can restart without warning and every process is lost; files on disk survive). New tools/test-runner/ledger.js. (1) Ledger: cli.js all writes one small file per (build, suite, browser) cell under .cache/test-runner/ledger/ (TEST_RUNNER_LEDGER or TEST_RUNNER_CACHE change the place) when the cell ends; the build is TEST_RUNNER_BUILD or a 12-digit fingerprint of the commit plus every uncommitted change, the suite is the check file plus its arguments. A rerun of the same command skips the cells that passed or were skipped for this build and runs the rest; a failed cell always runs again; --fresh runs all. The summary table marks kept cells (pass (kept)) and the output of a fresh run is the same as before. (2) Heartbeat: heartbeat-<suite>.json holds the process id, the machine's boot id (/proc/sys/kernel/random/boot_id), the browser now running, every cell so far and the time, rewritten at each cell and every 5 s while a check runs (the check now runs through an asynchronous spawn so the beat continues; its output is printed at the end as before). (3) cli.js status [check.js [args]] (also all --status) prints ALIVE, FINISHED or DEAD per suite with the cells done: DEAD names the reason, the machine restarted (boot id changed) or the process is gone without a finish mark (a killed process nobody collected, state Z, counts as gone); exit 0 for ALIVE or a clean FINISHED, 1 for FINISHED with failing cells, 2 for DEAD. Checks: 25 Node checks pass (two new: resume, redo of a failed cell, --fresh, new build, other arguments; ALIVE, restart, crash). The check files and the browsers were not changed. Also adds .cache/ to .gitignore (the stamp cache was already documented as git-ignored).

## 1.1.0 · API 1 · 2026-10-18

### Quick
The picture gate now passes a picture that is 99.5% identical or better and prints the exact percentage; exact matches still count as same.

### Deep
fingerprint.js: new checkPixels(label, hash, getPixels) and pagePixels(selector). A drawing that differs from the stored one passes when 99.5% of its pixels or more are identical (the owner's rule, 2026-10-19; threshold from gate(..., { threshold }) or FINGERPRINT_THRESHOLD; 100 means exact), and the exact percentage is printed. The pixels are fetched only when the hash differs, and stored gzipped under tests/fingerprints/<name>/. Pictures with no stored pixels are still compared by hash. Data results stay byte-identical. Check: 100 of 60,000 pixels changed in a real canvas reads 99.833% identical in Chromium 155, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web 46.5; Node tests cover exactly 99.5 passes, 99.0 fails, a size change fails, update accepts.

## 1.0.0 · API 1 · 2026-10-18

### Quick
Shared pieces for browser checks: warm browsers that cut the start of each check from seconds to well under a second, fair timing, skipped rebuilds, a wasm-versus-JavaScript twin test, a picture gate and an automatic bisect.

### Deep
New tool. Warm browsers (cli.js warm start / status / stop): one background process keeps Chromium, Firefox, WebKitGTK or GNOME Web open and every check attaches to it, with a per-browser lock so two checks never time at the same moment. One tiny job (open a page, run one line, close), median of 3 taking turns, cold to warm in ms (smaller is better): Chromium 155 367 to 78 (4.7x), Firefox 158 2,553 to 284 (9.0x), WebKitGTK 2.52.6 591 to 33 (17.9x), GNOME Web 46.5 6,035 to 104 (58.0x). Starting the warm browsers once costs 0.7 s, 2.3 s, 0.7 s and 1.3 s. Firefox allows one automation session at a time, so its daemon only starts Firefox and every check opens and ends its own session. Also: rotate() (versions take turns in rotating order, warm-up round dropped, medians), speedGuard() (flags any change worse than 5%), table() (output with the better direction named), serve() (local pages with CSP), twin.js (wasm output must equal JavaScript output bit for bit), stamp.js (hash the inputs of a wasm build and skip it when nothing changed; build --list names the modules), fingerprint.js (hash of what a page draws, gate against saved baselines), bisect.js (finds the first bad commit in a temporary worktree, exit 125 to skip). 21 Node checks pass.
