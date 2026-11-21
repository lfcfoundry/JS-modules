# Test and profiling evidence

## Host and limits

- Date: 2026-11-21
- Runtime: Node 26.13.1, V8 14.6
- OS/device: Android ARM64 phone-class host
- System Zstandard used for supporting host comparisons: 1.5.7
- Compiler for temporary build variants: Clang 21.1.8
- Repository source baseline: current `main`, commit `c4c6b3a2ec6bce937b6017c427ff23c4e996cff2`

This host is outside the approved browser test matrix. The browser policy permits Firefox 158, ungoogled Chromium 156.0.8078.79-1, and WebKitGTK 2.52.6 on Linux x86_64, one browser at a time. The available device is Android ARM64 with Chromium 157 and no approved Firefox/Gecko or WebKit runtime. Therefore this review reports no browser performance numbers. The Node timing results below are for exploration only.

## Qualification results

- Unmodified zstd-kit: `node modules/zstd-kit/test/run.js` — **156 passed, 0 failed**.
- Temporary Clang 21 baseline, context-reuse, `-O3`, and `-O3 -msimd128` builds — **156/156** each.
- Combined tuner candidate (32 KiB sample cap, hashLog 17) — **156/156**.
- LFC-pack temporary integration with the candidate `zstd-core.js` and Wasm — full existing suite exited 0 and reported **all lfc-pack checks passed**.
- Generated bundle consistency: copying the unmodified zstd-kit module to scratch and running its `build.py` generated `zstd-kit.js` and `zstd-kit-dec.js` byte-for-byte identical to the checked-in files.
- Repository worktree: clean after review; all candidate edits and fixtures remained under `/data/data/com.termux/files/usr/tmp/zstd-kit-performance-2026-11-21`.

The successful suite runs are qualification for the existing tests, not a claim of complete fuzz, browser, or memory-stress coverage.

## Profiling method

The tuner fixtures were deterministic synthetic JSON/log-like records, mixed printable content, and structured logs followed by a random tail. Candidate outputs were checked by round-trip before measurement. Current and candidate runs alternated to reduce order bias; the final six-case candidate profile used 15 measured rounds per case. Reported times and sizes are the observed means/representative aggregate from that host harness; percent changes are relative to the current tuner result.

For the no-tune comparison, measurements were also paired and alternated. The 256 KiB threshold observation used 14 measured rounds. The decompression-context follow-up used 21 rounds. Short runs are susceptible to mobile CPU scheduling, thermal state, garbage collection, and runtime noise; browser decisions must use the prescribed test host and longer controlled runs.

## Browser and reproducibility status

No approved browser test was run. Before claiming improvement, repeat baseline and candidate in each approved browser, one at a time, with the required environment available. Capture browser/version, OS/kernel, CPU, Wasm bytes, cold and warm timings, memory observations, trial order, fixtures, and exact output lengths.

The local Clang 21 build is not the project’s pinned/release compiler. The module’s build script fetched/verified the pinned Zstandard source successfully in scratch, but its checked-in artifacts originate from Clang 18. Exact compiler-output comparisons require the project’s intended Clang version and flags.

## Safety of the experiment

No files in the repository were modified by profiling. Candidate C/JS variants, generated Wasm, fixtures, and logs were isolated in the scratch directory named above. The only GitHub changes from this review are these handoff documents on the Codex branch.
