# Findings: image-decode

## Review target

- GitHub main at review time: c4c6b3a2ec6bce937b6017c427ff23c4e996cff2.
- Module version: image-decode 1.2.2.
- Primary path: modules/image-decode/image-decode.js, especially toBlob() around lines 110–138 and load() around line 216.
- Working tree was clean. Experiments used scratch copies under /data/data/com.termux/files/usr/tmp/lfcfoundry-image-walker-review-2026-11-21; no source, tests, README, or generated output was changed in the repository.

## Current pipeline and opportunity

For a data: address with a base64 marker, toBlob() currently strips JavaScript whitespace from the encoded suffix, calls atob, allocates a Uint8Array, copies each character code into that array, and creates a Blob. This work is synchronous and happens before the asynchronous image decode. In the Chromium bitmap strategy, createImageBitmap moves image decoding off the main thread, but it cannot remove the preceding base64 parse and byte-copy work on the calling thread.

The other source forms—Blob, ArrayBuffer, typed-array views, percent-encoded data URLs, and fetched URLs—do not use this base64 path and should remain untouched.

## Candidate

A scratch-only version first checks whether Uint8Array.fromBase64 exists and uses it on the encoded suffix. If the method is missing or rejects, it falls back to the existing atob plus byte-copy implementation. This preserves compatibility with engines without the API and preserves the legacy handling of whitespace outside the ASCII set accepted by the standard API.

The TC39 base64 API specification defines Uint8Array.fromBase64 and its base64 parsing behavior, including ASCII whitespace handling: https://tc39.es/proposal-arraybuffer-base64/spec/. Feature detection and fallback remain necessary for this module's browser support range.

The candidate removed the JavaScript binary string and explicit per-byte copy loop on the normal path. It did not change the browser image decoder, MIME sniffing, strategy selection, worker path, or loadAll scheduling.

## Measurements

Environment: Node v26.13.1, V8 14.6, Android ARM64. Timings are paired/alternating local microbenchmarks; treat them as candidate evidence for this host, not browser performance claims.

| Base64 bytes | Existing atob and copy | fromBase64 candidate | Speedup |
|---:|---:|---:|---:|
| 1 KiB | 0.059 ms | 0.006 ms | 10.01x |
| 64 KiB | 0.248 ms | 0.045 ms | 5.56x |
| 1 MiB | 3.420 ms | 1.061 ms | 3.22x |
| 3.88 MB | 12.105 ms | 3.940 ms | 3.07x |
| 8 MiB | 25.271 ms | 8.935 ms | 2.83x |

A separate full ImageDecode.load harness used a fake createImageBitmap that only consumed the Blob and returned its byte length. It therefore measured data URL handling, base64 conversion, Blob construction, and Promise overhead, but not image parsing or decoding.

| Encoded payload | Existing path | Candidate | Speedup |
|---:|---:|---:|---:|
| 256 KiB | 1.113 ms | 0.472 ms | 2.36x |
| 1.4 MB | 6.087 ms | 2.151 ms | 2.83x |
| 3.88 MB | 14.159 ms | 5.351 ms | 2.65x |

An exploratory fresh-process Node RSS check for an 8 MiB payload reported median peak-RSS increases of 18.1 MiB for the existing path and 7.1 MiB for the candidate (three runs each). This is a process-level high-water-mark measurement and is not a browser heap or decoded-image memory result.

## Correctness evidence and caveats

- The candidate copy passed the module's 31-test suite.
- A fake-decoder differential harness compared 110 cases covering random bytes, ASCII whitespace, NBSP fallback, malformed inputs, and forced legacy fallback. Bytes and accept/reject outcomes matched.
- A base64 semantic enumeration compared 54,241 strings of length at most four, with no behavior differences.
- These checks do not replace real-browser testing. More malformed/padding cases, large payloads, MIME sniff results, and all supported source forms need to be tested in the repository's actual harness.
- The fake decoder deliberately did not decode an image. Do not report the numbers above as image decode speedups or end-to-end page results.

## Existing work to preserve

The module already selects different decode strategies by engine and has a worker route for eligible bitmap decoding. Prior image research also measured loadAll concurrency tradeoffs. Keep that work separate: this candidate targets synchronous base64-to-Blob conversion and provides no evidence to change the default concurrency or decoder selection.

## Recommendation

Advance the native base64 API candidate to browser qualification. Keep the old implementation as fallback. Do not ship until the behavior matrix and real-browser measurements in CLAUDE-TASKS.md pass.