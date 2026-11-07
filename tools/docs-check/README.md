# docs-check

## What it is and how it works

One command that finds the docs drift people used to catch by hand. It reads `modules.json`, every module README and CHANGELOG, and the shipped files, and prints each problem on one line. No browser, no network, standard library only; it takes a few seconds.

    python3 tools/docs-check/docs-check.py

Checks: every changelog line is 240 characters or fewer; the README opening size claim ("N KB gzipped (M KB minified and gzipped)") matches the shipped file (gzip -9; terser 5 `-c passes=2 -m` when terser is installed, otherwise that part is skipped); every module README opens with "What it is and how it works" then "Why it exists"; every tester page with a Run button has a Copy results button. It exits 1 when it finds a problem.

## Why it exists

Size claims, changelog lengths and section order drifted after nearly every merge, and each time someone had to find them by reading. A command that fails on the first stale number moves that work to the moment of the change. It found no problems on main when it was added, and it flags a README claim edited to be wrong.

## Use

Run it before opening a docs or module PR. `--terser PATH` points at a terser binary.
