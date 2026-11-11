Copyright (c) 2026 LFC Foundry. MIT License.

# Findings

## LFC-pack transfer — ready for integration consideration

The parent `Buffer.slice()` could alias a pooled or caller-owned backing store, causing worker transfer failure or detachment of another view. The candidate copies selected Buffer block bytes into an exact-sized private `Uint8Array` before transfer; non-Buffer `Uint8Array.slice()` already copied. An independent worker interception found twelve jobs from pooled, offset/sliced, SharedArrayBuffer-backed and plain typed-array inputs with private exact-sized backing, correct transfer lists, correct decoded rows and intact caller views. The unchanged pooled baseline reproduced `Cannot transfer object of unsupported type`.

Copying after a producer has finished writing protects later worker use. A producer mutation **during copy creation**, especially concurrent SharedArrayBuffer writes, can yield a mixed snapshot; there is no atomic snapshot guarantee. Mutation during synchronous WASM decompression was not tested. One copy per selected compressed Buffer block costs time and external memory. In the fixture, two workers still allowed twelve copied/queued jobs; worker concurrency is not a queued-byte or process-wide memory ceiling.

## Netflow source — three separate decisions

- **BLOCKER:** The real `Other` rename repairs one top-N case but a real category `Others` can collide with generated overflow; a seven-row count fixture retained only five distinct rows. A real label is also visibly renamed. Use a distinct internal overflow identity while preserving the literal category label.
- **Ready for integration consideration:** XML scalar escaping makes SVG parseable for invalid C0 controls, unpaired surrogates and U+FFFE/U+FFFF while preserving tested valid Unicode boundaries. Very large label cost remains unmeasured.
- **BLOCKER:** Tiny donut wedge angular changes can emit a positive raw angle whose two-decimal SVG coordinates collapse to a zero-area polygon. No supported browser raster qualification occurred.
- **Already fixed at base:** NUL-containing grouped chart keys remain distinct; do not duplicate this correction.

The parent and candidate source revisions, fixture scripts, raw outputs and exact tests are listed in [SOURCE-MANIFEST.md](SOURCE-MANIFEST.md) and [TEST-EVIDENCE.md](TEST-EVIDENCE.md). Do not infer local performance gains from upstream LZ4 figures.
