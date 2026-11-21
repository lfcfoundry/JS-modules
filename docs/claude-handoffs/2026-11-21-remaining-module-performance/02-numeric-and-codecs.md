<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Numeric and codec modules

For each codec, use fixtures made by an independent implementation when available. Check decoded bytes before measuring speed. Include initialization cost, compressed size, peak output size, and steady-state work as separate results. Malformed-input checks must not allocate from an untrusted claimed size without the module’s existing guards.

## elias-fano

**Base:** `elias-fano` 2.1.2. Start with `modules/elias-fano/test/run.js` and the focused `compact`, `blocks`, `lists-many`, `intersect`, `partitioned`, and fuzz checks.

Vary list length (0, 1, small, 1k, 100k, largest safe), gap distribution (constant, clustered, sparse tail, alternating small/large), list count, and shared versus separate storage. Exercise `get`, lower-bound search, intersection, block iteration, and batched decode at first/last and absent values. Test duplicate, unsorted, negative, and out-of-range inputs according to the documented acceptance rules; do not silently normalize invalid lists.

Compare every query to a sorted JavaScript array oracle. Include exact boundaries around word/byte/block transitions and WebAssembly integer-width limits. For performance, report build/encode, lookup, intersection, and multi-list decode separately; use small and large lists and both WebAssembly-ready and JavaScript fallback routes. Size wins alone do not excuse changed values or lookup order.

## lz4-kit

**Base:** `lz4-kit` 1.1.2. Start with `modules/lz4-kit/test/run.js`; check the supported raw-block and standard-frame API in the README.

Cross input type (Uint8Array, other typed view, ArrayBuffer, string), content (empty, repetitive, natural-language text, random bytes, high entropy), size (0, 1, block edge, frame edge, large), mode (fast, each documented high-compression level, acceleration), and output form. Decode externally produced standard frames and compare produced frames with the official LZ4 CLI/library when available. Test concatenated frames and raw blocks with explicit sizes.

Corrupt headers, truncate at every structural boundary, alter content size/checksum, pass wrong decode size, and reuse/detach input buffers. Assert bounded failure, no partial success, exact bytes, and stable error contract. Benchmark `init()` separately from compression/decompression; report ratio and latency together, and never compare raw-block sizes with framed sizes without labeling overhead.

## lzma-decode

**Base:** `lzma-decode` 1.7.1. Start with `modules/lzma-decode/test/run.js`; Python `lzma` reference streams already form an independent correctness source.

Cover both shipped decoder routes (WebAssembly and readable JavaScript), normal and minified builds, tiny/large dictionaries, short/long matches, incompressible data, repeated bytes, and size boundaries. Include empty output, one byte, truncation in header/range data/dictionary references, invalid properties, wrong expected size, and excessive declared output. Run known-good fixtures from Python and preserve them by input hash as existing tests do.

Assert byte identity, no hangs, bounded rejection of invalid streams, and unchanged strict-CSP use. Measure compile, first decode, warm decode, and peak output memory separately at small, 3 MB, and largest stable fixtures. Do not compare with an npm package unless its version and exact options are pinned; the primary gate is parity with the independent decoder.

## zstd-kit

**Base:** `zstd-kit` 1.0.0. Start with `modules/zstd-kit/test/run.js` and the README’s support for full and decode-only files, standard frames, XXH64, and CRC-32.

Use reference frames from the official zstd tool/library across empty, tiny, repetitive, text, and incompressible content; cover sizes around the 256 KiB level-3 sample-search threshold and larger safe files. Exercise levels -7, 0, 3, 22 and representative interior values, full/decode-only builds, known and omitted content sizes, and concatenated input if supported. Verify checksums against independent vectors.

Truncate headers, block headers, payloads and checksums; corrupt declared sizes; test wrong caller-provided size; and verify safe errors rather than large allocations. Compare decoded bytes with the reference. Report output size, init/compile, compression, and decompression independently. Do not select a different default level without a size-versus-time report on all approved browsers.
