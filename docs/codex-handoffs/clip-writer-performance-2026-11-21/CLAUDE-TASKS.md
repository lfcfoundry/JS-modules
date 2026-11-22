# Claude task plan: clip-writer

## Goal

Determine whether direct Blob-part construction makes the opt-in WebM output:'blob' path faster or lighter for meaningful clips without slowing small clips or changing file bytes. The first implementation should remain an experiment until supported-browser results establish a useful crossover.

## 1. Rebase and inspect

- Start from current main; review all clip-writer changes after c4c6b3a2ec6bce937b6017c427ff23c4e996cff2.
- Read AGENTS.md, TASKS.md, the module README, prior clip-writer research, and the latest private browser policy.
- Keep the public writeWebm() Uint8Array path and MP4/fMP4 untouched unless separate evidence justifies a change.
- Follow source-of-truth rules. Add module tests for shipped behavior. Update version/changelog via tools/versions only if a source/API change is approved.

## 2. Candidate designs

Benchmark these separately:

A. Current WebM path: writeWebm() full Uint8Array, then Blob([bytes]).
B. Direct WebM parts: element headers and original encoded sample views become Blob parts; calculate element sizes and Cues positions without flattening payloads.
C. Direct parts with header coalescing: combine small metadata for each SimpleBlock into one typed-array header before adding the encoded sample view. This may reduce Blob-part overhead.
D. Optional cutoff: choose A or B from total encoded bytes and/or frame/part count. Do not take a cutoff from the two Android Node points.

The W3C File API requires Blob parts to become the Blob's byte sequence. Describe this as avoiding the intermediate flattened Uint8Array, not as zero-copy.

## 3. Correctness matrix

Add read-back tests against the current writer for:

- Zero frames, one frame, no keys, key at first frame, key changes at cluster boundaries, and 1/5/26/200/900 frames.
- Equal and varying frame durations; timestamps near the 30-second cluster split; very large valid duration; invalid/negative/non-finite durations.
- Cue counts and offsets around integer-width boundaries. Assert each Cue points at the exact Cluster start and ffprobe can seek to each key frame.
- Sample views with non-zero byteOffset and exact preservation of every encoded byte.
- Blob MIME type video/webm, size, arrayBuffer equality with writeWebm(), and stability after source sample arrays are mutated.
- The existing array output and all MP4/fMP4 paths remain byte-identical.

Use the existing module parser and ffprobe/ffmpeg decode as independent checks. Include real VideoEncoder-generated chunks in browser tests; synthetic payloads are useful only for isolating the muxer.

## 4. Performance permutations

Before each test session, reread the private browsers branch. Current listed browsers are Firefox 158.0, ungoogled Chromium 156.0.8078.79-1, and WebKitGTK 2.52.6, Linux x86_64, one at a time. Do not reuse those versions without checking again.

For each engine, compare A/B/C across:

- 50, 150, 250, 500 frames and 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, and 8 MB encoded payload totals.
- Low, medium, and high bytes per frame; key intervals 1, 10, 50, and 250; sparse and dense clusters; constant and varying frame durations.
- Small slides, noisy/video-like frames, and the module's representative animation clips.
- Conversion-only, full writer finish(), and end-to-end VideoEncoder + finish() paths.
- output:'array' and output:'blob'. Keep encoder time outside mux-only measurements.
- Warm up, alternate order, use at least 30 measured repetitions, report median, p95 and spread, and verify exact bytes on every variant.
- Measure page blocking and peak memory with a repeatable browser tool. Include Blob parts count and bytes per part.

Report engine/version, OS/CPU, sample files, number of frames/keys, payload bytes, warmups, repetitions, timing boundaries, and memory method.

## 5. Decision gate

Adopt a parts or hybrid path only if:

- Byte identity, cues, frame count, seeking, Blob type and array-output behavior pass in each supported browser.
- Large-file median finish time or peak memory improves materially in at least two approved browsers.
- A measured cutoff prevents a repeatable small-clip regression above 5%.
- No sustained GC or memory spike offsets the avoided contiguous output buffer.

If no stable crossover appears, leave the code unchanged and report the evidence. The opt-in Blob option has no current browser timing for WebM, so do not claim an end-user gain from Node timings.

## 6. Handoff back

If the gate passes, implement on a separate Claude branch, run all clip-writer Node/browser qualification and version checks, record tested browser versions, update the README/changelog honestly, and return raw tables plus test outputs.