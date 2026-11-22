# memory-compression core output-builder spike

## Question

Can large core.pack calls avoid allocating and then discarding a succession of geometrically grown output buffers when the input is incompressible, without changing the container bytes or slowing normal compressible input?

## Scratch experiment

This was implemented only in an untracked scratch copy of the generated module, not in the repository.

For raw byte input at or above 8 MiB:

1. Keep the header and each chunk descriptor as small byte parts.
2. If a chunk is stored raw, keep a view into the caller's input instead of copying that chunk into the growable output buffer.
3. If a chunk is compressed, copy its bytes because the encoder reuses its scratch storage.
4. Once all chunk sizes are known, allocate the final output at the exact total size and copy the parts once.
5. Drop any previously retained small core output buffer on entry to the large path. The first prototype missed this rule; the core test caught it. After adding the drop, all suites passed.

This keeps the public result an independent Uint8Array with an exact-size backing buffer. It does not expose a view into a reusable internal pool.

## Measured results

Host: Node v26.13.1, Android arm64.

| Input | Current path | Chunk-list spike | Result |
|---|---:|---:|---|
| 32 MiB crypto-random bytes, fast | 64.01 ms median | 32.12 ms median | 0.50x time |
| 32 MiB repeating byte pattern, fast | 8.75 ms median | 8.97 ms median | 1.03x; sample ranges overlap |
| 64 MiB crypto-random bytes, process RSS peak | 295.8 MB | 182.8 MB | about 113 MB lower |
| 64 MiB crypto-random bytes, ArrayBuffers before GC | 240.4 MB | 128.4 MB | 112 MB lower |

Timing used six alternating runs per implementation on the same input and compared median values. The memory figures came from separate fresh processes using the same 64 MiB source size; maxRSS is a process high-water mark. The six timing pairs and one fresh-process memory run are promising, but not enough for a release claim.

A separate correctness sweep compared current and spike bytes and round-tripped both implementations at sizes 8 MiB-1, 8 MiB, 8 MiB+1, and 16 MiB; fast/small modes; 64 KiB and 1 MiB chunks; checksum on. It also tested 8 MiB+17 random and repetitive input. Outputs matched byte for byte.

## Qualification after the policy fix

The scratch module passed:

- test/core.js: 25 checks with WebAssembly and 25 checks with --js-only.
- test/run.js: 97 object-layer checks.
- test/router.js: 15 checks.

This is stronger than a round-trip-only check but does not replace FULL=1 fuzz, minified-file checks, or browser tests.

## Risks and open questions

- The 8 MiB input threshold is borrowed from the current pool limit; it has not been tuned.
- Very small chunk sizes can create many part objects. Test 4 KiB through 4 MiB chunks and large input sizes.
- Compressed chunks still need owned copies before the final join. Test fast, small, balanced routing, shuffled numeric typed arrays, float and integer data, and check:true.
- Confirm the module drops a prior kept buffer for a large pack, calls its idle cleanup hook where required, and never returns a view that aliases input or another result.
- Compare exact packed bytes across JavaScript and WebAssembly paths and across the current version reader.
- Node arrayBuffers before GC counts short-lived allocations before collection; browser memory instrumentation differs. Use fresh child processes for RSS comparisons. Node documents arrayBuffers accounting at https://nodejs.org/api/process.html#processmemoryusage and maxRSS at https://nodejs.org/api/process.html#processresourceusage.
- WebAssembly memories grow in 64 KiB pages. The helper is recreated when it must release larger linear memory; see https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/grow.

## Reproduction guide for Claude

Add a test-only benchmark under modules/memory-compression/bench; do not add timing assertions to unit tests. Run one fresh Node process per peak-memory cell with --expose-gc. Generate repeatable high-entropy bytes and a compressible pattern without including generation time in pack timing. Report input bytes, packed bytes, mode, chunk size, checksum flag, peak RSS, ArrayBuffers before/after GC, and pack duration.

Use the shipped module as control. Rebuild generated artifacts from src only after the spike is fully reviewed. Keep the spike isolated until the acceptance table in CLAUDE-PLAN.md passes.
