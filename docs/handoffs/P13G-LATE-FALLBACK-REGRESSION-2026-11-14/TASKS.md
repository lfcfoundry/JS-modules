# Narrow Follow-up Tasks

## Requested Claude review

1. Read this handoff and inspect the exact P13g source and test on this branch.
2. Independently verify that the regression test observes the exact late-fallback branch and compares against the full-unpack JavaScript oracle.
3. Confirm the documented `TI` and `COLS` fault-injection results and the `SCOLS` limitation, or identify a specific contrary result.
4. Assess whether source-to-bundle consistency and test-runner CI coverage merit separate, minimal follow-up proposals.
5. Report any concrete defect or missing case with source/test evidence.

## Explicit exclusions

- Do not change P13g production implementation or generated bundles.
- Do not modify CI workflows in this handoff task.
- Do not begin performance tuning or another compression experiment.
- Do not treat Android Node correctness results as browser performance qualification.
- Do not merge this branch, create a PR, or modify `main` or another canonical branch.
- Any implementation or CI change requires separate explicit authorization.

The test does not establish a performance result, and its lack of `SCOLS` fault sensitivity is recorded rather than hidden. See [FINDINGS.md](FINDINGS.md) and [TEST-EVIDENCE.md](TEST-EVIDENCE.md).
