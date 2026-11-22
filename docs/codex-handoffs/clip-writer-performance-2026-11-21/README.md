# clip-writer performance review

Claude handoff based on JS-modules main at c4c6b3a2ec6bce937b6017c427ff23c4e996cff2 (2026-11-21). This branch has research documents only; no module source, tests, or generated files changed.

## Read in this order

- FINDINGS.md — current writer paths, direct-parts Blob experiment, measurements, and prior work.
- TEST-EVIDENCE.md — baseline tests, byte identity, ffprobe results, benchmark method, and host limits.
- CLAUDE-TASKS.md — implementation choices and an exact browser/permutation matrix.

## Main finding

The MP4 and fragmented-MP4 Blob paths pass their box/sample parts directly to Blob. The WebM Blob path first calls the array writer, which flattens nested EBML elements and all frame data into one Uint8Array, then passes that full-file array to Blob. A scratch builder that emits Blob parts directly was byte-identical and ffprobe decoded all frames. In Node it was slower on a 0.58 MB clip and 1.76x faster on a 2.78 MB clip. Qualify a size/part-count crossover in real browsers before adopting it.

## Handoff

Keep normal Uint8Array WebM output unchanged. Limit any experiment to createWriter output:'blob'. Blob construction still processes/copies BufferSource bytes; the candidate avoids the module's final whole-file flattening and repeated nested concatenations, not all copying.