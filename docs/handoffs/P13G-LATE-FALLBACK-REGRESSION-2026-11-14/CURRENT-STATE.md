# Current State

## Repository and source baseline

- Repository: [`lfcfoundry/JS-modules`](https://github.com/lfcfoundry/JS-modules)
- P13g source baseline: commit [`cb91493c05cb0b056259a8ef416a8b503bae2486`](https://github.com/lfcfoundry/JS-modules/commit/cb91493c05cb0b056259a8ef416a8b503bae2486)
- Dedicated handoff branch: [`codex/claude-handoff-p13g-regression-2026-11-14`](https://github.com/lfcfoundry/JS-modules/tree/codex/claude-handoff-p13g-regression-2026-11-14)
- The new branch is based on the exact P13g source commit above. Its changes are the two test paths listed below and this handoff directory.
- At publication preparation, GitHub `main` was `ef8cc165ddc6883291c619800552dfd3daca57cf`; GitHub's commit history showed the P13g baseline as an ancestor. This handoff branch intentionally remains based on the audited source revision and is not merged with `main`.

## Test paths

- `modules/lfc-pack/test/p13g-late-fallback.cjs`
- `modules/lfc-pack/test/run.js` — one registration line for the focused test.

The exact branch files are available at:

- [`p13g-late-fallback.cjs`](https://github.com/lfcfoundry/JS-modules/blob/codex/claude-handoff-p13g-regression-2026-11-14/modules/lfc-pack/test/p13g-late-fallback.cjs)
- [`run.js`](https://github.com/lfcfoundry/JS-modules/blob/codex/claude-handoff-p13g-regression-2026-11-14/modules/lfc-pack/test/run.js)

## Implementation locations

- P13g source: [`modules/lfc-pack/src/nested.js` at the baseline](https://github.com/lfcfoundry/JS-modules/blob/cb91493c05cb0b056259a8ef416a8b503bae2486/modules/lfc-pack/src/nested.js#L421-L456)
- Generated bundle: `modules/lfc-pack/lfc-pack.js`
- Test uses the generated bundle, replacing a single exact fallback statement only in memory; it does not write or alter the bundle.

The source's `eqOff` helper computes a plain-string offset only while all preceding fields are plain strings. An object or list before the predicate makes the direct offset unsupported. `rowsOf` then abandons the partial one-pass result, resets stream cursors, discovers matching row indexes, resets again, and constructs only matching results. The implementation and test details are in [FINDINGS.md](FINDINGS.md).

## Scope and status

This is test-only regression coverage. Production source, generated bundles, dependencies, configuration, workflows, and public behavior were not changed. The result is correctness evidence on Android ARM64 Node, not browser performance qualification. The complete limitations are recorded in [TEST-EVIDENCE.md](TEST-EVIDENCE.md).
