# Claude plan: memory-compression

## Objective

Reproduce and qualify the large-core-output chunk-list spike while continuing to profile current 2.18.1 memory retention. The current module is already highly tuned; preserve format bytes, normal fast paths, and caller ownership semantics.

Do not copy an untracked scratch implementation blindly. Re-derive the path from current src/core.js, add a benchmark, and keep it isolated until the evidence is repeatable.

## Required browser rule

Re-read the repository's current browser instructions before testing. Approved matrix: Firefox 158.0, ungoogled Chromium 156.0.8078.79-1, WebKitGTK 2.52.6 on Linux x86_64, one browser at a time. No GNOME Web. This review ran only Node v26.13.1 on Android arm64.

## Correctness matrix

Run existing core, object-layer, and router suites first. For the candidate also run FULL=1 and the core JavaScript-only path. Compare old/new packed bytes, not only unpacked values.

Cover:
- Input sizes immediately below, at, and above the chosen threshold; also 1, 4, 8, 16, 32, 64, and 128 MiB.
- High entropy, repeated bytes, mixed raw/compressible blocks, text bytes, integer typed arrays, smooth and noisy Float32/Float64 arrays.
- fast, small, and balanced routing; wasm on/off; shuffle/delta defaults and disabled; checksum on/off.
- chunk sizes 4 KiB, 64 KiB, 256 KiB, 1 MiB, and 4 MiB.
- empty/tiny inputs, odd final chunks, ArrayBuffer views with offsets, a previous retained pool buffer, simultaneous independent results, check:true, damaged-input rejection, and compatibility with old readers.
- Verify each returned result owns independent bytes and that a later pack cannot mutate an earlier result.

The initial spike failed the existing retained-buffer policy test because it left a previously pooled buffer alive. Preserve this regression case.

## Performance and memory matrix

Use separate fresh processes for peak RSS. On Node report process.memoryUsage() fields before pack, immediately after pack, after forced GC, and after explicitly dropping the output and buffers. Report process.resourceUsage().maxRSS with platform and units.

For elapsed time, warm both builds, alternate them in the same process, use at least 12 paired runs per cell, and report medians plus interquartile range. Include current bench/mem-run.js unchanged to retain a comparable module-level memory baseline.

Repeat in each approved browser using the module's existing bench harness, one browser at a time. Browser runs must use the same data bytes, warm-up, and order balancing. Capture page responsiveness / longest task for packAsync separately from synchronous pack; do not use async results as a substitute for core.pack throughput.

## Acceptance gates

Proceed only if:
1. Core, object-layer, router, FULL=1, and JavaScript-only correctness all pass.
2. Format output remains byte-identical to current main across the matrix and remains readable by existing readers.
3. On high-entropy inputs above the threshold, peak memory falls repeatably and pack time improves materially.
4. On compressible and real-shaped inputs, no approved browser regresses by more than 5% beyond its paired-run spread.
5. Small inputs keep the existing buffer path and do not allocate a part list.
6. Repeated idle cleanup, freeBuffers(), core trimming, and output lifetime remain correct.

A reasonable initial promotion bar is at least 25% lower peak RSS on the high-entropy large-input case, at least 10% faster there, and no repeatable regression above 5% on normal compressible workloads. Adjust only if the benchmark variance makes these thresholds unmeasurable; explain any changed gate.

## Other findings to keep in view

- packColumns is already useful when the application's source is columnar: in the local 100k API-user test it was about 32% faster than packing prebuilt rows, with byte-identical output. Do not include row-to-column extraction in the packColumns timer unless that work is part of the actual application path.
- The object numeric pool is intentionally retained between calls. Include its memory in idle/busy-state tests and keep manual release behavior explicit.
- Do not tune the pool caps or idle timeout from one Node measurement. Browser engines and Firefox's array-pool path can differ.
- If no browser can reproduce the core-packer gain, retain the current path and publish the negative result.
