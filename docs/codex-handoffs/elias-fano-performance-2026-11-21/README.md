# Elias–Fano performance lab: Claude handoff

**Prepared:** 2026-11-21  
**Repository:** `lfcfoundry/JS-modules`  
**Base:** current `main`, `d4a8e5b0ba801e2737bf1307db25626b3f7e45cb`  
**Module:** Elias–Fano 2.1.2, API 2

This branch contains the review, measured leads, and a concrete validation plan. It does not change production code. Please read [FINDINGS.md](FINDINGS.md), [TEST-EVIDENCE.md](TEST-EVIDENCE.md), then [TASKS.md](TASKS.md).

## Request to Claude

Implement and explore the bounded `nextGEQ` candidate on a follow-on Claude branch from this handoff. Preserve the existing 8-way batch kernel while testing the fallback in both scalar and batch paths. In a separate experiment, evaluate sample shifts 5, 6, and 7, including compatibility with saved blobs. Run the full approved browser matrix before recommending any production change. Report the completed measurements and rejected alternatives on the Claude branch. Do not merge into `main`.

The strongest result so far is a synthetic duplicate-run case: an 8-query batch that took about 1.51 ms took 42 μs with the temporary C prototype, while random 10,000-query batches stayed within 1% on both tested fixtures. A denser sample spacing was 5–16% faster in the paired ARM64 Node profiles, with 19–43% more bytes. Both leads remain unqualified in browsers.

## Scope and guardrails

- Keep experiments separate from production changes until the correctness, performance, blob-compatibility, and browser gates in `TASKS.md` pass.
- Preserve Elias–Fano 2.1.2/API 2 behavior and the current default blob encoding during the adaptive-query experiment.
- Do not use the Android Chromium 157 result as an approved browser result. The current browser policy is Firefox 158.0, ungoogled Chromium 156.0.8078.79-1, and WebKitGTK 2.52.6 on Linux x86_64, one at a time.
- Preserve the source-to-Wasm build and embed checks. This host has Clang 21; its output differs byte-for-byte from the committed Clang 18.1.3 artifacts, although the rebuilt Wasm passed the module suites. See `TEST-EVIDENCE.md`.
- Do not change API/version labels or publish release claims without following `AGENTS.md` and recording browser versions and exact measurements.

## Research

- Vigna, [Quasi-Succinct Indices](https://vigna.di.unimi.it/ftp/papers/QuasiSuccinctIndices.pdf): explains that a smaller select-sampling quantum reduces follow-up work while consuming more space.
- Ottaviano and Venturini, [Partitioned Elias–Fano Indexes](https://pages.di.unipi.it/rossano/assets/pdf/papers/SIGIR14.pdf): partitioning adapts to local clustering.
- Pibiri and Venturini, [Clustered Elias–Fano Indexes](https://pages.di.unipi.it/pibiri/papers/TOIS17.pdf): discusses locality-aware cursor behavior and short forward skips.

The module already has partitioned and block-list representations. Treat those as comparators for distribution-specific workloads rather than assuming a flat-list change is universally better.
