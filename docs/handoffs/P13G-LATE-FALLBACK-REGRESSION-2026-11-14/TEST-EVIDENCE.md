# Test and Qualification Evidence

## Environment

- Runtime: Node.js `v26.13.1`
- Platform: Android ARM64
- Test type: correctness only

These results are not Linux browser results and do not qualify browser performance, browser memory, or production performance.

## Commands and results

Run from the repository root:

```sh
node modules/lfc-pack/test/p13g-late-fallback.cjs
node modules/lfc-pack/test/query.cjs
node modules/lfc-pack/test/rangesel.cjs
node modules/lfc-pack/test/equalsread.cjs
node modules/lfc-pack/test/nestedkeys.cjs
```

The focused P13g test passed. The four existing nested/query tests passed. These commands were rerun while preparing this handoff; the focused test reported that object/list fallback occurred after two partial matches and that zero-prior-match, absent, null/missing, omitted-key projection, and inclusive-range oracle checks passed.

The registered runner is `node modules/lfc-pack/test/run.js`. In the prior full-run validation, the P13g test ran successfully, but the runner exited with an unrelated failure at `modules/lfc-pack/test/pool-budget.cjs:101`: `posted jobs released when answered`. Running that pool-budget test separately reproduced the failure in the same environment. The full suite therefore did **not** pass.

## Instrumentation and oracle

At test load time, the test reads `modules/lfc-pack/lfc-pack.js`, requires exactly one occurrence of the P13g fallback statement, substitutes an in-memory trace at that statement, and compiles that text as a temporary Node module. The trace records the row, number of partial matches, predicate key, field keys, and field kinds. The fixture asserts that the unsupported row is reached after two matches and that its object/list field occurs before the predicate.

The oracle fully unpacks the same packed fixture without a predicate, then filters and projects with ordinary JavaScript. Expected rows are compared deeply with the query result. This avoids using the selective fallback itself as the oracle.

## Source and generated-bundle relationship

`modules/lfc-pack/build.py` concatenates the ordered `src/*.js` inputs, embeds WebAssembly assets, and writes generated bundles (and may write the viewer). The audited source implementation was checked against the corresponding generated bundle without running a build. The build was not run because it rewrites generated artifacts outside this test-only task. There is no separate source-to-bundle consistency check in the inspected workflow.

## CI status

The inspected `.github/workflows/pages-fresh.yml` workflow sets up Python 3.12 and runs module-pages, docs-check, and single-file tool checks. It does not set up Node or run `modules/lfc-pack/test/run.js`. CI integration remains unconfigured and was not changed. A CI change requires a separate decision and should account for the build's generated outputs rather than silently rewriting them.
