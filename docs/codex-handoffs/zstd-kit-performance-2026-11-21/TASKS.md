# Claude implementation and experiment plan

## Goal

Determine whether the automatic compression tuner can reduce end-to-end work on realistic text inputs while retaining its ratio advantage on structured logs. Treat the smaller sample/hash-table candidate as a hypothesis to qualify, not as an accepted production change.

The shared implementation is \`modules/zstd-kit/src/zstd-core.js\`; LFC-pack embeds it. Keep source-of-truth edits in the module source, then regenerate outputs through the supported build. Do not patch generated bundles by hand.

## P0 — Reproduce and audit

1. Read repository \`AGENTS.md\`, module build instructions, and the current zstd-kit and LFC-pack test commands.
2. Confirm the current \`main\` source and existing generated artifacts are in sync using the supported build.
3. Reproduce the current tuner path and record:
   - input eligibility and sampling locations/lengths
   - candidate parameter tuples and selection metric
   - number of sample and full-input compression calls
   - allocations, copied sample bytes, and temporary Wasm/native memory
   - behavior for explicit compression levels versus default/level 3
4. Establish a no-tune baseline and the current implementation baseline before changing parameters.

## P1 — Staged tuner experiment

### Deterministic workload families

Use seeded generators and preserve their source/seed in the report.

- Structured ASCII logs and JSON records with stable keys and varied values.
- Mixed prose, JSON, stack traces, timestamps, UUIDs, and base64-like runs.
- Unicode-heavy text: accented Latin, CJK, emoji, combining marks, and varied line endings.
- Text/binary mixtures: binary header, binary trailer, interleaved binary chunks, and logs with a random tail. Include the 20% random-tail case to reproduce the host fixture.
- Opaque controls: seeded random bytes, already-compressed data, and small inputs that should not enter tuning.

Include 256 KiB, 512 KiB, 1 MiB, 4 MiB, and 16 MiB inputs where memory budgets permit. Add 64 KiB and 128 KiB controls. Keep both repetitive and high-entropy examples. Validate each generated fixture and its declared printable ratio.

### Parameter and policy matrix

Use a staged, bounded experiment so the full Cartesian product is not necessary:

1. **Reference:** no tuning; current tuner (128 KiB cap, hashLog 18, current minMatch candidates).
2. **Sample cap:** 32, 64, and 128 KiB, with current centered sample placement.
3. **Hash table:** hashLog 17, 18, and 19 for the 32 and 64 KiB caps.
4. **minMatch:** current 6/7 candidates versus 5/6/7 only for finalists.
5. **Sampling location:** center versus beginning/end segments; test whether a single center sample misses useful structure and whether segmented sampling costs less than full sample compression.
6. **Eligibility policy:** printable thresholds 84%, 85%, 86%, and 90%; compare current rule against size-aware cutoffs and a cheap multi-window entropy/repetition estimate. Do not add a costly classifier without accounting for its time.
7. **Candidate selection:** compare sample compressed bytes, a size-normalized score, and a minimum expected-win threshold that accounts for sample and second full compression work.
8. **Compression levels:** exercise default/level 3 and ensure explicit user-selected levels retain documented semantics.

First screen on a small set of representative workloads, then run finalists across all workload families. Include alternating baseline/candidate order, at least 20 measured browser trials per case, cold-start and warmed cases, and distributions (median/p95 and confidence interval or robust spread), not just one mean.

### Required measurements and guardrails

Record compression and decompression throughput, compressed bytes/ratio, wall time, peak/retained memory, temporary allocations if observable, and total end-to-end time including tuner sample work. Track per-call latency for small cases and throughput for large cases. Include warm repeated calls and independent fresh instances.

Hard correctness requirements:

- exact byte and length accounting; reject truncation/corruption consistently
- round-trip equality for every fixture and parameter combination
- deterministic output checks where the module promises determinism
- no changes to framing, decoder compatibility, or explicit-level semantics
- malformed-input and boundary-size behavior remains covered

A candidate should proceed only if it shows a repeatable end-to-end gain in at least one target class, retains acceptable ratio on structured logs, and has no material regressions for mixed/Unicode/binary controls. Set the acceptable ratio and latency budgets before reviewing the finalist measurements.

## P2 — Browser qualification

Use only the approved Linux x86_64 browser environment: Firefox 158.0, ungoogled Chromium 156.0.8078.79-1, and WebKitGTK 2.52.6. Run one at a time and reread the private browser policy before each run. Do not substitute Android Chromium or Node timings for browser qualification.

For each browser:

1. Record the exact runtime, host, compiler/build flags, Wasm byte sizes, and clean baseline commit.
2. Run correctness checks before timing.
3. Interleave baseline and candidate runs; keep fixture bytes and seeds identical.
4. Separate cold module initialization from warmed repeated compression.
5. Repeat across fresh and reused module instances and report median, p95, and spread.
6. Preserve machine-readable raw results and a concise summary table.

Do not pool browser results until per-browser regressions are understood.

## P3 — Secondary candidates (only after tuner work)

- **Decoder context reuse:** compare the one-shot \`ZSTD_decompress\` path with a persistent \`ZSTD_DCtx\` using repeated small, mixed, random, and multi-megabyte decode calls. Measure reset/retained-memory cost and lifecycle correctness. Keep only if the browser gain repeats and memory remains within budget.
- **Compiler flags/SIMD:** use the project’s pinned compiler and required browser compatibility. Measure full and decoder-only Wasm size alongside speed; the tested Clang 21 \`-O3\` builds grew 20–30% with no broad host win. Do not make this a default change without an agreed size budget and browser evidence.
- **Upstream update:** check the official release notes and changelog first; update only to a stable, pinned release, then run the full compatibility matrix.

## P4 — Implement and integrate only a qualified winner

If a candidate clears the guardrails:

1. Make the smallest source-only implementation change in zstd-kit.
2. Regenerate the module’s supported bundles/Wasm using the project-pinned toolchain.
3. Run the complete zstd-kit suite, then the full LFC-pack suite against rebuilt shared artifacts.
4. Review generated diffs and record source hash, compiler/version/flags, Wasm sizes, and all browser raw data.
5. Update module docs with qualified scope and measured tradeoffs. Do not report host-only synthetic measurements as product performance claims.
6. Commit the implementation and evidence on the assigned Codex branch; report any unresolved tradeoff clearly.
