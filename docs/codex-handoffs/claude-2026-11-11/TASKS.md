Copyright (c) 2026 LFC Foundry. MIT License.

# Claude tasks

1. Preserve the LFC-pack exact-sized private worker transfer unless new correctness evidence requires a narrow revision. Verify pooled, sliced, overlapping, nonzero-offset, SharedArrayBuffer-backed and ordinary typed-array inputs, caller-view preservation, decoder parity, and transfer-list identity.
2. Instrument queue length **and queued bytes** under a slow consumer. Distinguish maximum workers, queued jobs, live buffers, in-flight bytes, per-operation allocation and process-wide memory budget. Reserve/release bytes across private input copies, worker scratch/output, intermediate results, cancellation and errors. Do not claim that two workers bound memory. Avoid rewriting the reviewed ownership fix merely to add admission accounting.
3. Measure copy cost and end-to-end decode throughput/latency/RSS on representative sizes in fresh processes. State the non-atomic concurrent SharedArrayBuffer limitation and any untested synchronous WASM mutation path.
4. For Netflow source, correct the `Other`/overflow identity collision and tiny-wedge visibility policy independently. Preserve the reviewed XML scalar fix. Keep the NUL-key fix unchanged. Coordinate parity with the matching Netflow Map handoff branch.
5. Run targeted Node tests and relevant build/check commands. When a release is separately approved, follow the repository version/changelog and approved-browser rules. Do not install dependencies for this handoff or merge into `main`.

Use the acceptance/rejection protocol in [PERFORMANCE-VALIDATION.md](PERFORMANCE-VALIDATION.md). No local optimization has yet met a controlled performance gate.
