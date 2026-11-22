# memory-compression findings

## Baseline and shipped work

- Reviewed main revision c4c6b3a2ec6bce937b6017c427ff23c4e996cff2.
- Current version is 2.18.1, API 2.
- The current code already has a large performance and memory feature set: core output-buffer reuse capped at 8 MiB, object-layer Float64Array pooling capped at 48,000,000 bytes, 2-second idle cleanup, async packing/unpacking, worker pools, packColumns, view, pager, keeper, and explicit buffer release.
- Recent versions have already optimized text patterns, numeric pools, shaped rows, sparse/UUID warmup, and several browser-specific paths. Do not repeat those historical experiments without first finding a regression in current main.

## Existing memory benchmark, rerun here

Command: node --expose-gc modules/memory-compression/bench/mem-run.js.

| Workload | Live objects | Packed fast | Packed small | view open | Objects / packed fast |
|---|---:|---:|---:|---:|---:|
| nfm-links, 300,000 | 116.4 MB | 7.5 MB | 6.2 MB | 7.5 MB | 16x |
| nfm-nodes, 100,000 | 55.3 MB | 2.0 MB | 1.7 MB | 2.0 MB | 28x |
| api-users, 50,000 | 29.9 MB | 0.7 MB | 0.6 MB | 0.7 MB | 41x |
| events, 200,000 | 46.2 MB | 1.6 MB | 1.1 MB | 1.6 MB | 29x |

For the 100,000-node view, 1,000 random get(i) calls took 0.37 ms total; 1,000 field(i, "x") calls took 0.07 ms; full unpack took 33.0 ms. This supports keeping inactive scenes packed and restoring fields/pages on demand. It does not claim that compression fixes the live JavaScript object graph of a running map.

## packColumns comparison

With 100,000 deterministic api-users rows, pack(rows) and packColumns(columns) produced byte-identical 1,525,256-byte files. Six alternating Node runs had medians of 127.66 ms for row objects and 86.35 ms for columns; packColumns was 0.676x the row-pack time (about 32% faster). Extracting columns from the row objects was excluded. This is useful when the application already owns columnar data; it is not a fair win if a caller must transpose rows into columns on every save.

Host: Node v26.13.1, Android arm64. Browser-specific results remain to be re-measured.

## Pool and release behavior

A 300,000-link pack returned 7.49 MB. Before pack, arrayBuffers was 0.4 MB. After the pack and GC, it was 31.1 MB while the packed result was still held. Calling freeBuffers() reduced this to 8.4 MB; the remaining amount included the still-live 7.49 MB result. On a separate run, after the packed result was dropped and the module pools and core memory were trimmed, arrayBuffers returned to 0.9 MB.

After the 2.3-second idle interval, with the result still held, arrayBuffers was 8.4 MB and process RSS fell from 181.6 MB after GC to 157.0 MB. The release behavior is working; memory held by callers and allocator RSS are separate from module-owned ArrayBuffers. This means callers with a known memory-pressure event can use freeBuffers() and the core trim API, while normal repeated packing benefits from reuse.

The object layer's number pool is bounded to 48 MB and the core pack buffer to 8 MB. The Firefox-only plain-array pool has a count cap; its memory should be included when testing Firefox retention.

## Core-packer peak-memory spike

For a fresh process holding 64 MB of crypto-random Uint8Array input, current core.pack produced a 64 MB output (as expected for incompressible data). Before GC, process RSS rose from 114.9 MB to 295.8 MB and process.memoryUsage().arrayBuffers from 64.4 MB to 240.4 MB. After GC, arrayBuffers was 128.4 MB (input plus output). The extra 112 MB before GC was temporary allocation churn from the growing output path. Dropping output and trimming returned ArrayBuffer accounting to the input baseline.

The process high-water value came from process.resourceUsage().maxRSS, documented by Node as ru_maxrss in KiB: https://nodejs.org/api/process.html#processresourceusage. It is a per-process peak measure, not a browser heap counter. The random input is a stress case for incompressible bytes, not a representative compression ratio.

## Source pointers

- modules/memory-compression/src/core.js: pack() around lines 803-861; packRoom()/dropPackBuffer() around 863-871.
- modules/memory-compression/src/jso-layer.js: numeric pools and idleSoon() around lines 46-93.
- modules/memory-compression/src/jso-layer.js: finishPack() and packColumns() around lines 2868 onward.
- modules/memory-compression/src/pool.js: workers used by packAsync().
- modules/memory-compression/bench/mem-run.js and bench/README.md.
