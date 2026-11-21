# Test and experiment evidence: image-decode

## Repository baseline

Source revision: c4c6b3a2ec6bce937b6017c427ff23c4e996cff2.

- node modules/image-decode/test/run.js — 31 passed, 0 failed.
- The current module source was not modified.
- Current browser qualification was not run.

## Candidate correctness checks

Scratch candidate: /data/data/com.termux/files/usr/tmp/lfcfoundry-image-walker-review-2026-11-21/image-decode-native-b64

- Candidate copy: 31 passed, 0 failed.
- Full-module fake-decoder differential: 110 cases; exact bytes and accept/reject behavior matched for the covered inputs.
- Pure base64 semantic enumeration: 54,241 strings, lengths 0 through 4; no differences between the legacy atob path and native-plus-fallback candidate.
- Covered ASCII whitespace, NBSP, random binary payloads, malformed strings, and forced legacy fallback.
- The fake decoder observed the Blob bytes and did not parse PNG/JPEG/WebP data. The results say nothing about image decoding itself.

## Timing method and measurements

Host: Android ARM64, Node v26.13.1, V8 14.6. Direct conversion used 15 measured alternating rounds after warmup. Full-load measurements used a fake createImageBitmap and 17 measured rounds in the earlier harness. Output bytes matched.

| Operation | Payload | Existing median | Candidate median | Ratio |
|---|---:|---:|---:|---:|
| Base64 to Uint8Array | 1 KiB | 0.059 ms | 0.006 ms | 10.01x |
| Base64 to Uint8Array | 64 KiB | 0.248 ms | 0.045 ms | 5.56x |
| Base64 to Uint8Array | 1 MiB | 3.420 ms | 1.061 ms | 3.22x |
| Base64 to Uint8Array | 3.88 MB | 12.105 ms | 3.940 ms | 3.07x |
| Base64 to Uint8Array | 8 MiB | 25.271 ms | 8.935 ms | 2.83x |
| Full load with fake decoder | 256 KiB | 1.113 ms | 0.472 ms | 2.36x |
| Full load with fake decoder | 1.4 MB | 6.087 ms | 2.151 ms | 2.83x |
| Full load with fake decoder | 3.88 MB | 14.159 ms | 5.351 ms | 2.65x |

These are exploratory measurements on one non-target host. They are not cross-engine results and do not include image decode, paint, worker startup, or browser scheduling.

## Memory probe

The 8 MiB data URL was constructed before sampling. Three fresh Node processes per variant used --expose-gc and process max-RSS deltas. Median peak-RSS increase was 18.1 MiB for the old path and 7.1 MiB for the candidate. Small sample, coarse process-level metric; no browser memory conclusion is supported.

## Browser runs not performed

The host is Android ARM64. The current approved browser matrix is Linux x86_64 only: Firefox 158.0, ungoogled Chromium 156.0.8078.79-1, and WebKitGTK 2.52.6. No approved browser result is claimed. Reread the private knowledge-base browsers branch before starting browser qualification, because this matrix can change.