# B28 handoff: packRowsParallel (owner-named 9:07 AM 2026.11.13)

Send this only after the owner picks an option on the B28 card.

- Apply `b28-on-b25-b26.diff` on top of the B25 + B26 handoff (0.10.2 queue). It adds `packRowsParallel` to the API, `b28Col` / `b28Job` in `src/flat.js`, and `packRowsParallel` / `packRowsBlocks` and the helper `'c'` job in `src/pool.js`.
- It's a new opt-in call and the file format doesn't change. Add it to the README quick-start and the d.ts, if there is one.
- Default behavior is auto start. For "Always use helpers", drop the `B28_AUTO` line.
- Evidence: `RESULTS-B28-packRowsParallel-2026.11.13.md`. On 300k taxi rows, later calls take 0.54 of packRows (B25 + B26) and the first call 0.87 (3 browsers, weighted), with byte-identical files.

## Tests to add

- Same bytes as `packRows` on files above and below the 52 MB rule, across 3 calls in a row.
- The bail cases, plus a bail inside a helper (-0 or NaN in a column of 8,192 or more values).
- A helper error should reject the call.
- Calls overlapping each other (two `packRowsParallel` at once).
- Node `worker_threads` and browser Workers.
