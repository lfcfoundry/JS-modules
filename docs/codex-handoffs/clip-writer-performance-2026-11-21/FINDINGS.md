# Findings: clip-writer

## Review target

- Main revision: c4c6b3a2ec6bce937b6017c427ff23c4e996cff2.
- Module version: clip-writer 1.3.0.
- Relevant code: modules/clip-writer/clip-writer.js; writeWebm() around lines 217–236 and createWriter().finish() around lines 324–332.
- The review started from a detached worktree at current main. The user's existing local branch was clean and left untouched.

## What is already well optimized

Prior clip-writer research profiled plain MP4 and fragmented MP4 writing, audio, fast-start, sidx, and Blob output. Its result was that MP4/fMP4 muxing is close to the byte-copy floor and the Blob trade differs by browser; rewriting the MP4 box code or adding Wasm is not the promising target here. See the module README for the published summary and the existing knowledge-base clip-writer research before repeating that work.

## New WebM Blob opportunity

The array writer uses cat() at each nested EBML element:

1. SimpleBlock creation concatenates frame bytes into a block.
2. Cluster creation concatenates its blocks.
3. Segment creation concatenates metadata, cues, and clusters.
4. The final file concatenation creates one more whole-file Uint8Array.
5. createWriter() with output:'blob' then constructs a Blob from that Uint8Array.

The Blob option for WebM therefore does not avoid the module's final contiguous file buffer. The direct-parts scratch candidate builds EBML element headers with known sizes and puts the original encoded frame views between those headers in the Blob parts. It computes cluster positions and iterates cue construction just as the current writer does. The public writeWebm() array return path was unchanged.

The W3C File API says Blob processing copies bytes from each BufferSource into the Blob byte sequence. So this candidate cannot be described as zero-copy: it can avoid intermediate flattening and whole-file Uint8Array allocation, while Blob still takes ownership of the bytes. WebM Cues also depend on correct Cluster positions; keep exact cue and decode checks. Sources: [W3C File API, Blob construction](https://www.w3.org/TR/FileAPI/#constructor-parameters), [Matroska Cues](https://www.matroska.org/technical/cues.html).

## Candidate results

Scratch-only direct-parts serializer, compared to current writeWebm(samples, w, h) followed by new Blob([bytes]). Inputs were real VP9 frames encoded by local ffmpeg; timing was Node-only on Android ARM64, Node v26.13.1. Twenty-five alternating measured rounds followed six warmups.

| Clip | Encoded frame bytes | Output bytes | Existing flatten then Blob | Direct Blob parts | Speed |
|---|---:|---:|---:|---:|---:|
| 320×240, 250 frames, 10 s | 581,836 | 585,751 | median 2.818 ms, p95 3.793 | median 6.886 ms, p95 10.516 | candidate 2.44x slower |
| 1280×720, 150 frames, 6 s | 2,782,877 | 2,785,344 | median 9.749 ms, p95 36.436 | median 5.551 ms, p95 12.682 | 1.76x faster |

Blob bytes matched the existing writer exactly for both clips. ffprobe 9.0.2 recognized VP9, the expected dimensions and durations, and decoded 250/250 and 150/150 frames.

The small-clip regression likely reflects the many individual Blob parts and per-frame headers. The large-clip gain suggests the avoided concatenation cost grows with payload bytes. These two points do not locate a safe threshold: frame count, bytes per frame, cluster count, and engine Blob implementation all vary. No browser or memory result is available.

## Existing versus new evidence

The earlier MP4/fMP4 work measured supported browser engines and showed a real Blob trade-off. This WebM candidate has only Node timings, even though the input payloads came from a real VP9 encoder. The current approved browsers are Firefox 158.0, ungoogled Chromium 156.0.8078.79-1, and WebKitGTK 2.52.6 on Linux x86_64; reread the private browsers branch before every browser run. This Android ARM64 host cannot qualify against that policy.

## Recommendation

Continue with a WebM-only, output-Blob experiment. Compare direct parts against the current implementation and a variant that coalesces the small EBML headers per frame to reduce Blob-part count. Measure size and part-count crossovers separately in all three approved browsers. Do not alter default Uint8Array output, MP4/fMP4, or encoder behavior based on these Node results.