# Findings: zstd-kit performance review

## Scope and implementation

The reviewed module is \`modules/zstd-kit\`, currently using upstream Zstandard 1.5.7. Its Wasm build is size-oriented (\`-Os\`). Compression keeps a reusable \`ZSTD_CCtx\` and uses \`ZSTD_compress2\`; decompression currently calls the one-shot \`ZSTD_decompress\`.

The JavaScript wrapper has an automatic tuning path for default/level-3 compression. For input at or above 256 KiB, a printable-text classifier samples the data. If at least 85% of sampled characters are printable, the wrapper compares a default configuration with fast-strategy candidates. The reviewed source uses a 128 KiB sample cap, centered within the input, and candidates with hashLog 18 and minMatch 6 or 7. It compresses a sample to choose settings and then compresses the complete input. This means the tuner can improve ratio on structured text, but also does extra work on text-like inputs whose tuned parameters do not help.

The upstream API documents that useful parameter settings depend on compression level and source size. It also recommends reusing compression/decompression contexts when processing repeated jobs. These are reasons to test workload-aware policies and context reuse, not proof that either is faster in this wrapper. See the [Zstandard C API header](https://github.com/facebook/zstd/blob/dev/lib/zstd.h).

## Best current candidate: smaller tuner sample and hash table

The isolated candidate changed only:

- sample cap: 128 KiB to 32 KiB
- tuned hashLog: 18 to 17; fast strategy and minMatch values remained unchanged

Paired, alternating measurements used 15 measured rounds per case. Every candidate output was round-tripped before timing. These are synthetic workloads on Node 26.13.1 / V8 14.6, Android ARM64, native Zstandard 1.5.7. They are exploratory host data, not browser or release claims.

| Workload | Size | Current time / bytes | Candidate time / bytes | Observed change |
| --- | ---: | ---: | ---: | --- |
| Structured logs | 1 MiB | 2.2251 ms / 38,330 B | 1.7540 ms / 38,118 B | 21.2% faster; 0.55% fewer bytes |
| Structured logs | 4 MiB | 6.6949 ms / 169,721 B | 6.1002 ms / 169,490 B | 8.9% faster; 0.14% fewer bytes |
| Mixed printable text | 1 MiB | 7.7016 ms / 228,796 B | 6.6758 ms / 228,796 B | 13.3% faster; same bytes |
| Mixed printable text | 4 MiB | 28.2036 ms / 939,477 B | 27.1276 ms / 939,477 B | 3.8% faster; same bytes |
| Logs with a 20% random tail | 1 MiB | 2.2787 ms / 241,158 B | 1.7000 ms / 241,245 B | 25.4% faster; 87 B (0.036%) more |
| Logs with a 20% random tail | 4 MiB | 6.4076 ms / 974,660 B | 5.7825 ms / 974,549 B | 9.8% faster; 0.011% fewer bytes |

These results suggest the smaller sample and hash table are worth qualifying, especially because the candidate does not materially change ratio on this set. Do not assume the same effect on real user data: the fixtures are generated and the timings include host/runtime behavior.

## Tuner benefit and cost both matter

Compared with the no-tune variant on the structured-log fixture at 4 MiB, the current tuner measured 6.6949 ms and 169,721 bytes versus 7.9788 ms and 235,244 bytes. On the 4 MiB log-plus-random-tail fixture it measured 6.4076 ms and 974,660 bytes versus 8.6395 ms and 1,024,348 bytes. The tuner provides a substantial ratio win on these fixtures.

The tradeoff changes for mixed printable content. At 1 MiB, current tuning measured 7.7016 ms and 228,796 bytes versus 6.3634 ms and the same 228,796 bytes with tuning disabled. At 4 MiB the tuner was about 5.5% slower with the same compressed size. A separate 14-round run at the 256 KiB eligibility boundary found 13.5% fewer bytes but about 48% more compression time on the log fixture. At that size, the source’s sample length is already input-length/8 (32 KiB), so lowering the cap alone does not reduce sample bytes.

The next design question is not simply whether the tuner is “fast.” Measure whether its classifier can distinguish workloads that benefit, and whether a cheap eligibility rule can avoid paying sample-compression cost where it does not.

## Lower-priority experiments

### Reused decompression context

An isolated C candidate retained a \`ZSTD_DCtx\` and called \`ZSTD_decompressDCtx\`, releasing the decoder context alongside the compressor context. It passed the zstd-kit suite. In a 21-round focused run, 4 MiB random decompression moved from about 2.549 ms to 2.437 ms (about 4.4% faster); small and typical inputs were neutral, and 4 MiB text was about neutral. An earlier larger result did not repeat. Treat this as inconclusive until it wins repeatedly in approved browsers and realistic repeated-call workloads.

### Compiler flags

Temp builds used the pinned Zstandard 1.5.7 source with Clang 21.1.8. Compared with \`-Os\`, \`-O3\` increased full/decoder Wasm from 374,601 / 57,702 bytes to 478,692 / 69,491 bytes (+27.8% / +20.4%). \`-O3 -msimd128\` produced 485,200 / 72,982 bytes (+29.5% / +26.5%). Focused host profiles showed no reliable broad performance gain. Keep these flags out of the main proposal unless browser profiles show a worthwhile speed improvement within an explicit bundle-size budget.

The checked-in artifacts were built with Clang 18; the review host only had Clang 21. Do not use these alternate compiler outputs as a byte-for-byte reproducibility check for the committed artifacts.

## Research implications

The official C API describes level- and source-size-dependent parameter selection, recommends context reuse for repeated work, and identifies \`ZSTD_compress2\` for advanced parameter use. The memory-constrained-environment guide also makes the memory/parameter tradeoff explicit. Those references support testing size- and workload-aware tuning, context reuse, and memory cost together. They do not establish that any specific candidate wins in zstd-kit.

Zstandard 1.5.7 is already the module baseline. Review the [official release notes](https://github.com/facebook/zstd/releases) before proposing an upstream upgrade; do not infer a newer stable release from development-branch documentation.

## Review decision

1. Promote the 32 KiB / hashLog 17 candidate to a controlled browser experiment.
2. In parallel, test a lower-cost eligibility policy for mixed and boundary workloads without discarding the measured ratio benefit on structured logs.
3. Require exact input/output correctness and both zstd-kit and LFC-pack qualification for any shared-source candidate.
4. Keep context reuse and compiler flags as secondary experiments pending stronger measurements.
