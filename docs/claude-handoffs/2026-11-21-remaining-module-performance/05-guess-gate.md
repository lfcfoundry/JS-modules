<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# guess-gate: admission contract and progressive-import cost

**Baseline:** `guess-gate` 1.0.1 at `JS-modules` main `a056fbd1`. Start with `modules/guess-gate/test/run.js`, `modules/guess-gate/index.html`, `modules/guess-gate/README.md`, and `modules/guess-gate/guess-gate.js`.

## Code-review finding to settle first

The README says guesses “may use up to” the selected share and that they “never cost more” than that share. The implementation can enforce admission based on an estimate, but it cannot stop a synchronous callback after admission. More specifically, the first `run(fn)` defaults its estimate to zero; once `minMs` has elapsed, any first callback is admitted even if it takes much longer than the remaining budget. If the callback throws, the `finally` block still records its elapsed time and guess count, then the exception escapes. A later call may therefore report `spent / elapsed > share` even though each admission passed.

Before tuning the implementation, ask the owner to choose the contract: a best-effort scheduling budget that may be exceeded by a long callback, or a hard limit that requires cooperative/chunked work or an explicit initial estimate and still cannot preempt synchronous JavaScript. Make README examples and returned stats match that contract. Do not claim a hard cap for arbitrary callbacks.

## Deterministic behavior matrix

Use an injected fake clock. No wall-clock waits belong in unit tests.

| Area | Permutations and assertions |
|---|---|
| Start/finish lifecycle | Call `allowed`, `nextIn`, `run`, `stats`, and `finish` before start; at start; after finish; after a second `start`; and after repeated `finish`. Record whether elapsed time is sampled at each stats call or frozen at finish. A finished gate must not run more guesses. |
| Admission boundaries | For `share` 0.025, 0.05, 0.10, and 1, test exactly below, at, and above `minMs`; then set `spent + estimate` to one clock tick below, exactly at, and one tick above `share * elapsed`. |
| Estimate behavior | Test first call with omitted estimate, explicit zero, a correct estimate, an underestimate, and an overestimate. Make callback time less/equal/greater than estimate. Assert actual `spent`, `last` estimate use on the next call, `skipped`, and `nextIn` independently. |
| Invalid values | Try `minMs` negative/NaN/infinity, `share` zero/negative/above-one/NaN/infinity, and estimates negative/NaN/infinity. Pin intended validation and error behavior before adding guards; negative estimates currently can make admission easier. |
| Callback outcomes | Use no-op, clock-advancing, and throwing callbacks. Verify a thrown callback is counted once, its time is recorded, the exception is rethrown unchanged, and subsequent admission follows the documented policy. |
| Clock behavior | Advance by fractional milliseconds and simulate a non-monotonic injected clock. Either document the monotonic-clock requirement or define safe behavior; avoid interpreting a fake wall-clock adjustment as free budget. |
| Reset and counters | After skips, successful runs, and an exception, call `start()` again. Assert spent/guesses/skipped/last reset and the original share/minMs remain selected. |

Use exact expected arithmetic rather than loose timing assertions. Include a small independent admission oracle for `share * elapsed >= spent + estimate` and separately model the chosen lifecycle contract.

## Progressive-import experiment

Once the contract is settled, replay the same synthetic input through three modes: no guess work, a guess after every chunk, and `GuessGate` at 2.5%, 5%, and 10%. Cross 10/40/100/400 chunks with small, medium, and skewed final graph shapes; use chunk parse costs that are steady and bursty. Include a first guess that is cheaper than, equal to, and much more expensive than later guesses, since the default estimate is zero before the first success.

Measure parse/import time, actual guess time, total time to final picture, time to first useful guess, guesses and skips, and actual `spent / elapsed` separately. Keep input generation outside timing. Report cold and warm runs with paired alternating order in approved browsers. A faster first picture that delays final import more than the chosen budget is not a win. Record both the user-visible first-guess benefit and the final-picture cost; do not collapse them into one latency number.

The 1.0.1 README reports that the default 5% mode stayed within about 10% of the no-guess page in its synthetic Sankey run and that 10% cost WebKitGTK 8–12% more. Treat those values as a baseline to reproduce, not a pass for other chunk patterns. No module code or tests were changed by this handoff, and no measurements were run here.
