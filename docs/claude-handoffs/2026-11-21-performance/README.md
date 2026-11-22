# memory-compression deep performance handoff

Prepared against JS-modules main at c4c6b3a2ec6bce937b6017c427ff23c4e996cff2. Current module: modules/memory-compression 2.18.1, API 2. This is a docs-only handoff; no shipped source was changed.

## Summary

Most of the previous memory-compression performance program is already in this version: typed-array output pooling, idle cleanup, object-layer numeric pools, packColumns, view/pager/keeper, async slices, and many format-preserving hot-path wins. The current Node bench confirms strong storage savings and a useful packColumns path.

A new isolated core-packer spike is worth Claude reproducing. For 64 MB random bytes, a chunk-list path reduced measured peak RSS from about 296 MB to 183 MB and transient ArrayBuffer accounting by about 112 MB. On 32 MB random input it was about twice as fast; on repetitive input it was within run noise. It produced byte-identical output and passed the current core, object-layer, and router suites after fixing the large-pack buffer-drop policy.

This is a candidate for further qualification, not a production patch. It has not been run through the approved browsers and the high-entropy workload is intentionally a worst-case compression shape.

## Documents

- FINDINGS.md contains current memory and packColumns results plus pool-release measurements.
- SPIKE-PROTOCOL.md describes the isolated chunk-list experiment, its correctness fix, and the exact browser/performance matrix Claude should reproduce.
- CLAUDE-PLAN.md sets implementation and acceptance gates.

## Historical review

The earlier project review and raw results are in the [knowledge-base memory-compression review](https://github.com/lfcfoundry/knowledge-base/blob/main/projects/js-modules/research/memory-compression/REVIEW.md). The module has advanced substantially since that original 1.0.0 review; use the current 2.18.1 source as baseline.
