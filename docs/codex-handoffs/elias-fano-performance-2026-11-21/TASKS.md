# Claude implementation and exploration tasks

Work from this handoff branch or a Claude branch based on it. Keep implementation and evidence on GitHub for review. Do not merge into `main`.

## 1. Reproduce the baseline first

Read `modules/elias-fano/README.md`, `CHANGELOG-DEV.md`, `test/`, `tests/elias-fano-speed-browser.js`, `wasm/ef.c`, and `wasm/build.sh`. The current module already has SIMD decode and 8-way interleaved batch reads. Preserve that behavior and measure against the current `main` baseline.

Record exact code SHA, compiler version, browser version, OS/architecture, backend (JS/Wasm/SIMD), data shape, list size, query count, warm-up, rounds, median, spread, and blob bytes. Keep correctness samples separate from large performance samples. Run one browser at a time with the repository noise guard.

## 2. Implement the adaptive `nextGEQ` experiment

Build a candidate in a scratch branch. Keep the existing implementation available as a control. Prototype and compare at least these thresholds:

- after 4, 8, 16, and 32 values within a high bucket, switch from linear scan to binary search using `getOne`;
- after 2, 4, and 8 high-bit words while selecting a zero, switch to a fallback using the one-sample array.

Apply and test the logic in every path that can expose the degeneration: scalar `nextGEQ`, `nextGEQMany`'s 8-query loop, `nextOneV`/intersection, and the JavaScript fallback. Keep the batch's 8-way memory-level parallelism unless measurements support a different design. Avoid building a production fallback that makes every ordinary query pay a large new cost.

### Correctness matrix

Add a repeatable module test and register it in the repository's test runner. Compare with a plain sorted array and with the unchanged implementation. Cover:

- empty, singleton, all-equal, strictly increasing, dense, sparse, clustered, and random lists;
- duplicate-run lengths 1, 7, 8, 9, 63, 64, 65, 127, 128, 129, 1,024, and at least 100,000;
- duplicate runs at the beginning, middle, and end; runs aligned across and straddling 32/64-bit word boundaries and 128-value sample boundaries;
- low-bit width zero and nonzero; values 0 and 4,294,967,295; hits, misses, exact bucket boundaries, targets just before/inside/after runs, and above max;
- scalar and batch sizes 0, 1, 7, 8, 9, 64, and 20,000; repeated, sorted, reverse-sorted, uniform-random, and adversarial queries;
- JS, Wasm, and Wasm SIMD selection; mixed-list and flat/partitioned/block intersections where applicable;
- malformed and truncated headers, fractional/negative scalar inputs, NaN, and existing RangeError behavior.

Run all ten Elias–Fano module test files, the `tests/kits.js` Elias–Fano steps, and the full approved browser matrix. Confirm JS/Wasm builders remain byte-identical for the existing default format.

### Performance gates

- Reproduce the 200k / 100k-duplicate fixture and also use production-shaped workloads.
- Report scalar and batch paths separately. Include the existing spread, dense, clustered, and Netflow list workloads, plus duplicate-heavy distributions.
- Require a large tail-case win (target at least 5× on the explicit long-bucket fixture) and no more than 3% median regression on ordinary random 10k batches in each approved browser. If a browser misses either gate, investigate or reject the candidate.
- Measure the existing default and candidate in paired alternating runs with the same page, inputs, output buffers, warm state, and noise policy. Report medians and variability, not the fastest isolated sample.
- Also measure code size, build cost, and any extra memory/index bytes.

## 3. Explore sample shifts separately

Compare shifts 5, 6, and 7 on 1M and 5M lists, using the same spread/dense/clustered fixtures and 20k/100k random and sorted `getMany`/`nextGEQMany` inputs. Report size and time together for each browser and each shape. Do not combine this with the adaptive-kernel candidate in one measurement.

Do not change `SAMPLE_SHIFT` globally as a shortcut. The parser currently validates the stored shift against the compiled layout. Prove that current shift-7 blobs continue to open if shift 5 or 6 is introduced. If there is an option or per-blob shift, validate shift bounds and damaged headers, preserve deterministic bytes for the existing default, and assess API/version implications.

The decision is a Pareto choice. State the maximum size increase accepted for each workload and whether the benefit is sufficient; do not select a faster shift without reporting its storage increase.

## 4. Resolve Wasm reproducibility

The Clang 21.1.8 rebuild was functionally qualified in a scratch copy but differed byte-for-byte and in size from the committed Clang 18.1.3 artifacts. Reproduce with the shipped compiler version if available, or document the compiler/version policy and determine whether exact-byte reproducibility is intended. Do not update embedded binaries or the build script solely to silence the check.

## 5. Report for review

Update this handoff on the Claude branch with:

1. final algorithm and rejected alternatives;
2. correctness-test files and exact pass/fail output;
3. per-browser performance tables and raw result files;
4. size, code-growth, and blob-compatibility consequences;
5. the compiler rebuild result;
6. a clear recommendation: keep, expose as an option, or reject.

Do not claim a browser speedup from Android Node timings. Follow `AGENTS.md` for versions, README/changelog updates, browser labels, and release preparation if a production change is later approved.
