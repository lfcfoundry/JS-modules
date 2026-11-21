# Findings

## Baseline reviewed

The module on current `main` is 2.1.2/API 2. The local module matches current `main`. Existing work already includes SIMD decoding, block-list SIMD intersection, and 8-way interleaving in `getMany` and `nextGEQMany` (see `modules/elias-fano/CHANGELOG-DEV.md`).

The flat-list sampler is `SAMPLE_SHIFT = 7` in `modules/elias-fano/elias-fano.js`: select samples are spaced every 128 ones or zeros. The JS `nextGEQ` path selects the start of the target high bucket and then checks values in that bucket linearly. The Wasm batch path keeps eight queries in flight, then performs the corresponding select and bucket scan for each query. Relevant source: `modules/elias-fano/elias-fano.js` around `SAMPLE_SHIFT`, `layout`, `_sel0`, `_nextJS`, and `nextGEQMany`; `modules/elias-fano/wasm/ef.c` around `select0`, `nextOne`, `ef_next`, and `ef_next_many`.

## Lead A: bounded tail work for `nextGEQ`

### Candidate

The temporary C prototype tries two bounded fallbacks:

1. While selecting a zero, after four high-bit words it uses the one-sample array to locate the equivalent select-zero position. This avoids unbounded work when a long one-run separates zero samples.
2. While scanning a high bucket, after eight values it binary-searches the remaining values with `getOne` instead of continuing a potentially huge low-bit scan.

The prototype applied both paths to the scalar export and retained the 8-way batch structure in the batch export. It is a scratch experiment, not production code. Intersection uses a separate `nextOneV` path and still needs examination.

### Fixture and latest paired result

The fixture has 200,000 values: 100,000 copies of 128, followed by `1,000,000 + 20 * (i - 100,000)`. It uses the stock shift-7 blob format. Times below are this Android ARM64 / Node 26.13.1 / V8 14.6 process, not browser results.

| Work | Existing C baseline | Adaptive C candidate | Change |
|---|---:|---:|---:|
| Scalar `nextGEQ(129)` | 196.6 μs | 5.2 μs | 37.7× faster |
| Batch of 8 `nextGEQ(129)` | 1,512.9 μs | 41.9 μs | 36.1× faster |
| Scalar `nextGEQ(128)` immediate answer | 0.050 μs | 0.049 μs | effectively even |
| Scalar `nextGEQ(136)` just after the long run | 1.445 μs | 1.054 μs | 1.37× faster |
| Random batch, 10,000 queries, duplicate fixture | 486.7 μs | 484.6 μs | 0.4% faster |
| Random batch, 10,000 queries, 500k spread fixture | 544.1 μs | 547.4 μs | 0.6% slower |

The public JS wrapper on the 8-query pathological case measured 1.55 ms per batch, close to the direct C baseline. The output values matched the existing implementation on 20,000 random scalar queries and 20,000 random batch results across the duplicate and spread fixtures, as well as the explicit boundary probes. A separate JS version of the fallback passed 38,400 generated checks; it is supplementary evidence, not validation of the C code.

Scalar random timings were less stable than the batch results, so do not use them to claim a general scalar speedup. Reproduce with paired rounds, noise checks, and browser measurements.

## Lead B: sampling quantum

A same-process paired comparison used 1,000,000-value spread, dense, and clustered inputs; each operation used a 20,000-query batch. Fifteen paired rounds alternated which shift ran first. Answers matched for every output. Shift 5 was compared with the existing shift 7.

| Shape | Shift 7 bytes | Shift 5 bytes | Extra bytes | `nextGEQMany`, random: shift 7 → 5 | `getMany`, random: shift 7 → 5 |
|---|---:|---:|---:|---:|---:|
| Spread | 1,336,992 | 1,614,120 | +20.8% | 1.087 → 1.007 ms (7.9% faster) | 0.886 → 0.779 ms (12.1% faster) |
| Dense | 437,648 | 625,176 | +42.9% | 1.017 → 0.929 ms (9.4% faster) | 0.875 → 0.789 ms (9.8% faster) |
| Clustered | 1,100,720 | 1,311,088 | +19.1% | 0.927 → 0.797 ms (16.3% faster) | 0.894 → 0.839 ms (6.2% faster) |

Sorted batches showed similar gains. This is a speed/size curve, not an unconditional improvement. The original Elias–Fano paper describes this same sampling-space trade-off. The current reader recomputes layout using the compiled `SAMPLE_SHIFT` and checks header field `s` against it. Simply changing 7 to 5 would reject existing shift-7 blobs. Any variable/default shift must deliberately support existing saved blobs or introduce a reviewed format/API break.

Shift 6 is an unqualified middle point; run it in the same paired matrix before considering any default or option.

## Other observations

- Naturally sorted batch indices were around 6–15% faster than random ordering in the earlier Node profiles. The measurements exclude the cost of sorting, so only naturally ordered workloads make this a likely win.
- A sequential cursor prototype did not beat the 8-way batch kernel on the tested sorted-query workload. Revisit only if real callers provide monotone query streams.
- Million-value builds were fastest with `Uint32Array` input and Wasm ready. Plain arrays add validation/conversion cost and often erase the Wasm advantage. A fused C validation/build prototype did not produce a consistent enough gain to recommend.

## Decision

Prioritize the adaptive `nextGEQ` candidate because the batch-path tail improvement is large and ordinary tested batch workloads stayed within 1%. Keep it experimental until all paths and approved browsers pass. Evaluate shift 5/6/7 as a Pareto curve and retain shift 7 by default until compatibility and a storage budget are settled.
