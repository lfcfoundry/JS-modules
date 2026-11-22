# Claude plan: fuzz-kit

## Objective

Find real end-to-end time and memory costs in the current 1.3.4 runners and engine. Keep the shipped behavior and seeded replay stable. Start with measurement only; do not port the old review's already-merged work.

## Browser rule

Re-read the current browser knowledge-base instructions before testing. Approved browsers are Firefox 158.0, ungoogled Chromium 156.0.8078.79-1, and WebKitGTK 2.52.6 on Linux x86_64, one at a time. Record actual executable/version. The Android Node results in FINDINGS.md do not replace this matrix.

## Attribute costs

On the example app and one representative real client, record separately: browser startup and page reset, operation dispatch, each invariant, cfg.state serialization and visited-map growth, failure capture, shrink replay count, and report/bundle output. Use a test-only harness; do not add a profiler dependency to the shipped tool.

Compare a real browser operation workload with an engine-only no-op run. Report operations per second only alongside the operation shape, browser version, and number of invariants. Keep CPU-bound engine time separate from app rendering and wait time.

## Permutation matrix

1. Operation count: 1, 4, 8, 16, 32, 64, 128, and 256; equal, skewed, and zero weights.
2. Run options: plain seeded run, record:true, perOp replay, stored-script replay, stopAt, firstOnly.
3. Checks: 0, 1, 3, and 10 cheap invariants; one realistic DOM invariant; cfg.state with 1, 64, and one-new-value-per-step signatures.
4. Failure location: first, middle, last operation; repeated and non-repeating failure; app failure versus invariant failure.
5. Shrinker: 32, 128, 512, and 2,048 operations; default complements and pieces:true; maxTries and maxMs budgets. Count replays and final minimized length separately from wall time.
6. Runner: --jobs 1, 2, and 4; Chromium, Firefox, and WebKitGTK; short and slow operations; --shrink, --bundle, --real-input, and --swarm both independently and in supported combinations.

Pair and alternate variants. Use at least 12 runs per browser cell, report median and interquartile range, and preserve raw result JSON. For memory, launch a fresh process per jobs setting and record peak RSS plus child-process count; do not infer memory from heapUsed alone.

## Candidate optimization gates

- Weighted-op selection is linear in the number of configured operations. Consider a cached cumulative table only if real clients configure dozens of operations and profiling attributes at least 10% of engine CPU to choice. Preserve one PRNG draw and exact same-seed scripts, including zero weights and fractional weights.
- Do not cap cfg.state cardinality or change visited output silently. If unique signatures are costly, add clear guidance or an explicit opt-in limit only after a use case and compatibility review.
- Do not add parallel shrink candidates until total replay time and browser/process memory show a benefit. Parallelism can multiply browser memory and make nondeterministic apps harder to reproduce.
- Do not add test timing assertions. Keep performance qualification as a repeatable benchmark report.

## Correctness checks

Run node tools/fuzz-kit/test/run.js and python3 tools/fuzz-kit/test/runner_fakes.py first. Then run the real browser checks, including the frozen-page watchdog and real Space input in Firefox. For a runner change, also test the same seed across the approved browsers and verify the finding and minimized script remain reproducible.
