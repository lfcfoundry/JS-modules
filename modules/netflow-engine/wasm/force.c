/* Copyright (c) 2026 LFC Foundry. MIT License. Netflow Map: one round of the Force arrangement's Barnes-Hut loop (engine.js forceSim) in C for WebAssembly.
   Build: sh wasm/build.sh   Embed: python3 wasm/embed.py   (see wasm/README.md). */
/* A line-for-line port of one round of forceSim: Barnes-Hut tree, repulsion, springs, gravity and move.
   The caller (JS) computes the temperature, so it matches the JS Math.pow exactly. */
typedef unsigned int u32; typedef double f64;
static inline f64 vsqrt(f64 x) { return __builtin_sqrt(x); }
static f64 *X, *mass, *FX, *tm, *tcx, *tc, *th; static int *tn, *tb, *tch, *stack, *pairs;
static int dim, NC, cap, cnt;
/* The page's own random generator (mulberry32 in engine.js): the rare "two items on the same spot" branch draws from it, so wasm and JavaScript agree even there. */
__attribute__((import_module("env"), import_name("rnd"))) extern f64 rnd(void);
static int newNode(int parent, int q) {
  int id = cnt++; f64 h = th[parent] / 2;
  th[id] = h; tm[id] = 0; tn[id] = 0; tb[id] = -1; for (int c = 0; c < NC; c++) tch[id * NC + c] = -1;
  for (int a = 0; a < dim; a++) { tcx[id * dim + a] = 0; tc[id * dim + a] = tc[parent * dim + a] + (((q >> a) & 1) ? h : -h); }
  return id;
}
static int quad(int nd, int i) { int q = 0; for (int a = 0; a < dim; a++) if (X[i * dim + a] >= tc[nd * dim + a]) q |= 1 << a; return q; }
static void ins(int nd, int i, int depth) {
  f64 m = mass[i];
  tm[nd] += m; for (int a = 0; a < dim; a++) tcx[nd * dim + a] += X[i * dim + a] * m;
  if (tn[nd] == 0) { tb[nd] = i; tn[nd] = 1; return; }
  if (tn[nd] == 1 && tb[nd] >= 0) {
    int b = tb[nd];
    if (depth >= 24 || cnt + NC >= cap) { tb[nd] = -2; tn[nd] = 2; return; }
    tb[nd] = -1; tn[nd] = 2;
    int qb = quad(nd, b), cb = tch[nd * NC + qb]; if (cb < 0) cb = tch[nd * NC + qb] = newNode(nd, qb);
    ins(cb, b, depth + 1);
  } else if (tb[nd] == -2) { tn[nd]++; return; } else tn[nd]++;
  int qi = quad(nd, i), ci = tch[nd * NC + qi]; if (ci < 0) { if (cnt >= cap) { tb[nd] = -2; return; } ci = tch[nd * NC + qi] = newNode(nd, qi); }
  ins(ci, i, depth + 1);
}
__attribute__((export_name("force_round"))) void force_round(f64 *x, f64 *ms, f64 *fx, f64 *a_tm, f64 *a_tcx, f64 *a_tc, f64 *a_th, int *a_tn, int *a_tb, int *a_tch, int *a_stack, int *prs,
                 int k, int d_, int npairs2, int capn, f64 K, f64 temp) {
  X = x; mass = ms; FX = fx; tm = a_tm; tcx = a_tcx; tc = a_tc; th = a_th; tn = a_tn; tb = a_tb; tch = a_tch; stack = a_stack; pairs = prs;
  dim = d_; NC = 1 << dim; cap = capn;
  f64 K2 = K * K, theta2 = 0.81, lo[3], hi[3]; int i, d, j;
  for (d = 0; d < dim; d++) { lo[d] = 1e308; hi[d] = -1e308; }
  for (i = 0; i < k; i++) for (d = 0; d < dim; d++) { f64 v = X[i * dim + d]; if (v < lo[d]) lo[d] = v; if (v > hi[d]) hi[d] = v; }
  f64 half = 1; for (d = 0; d < dim; d++) { f64 t = (hi[d] - lo[d]) / 2 + 1; if (t > half) half = t; }
  cnt = 1; th[0] = half; tm[0] = 0; tn[0] = 0; tb[0] = -1; for (int c0 = 0; c0 < NC; c0++) tch[c0] = -1;
  for (d = 0; d < dim; d++) { tc[d] = (lo[d] + hi[d]) / 2; tcx[d] = 0; }
  for (i = 0; i < k; i++) ins(0, i, 0);
  for (i = 0; i < k * dim; i++) FX[i] = 0;
  for (i = 0; i < k; i++) {
    int sp = 0; stack[sp++] = 0;
    while (sp) {
      int nd = stack[--sp]; if (!tn[nd]) continue;
      f64 dv0 = X[i * dim] - tcx[nd * dim] / tm[nd], dv1 = X[i * dim + 1] - tcx[nd * dim + 1] / tm[nd], dv2 = dim == 3 ? X[i * dim + 2] - tcx[nd * dim + 2] / tm[nd] : 0;
      f64 r2 = dv0 * dv0 + dv1 * dv1 + dv2 * dv2;
      if (tn[nd] == 1 && tb[nd] == i) continue;
      int leaf = tn[nd] == 1 || tb[nd] == -2 || (4 * th[nd] * th[nd]) / (r2 != 0 ? r2 : 1e-9) < theta2;
      if (leaf) {
        if (r2 < 1e-6) { dv0 = (rnd() - 0.5) * 0.1; dv1 = (rnd() - 0.5) * 0.1; if (dim == 3) dv2 = (rnd() - 0.5) * 0.1; r2 = 0.01; }
        f64 f = K2 * mass[i] * tm[nd] / r2;
        FX[i * dim] += dv0 * f; FX[i * dim + 1] += dv1 * f; if (dim == 3) FX[i * dim + 2] += dv2 * f;
      } else for (int cc = 0; cc < NC; cc++) { int ch = tch[nd * NC + cc]; if (ch >= 0 && sp < 250) stack[sp++] = ch; }
    }
  }
  for (j = 0; j < npairs2; j += 2) {
    int a2 = pairs[j], b2 = pairs[j + 1]; f64 e0 = X[a2 * dim] - X[b2 * dim], e1 = X[a2 * dim + 1] - X[b2 * dim + 1], e2 = dim == 3 ? X[a2 * dim + 2] - X[b2 * dim + 2] : 0;
    f64 dist = vsqrt(e0 * e0 + e1 * e1 + e2 * e2); if (dist == 0) dist = 1e-6; f64 fa = dist / K;
    FX[a2 * dim] -= e0 * fa; FX[b2 * dim] += e0 * fa; FX[a2 * dim + 1] -= e1 * fa; FX[b2 * dim + 1] += e1 * fa;
    if (dim == 3) { FX[a2 * dim + 2] -= e2 * fa; FX[b2 * dim + 2] += e2 * fa; }
  }
  for (i = 0; i < k; i++) {
    f64 mag2 = 0;
    for (d = 0; d < dim; d++) { FX[i * dim + d] -= X[i * dim + d] * 0.02 * mass[i]; mag2 += FX[i * dim + d] * FX[i * dim + d]; }
    f64 mag = vsqrt(mag2); if (mag == 0) mag = 1e-9; f64 step = (mag < temp ? mag : temp) / mag;
    for (d = 0; d < dim; d++) X[i * dim + d] += FX[i * dim + d] * step;
  }
}
