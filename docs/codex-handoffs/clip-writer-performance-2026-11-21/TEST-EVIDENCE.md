# Test and experiment evidence: clip-writer

## Baseline on reviewed main

Revision: c4c6b3a2ec6bce937b6017c427ff23c4e996cff2.

Command: node modules/clip-writer/test/run.js

Result: all passed. Existing coverage includes MP4, fMP4, WebM EBML/cluster/cue read-back, 300 random sample sets for WebM, Blob and fast-start MP4/fMP4, audio, and sidx.

No source files were changed.

## Direct-parts candidate

The scratch candidate was an independent WebM Blob serializer, not an edit to the production module. It was compared byte for byte with the reviewed writer using two encoded VP9 IVF streams:

- 320×240, 25 fps, 10 seconds, 250 frames; 581,836 encoded bytes.
- 1280×720, 25 fps, 6 seconds, 150 frames; 2,782,877 encoded bytes.
- Encoded with ffmpeg libvpx-vp9, realtime deadline, cpu-used 8, key interval 50.
- Candidate Blob arrayBuffer exactly equaled the existing writer's output for each stream.
- ffprobe 9.0.2 read the VP9 track, dimensions, duration, and every frame (250/250 and 150/150).

The candidate and output files are scratch artifacts under /data/data/com.termux/files/usr/tmp, not repository changes.

## Timing

Host: Android ARM64; Node v26.13.1; ffprobe 9.0.2. Twenty-five alternating measured rounds after six warmup calls. The timed operation included WebM serialization and Blob construction, and checked output size. Results:

| Input | Current median / p95 | Direct-parts median / p95 | Candidate ratio |
|---|---:|---:|---:|
| 581,836 frame bytes / 250 frames | 2.818 / 3.793 ms | 6.886 / 10.516 ms | 2.44x slower |
| 2,782,877 frame bytes / 150 frames | 9.749 / 36.436 ms | 5.551 / 12.682 ms | 1.76x faster |

The large-clip control had high p95 variability. Treat the median as a candidate result for this Node build only. No browser timing or peak-memory measurement was performed.

## Guess about the cause, not a measured result

The candidate gives Blob many more parts and small element-header views. That overhead appears to dominate the smaller case, while avoiding repeated full-payload concatenation helps the larger case. Measure part count, frame count, bytes per frame, GC, and peak memory before selecting a threshold.

## Browser qualification not run

Current policy is Linux x86_64: Firefox 158.0, ungoogled Chromium 156.0.8078.79-1, and WebKitGTK 2.52.6, one at a time. This host is Android ARM64, so no approved-browser run is claimed. Re-read the private knowledge-base browsers branch before browser testing.