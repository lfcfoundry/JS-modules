/* Copyright (c) 2026 LFC Foundry. MIT License.
 * The rounds of the what-if solver of walker-sim (absorb in walker-sim.js), in plain C compiled to WebAssembly.
 * sweeps() does what the JavaScript loop does: round after round, each item takes the odds of its ways times the odds of the items they lead to, until the biggest change
 * is under 1e-12 or maxS rounds are done. The additions are made in the same order as in JavaScript (the ways of an item in eStart order, the change summed in class order)
 * and the file is built with -ffp-contract=off, so every number comes out bit for bit the same.
 * out[0] = the last change, out[1] = the change before it, out[2] = the rounds done. */
typedef int i32; typedef double f64;
#define EXPORT __attribute__((visibility("default")))
static f64 once(i32 nOrd, i32 K, const i32 *ord, const i32 *eS, const i32 *tK, const f64 *pe, f64 *c, f64 *acc) {
  f64 dl = 0;
  for (i32 oi = 0; oi < nOrd; oi++) {
    i32 b = ord[oi] * K;
    for (i32 q = 0; q < K; q++) acc[q] = 0;
    for (i32 k = eS[oi]; k < eS[oi + 1]; k++) {
      const f64 *src = c + tK[k]; f64 p = pe[k];
      for (i32 q = 0; q < K; q++) acc[q] += p * src[q];
    }
    f64 d = 0;
    for (i32 q = 0; q < K; q++) { f64 a = acc[q], o = c[b + q]; f64 df = a - o; d += df < 0 ? -df : df; c[b + q] = a; }
    if (d > dl) dl = d;
  }
  return dl;
}
EXPORT i32 sweeps(i32 maxS, i32 nOrd, i32 K, const i32 *ord, const i32 *eS, const i32 *tK, const f64 *pe, f64 *c, f64 *acc, f64 *out) {
  f64 delta = 1.0 / 0.0, prev = 1.0 / 0.0; i32 s = 0;
  while (s < maxS) { prev = delta; delta = once(nOrd, K, ord, eS, tK, pe, c, acc); s++; if (delta < 1e-12) break; }
  out[0] = delta; out[1] = prev; out[2] = s; return s;
}
