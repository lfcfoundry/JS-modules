# Claude task plan: image-decode

## Objective

Determine whether Uint8Array.fromBase64 materially improves large data-URL ingestion in image-decode without changing accepted inputs, errors, Blob MIME behavior, or browser decode behavior. Implement only after browser evidence supports it.

## 1. Rebase and inspect before editing

- Start from current GitHub main and confirm the reviewed source revision or inspect all later image-decode changes.
- Read the current module instructions, versioning instructions, test harness, and private approved-browser policy.
- Review prior image-decode concurrency and decode-strategy research. Keep this work scoped to base64 conversion unless new measurements show a separate bottleneck.
- Keep source-of-truth edits only. Regenerate minified or other generated outputs through the repository's prescribed build tools; do not hand-edit generated bundles.

## 2. Compare implementations

Measure these variants behind one harness:

1. Current atob plus character-copy path.
2. Feature-detected Uint8Array.fromBase64, retaining current fallback.
3. Optional exploratory alternative: fetch(dataURL).then(response => response.blob()) or setFromBase64 with a bounded allocation. Do not adopt either without separate semantic and memory evidence.
4. Keep each variant's output bytes and MIME type identical.

First benchmark conversion alone, then the real module path. Separate base64 conversion, Blob construction, image decode, and full load timing. Use actual small valid PNG, JPEG, and WebP files so image decode is real; retain a fake decoder only for isolating conversion cost.

## 3. Correctness matrix

Add or extend tests for:

- Payload sizes around 0, 1, 2, 3 bytes and larger sizes: 1 KiB, 64 KiB, 256 KiB, 1 MiB, 4 MiB, and 8 MiB.
- Random bytes covering all byte values, valid padding variants, and encoded lengths on both sides of a 3-byte boundary.
- ASCII whitespace in the base64 body; Unicode whitespace accepted by the legacy JavaScript whitespace expression; verify native decode plus fallback matches the old result.
- Invalid alphabet characters, misplaced or excess padding, incomplete final groups, data after padding, empty data, and malformed data URL metadata.
- Both native API available and absent. Force the native method to throw as well as testing it missing; confirm the fallback works and errors remain the public module's current error.
- Exact Blob bytes, sniffed MIME type, supplied MIME fallback, and the existing invalid-data error.
- Non-base64 percent-encoded data URLs, Blob input, ArrayBuffer, typed-array views with non-zero byteOffset, fetched URLs, loadAll ordering, and strategy/worker paths remain unchanged.

Use differential tests against the existing implementation as an oracle where its behavior is intentional. Document any standards-driven behavior difference instead of silently accepting it.

## 4. Browser performance permutations

Before every browser session, reread the approved matrix from the private knowledge-base browsers branch. Current recorded matrix on 2026-11-21 is Firefox 158.0, ungoogled Chromium 156.0.8078.79-1, and WebKitGTK 2.52.6 on Linux x86_64; run one browser at a time.

For each engine and variant:

- Warm up, alternate variant order, run at least 30 measured repetitions, report median and p95, and keep payload generation outside timed regions.
- Test payloads at 1 KiB, 64 KiB, 256 KiB, 1 MiB, 4 MiB, and 8 MiB.
- Test PNG, JPEG, and WebP bytes; use both conversion-only and actual ImageDecode.load paths.
- Record time to Blob, time to decoded drawable, long tasks or main-thread blocking where supported, peak memory if a reliable tool exists, and failures.
- Test with and without loadAll and its worker route only as a separate follow-up; do not mix concurrency changes into the base64 comparison.

Report engine/build, OS, CPU, test artifact, repetitions, warmup, median, p95, and exact bytes validated. Do not aggregate across engines.

## 5. Decision gate and implementation

Proceed with the native path if:

- Correctness and error behavior pass in every supported engine.
- Large payload conversion improves median time by at least 15% in at least two approved engines and has no repeatable regression above 5% for payloads below 64 KiB.
- Real ImageDecode.load results show the gain survives Blob and decode overhead, or the conversion-only result still meaningfully reduces main-thread blocking.
- The new path does not increase peak memory materially for the tested large payloads.

If it fails the gate, keep the current implementation and report which engine or payload class erased the gain. If it passes, make the smallest source change, preserve fallback, update tests/changelog/version using repository tools, regenerate required artifacts, and rerun all module qualification.

## 6. Handoff back

Commit the implementation and evidence to a separate Claude/Codex branch. Include test commands and outputs, browser result tables, memory method, unsupported-engine fallback coverage, the final decision, and any follow-up opportunity. Do not describe Node-only candidate figures as browser results.