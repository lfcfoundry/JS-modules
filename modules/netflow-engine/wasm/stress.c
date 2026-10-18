/* Copyright (c) 2026 LFC Foundry. MIT License.
 * Netflow Map's stress layout (pair building, the one-time shuffle, the forward/backward sweeps) and the overlap push-apart, in C for WebAssembly.
 * Mirrors stressComponent and separate in src/engine.js step for step, so the picture is the same to the last digit. Pairs are kept as two item numbers
 * (4 bytes each) plus one Uint16 "hop code" (the hop count, +512 when the pivot weight applies); distance and weight come from two 1,024-entry tables
 * the page fills with the same float32 rounding the JavaScript used, so 10 bytes a pair instead of 16. All memory is handed in by the page. */
typedef int i32; typedef unsigned int u32; typedef unsigned short u16;
#define EXP(n) __attribute__((export_name(n)))
static i32 *off_, *nbr_, *dist_, *queue_;
static i32 K;
static void bfs(i32 src) {
  for (i32 i = 0; i < K; i++) dist_[i] = -1;
  dist_[src] = 0; queue_[0] = src; i32 head = 0, tail = 1;
  while (head < tail) { i32 u = queue_[head++], du = dist_[u] + 1; for (i32 e = off_[u], e1 = off_[u + 1]; e < e1; e++) { i32 w = nbr_[e]; if (dist_[w] < 0) { dist_[w] = du; queue_[tail++] = w; } } }
}
typedef struct { i32 *pa, *pb; u16 *pc; i32 cnt, cap, maxD; } Pairs;
/* 0 = fine, 1 = pair list full, 2 = hop count too big for the code (the page then uses its Float32 version) */
static i32 add(Pairs *P, i32 a, i32 b, i32 d, i32 flag) {
  if (P->cnt >= P->cap) return 1;
  if (d > 511) return 2;
  i32 c = P->cnt; P->pa[c] = a; P->pb[c] = b; P->pc[c] = (u16)(d + (flag ? 512 : 0)); P->cnt = c + 1; if (d > P->maxD) P->maxD = d; return 0;
}
/* mode 0 = every pair (small pieces); mode 1 = pivots + links + near neighbors. pivFlag: pivot pairs carry the +512 code (the page's pivot weight is not 1).
 * Returns the pair count, -1 when the list is full, -2 when a hop count is over 511. maxD goes to *outMaxD. */
EXP("build") i32 build(i32 k, i32 *off, i32 *nbr, i32 *pa, i32 *pb, u16 *pc, i32 cap, i32 mode, i32 nPiv, i32 near, i32 rootL, i32 pivFlag,
                       i32 *dist, i32 *queue, i32 *minD, i32 *stamp, i32 *dl, i32 *outMaxD) {
  Pairs P = { pa, pb, pc, 0, cap, 1 }; K = k; off_ = off; nbr_ = nbr; dist_ = dist; queue_ = queue; i32 r;
#define ADD(a, b, d, f) do { r = add(&P, a, b, d, f); if (r) return -r; } while (0)
  if (mode == 0) {
    for (i32 i = 0; i < k; i++) { bfs(i); for (i32 j = i + 1; j < k; j++) if (dist[j] > 0) ADD(i, j, dist[j], 0); }
  } else {
    for (i32 i = 0; i < k; i++) minD[i] = 1000000000;
    i32 piv = rootL;
    for (i32 h = 0; h < nPiv; h++) {
      bfs(piv); i32 far = -1, fd = -1;
      for (i32 j = 0; j < k; j++) { i32 dj = dist[j]; if (dj < minD[j]) minD[j] = dj; if (minD[j] > fd) { fd = minD[j]; far = j; } if (j != piv && dj > 0) ADD(piv, j, dj, pivFlag); }
      piv = far;
    }
    for (i32 i = 0; i < k; i++) for (i32 j = off[i]; j < off[i + 1]; j++) if (nbr[j] > i) ADD(i, nbr[j], 1, 0);
    if (near > 0) {
      for (i32 i = 0; i < k; i++) stamp[i] = -1;
      for (i32 i = 0; i < k; i++) {
        i32 tail2 = 1, head2 = 0, got = 0; queue[0] = i; stamp[i] = i; dl[i] = 0;
        while (head2 < tail2 && got < near) {
          i32 u = queue[head2++];
          for (i32 e2 = off[u], e3 = off[u + 1]; e2 < e3 && got < near; e2++) {
            i32 w = nbr[e2];
            if (stamp[w] != i) { stamp[w] = i; dl[w] = dl[u] + 1; queue[tail2++] = w; if (dl[w] >= 2 && w > i) { ADD(i, w, dl[w], 0); got++; } }
          }
        }
      }
    }
  }
  *outMaxD = P.maxD; return P.cnt;
}
/* The one random order, made once (the same xorshift as the page's nextInt). */
EXP("shuffle") void shuffle(i32 *pa, i32 *pb, u16 *pc, i32 cnt, u32 s) {
  for (i32 q = cnt - 1; q > 0; q--) {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    i32 j = (i32)(((double)s / 4294967296.0) * (double)(q + 1));
    i32 p = pa[q]; pa[q] = pa[j]; pa[j] = p; p = pb[q]; pb[q] = pb[j]; pb[j] = p;
    u16 c = pc[q]; pc[q] = pc[j]; pc[j] = c;
  }
}
/* All sweeps in one call; etas[t] is computed by the page (so exp() is the page's own). */
EXP("sweeps") void sweeps(double *X, const i32 *pa, const i32 *pb, const u16 *pc, const float *pdT, const float *pwT, i32 cnt, const double *etas, i32 tmax) {
  for (i32 t = 0; t < tmax; t++) {
    double eta = etas[t]; i32 back = t & 1, q = back ? cnt - 1 : 0, step = back ? -1 : 1;
    for (i32 n = 0; n < cnt; n++, q += step) {
      i32 c = pc[q]; double mu = (double)pwT[c] * eta; if (mu > 1) mu = 1;
      i32 a2 = pa[q] * 2, b2 = pb[q] * 2;
      double dx = X[a2] - X[b2], dy = X[a2 + 1] - X[b2 + 1], mag = __builtin_sqrt(dx * dx + dy * dy);
      if (mag == 0 || mag != mag) mag = 1e-6;
      double r = (mu * (mag - (double)pdT[c])) / (2 * mag), rx = r * dx, ry = r * dy;
      X[a2] -= rx; X[a2 + 1] -= ry; X[b2] += rx; X[b2 + 1] += ry;
    }
  }
}
/* separate(): push overlapping discs apart on a grid, 2 numbers per item. Returns 0 = settled, 1 = still moving at the end, -(pass+1) when the grid would be
 * over 4,000,000 cells at that pass (the page finishes with its sparse version, as the JavaScript does), or -(100000+pass) when the grid does not fit the
 * start table the page gave (startCap ints): X is as the passes so far left it, so the page calls again with a bigger table and the passes that remain. */
EXP("separate") i32 separate(double *X, i32 k, const double *rads, double rmax, i32 passes, i32 *cellOf, i32 *sorted, i32 *start, i32 startCap) {
  double cell = 2 * rmax > 20 ? 2 * rmax : 20; i32 moved = 0;
  for (i32 pass = 0; pass < passes; pass++) {
    double x0 = 1e308, y0 = 1e308, x1 = -1e308, y1 = -1e308;
    for (i32 i = 0; i < k; i++) { double px = X[2 * i], py = X[2 * i + 1]; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
    double gwd = __builtin_floor((x1 - x0) / cell) + 3, ghd = __builtin_floor((y1 - y0) / cell) + 3;
    if (!(gwd * ghd <= 4000000.0)) return -(pass + 1);
    i32 GW = (i32)gwd, GH = (i32)ghd, ncell = GW * GH;
    if (ncell + 1 > startCap) return -(100000 + pass);
    for (i32 c = 0; c <= ncell; c++) start[c] = 0;
    for (i32 i = 0; i < k; i++) { i32 c = ((i32)__builtin_floor((X[2 * i + 1] - y0) / cell) + 1) * GW + (i32)__builtin_floor((X[2 * i] - x0) / cell) + 1; cellOf[i] = c; start[c + 1]++; }
    for (i32 c = 0; c < ncell; c++) start[c + 1] += start[c];
    for (i32 i = 0; i < k; i++) sorted[start[cellOf[i]]++] = i;
    for (i32 c = ncell; c > 0; c--) start[c] = start[c - 1];
    start[0] = 0; moved = 0;
    for (i32 i = 0; i < k; i++) {
      i32 ci = cellOf[i]; double ra = rads[i];
      for (i32 row = -1; row <= 1; row++) {
        i32 from = start[ci + row * GW - 1], to = start[ci + row * GW + 2];
        for (i32 q = from; q < to; q++) {
          i32 o = sorted[q]; if (o <= i) continue;
          double dx = X[2 * o] - X[2 * i], dy = X[2 * o + 1] - X[2 * i + 1], dd = __builtin_sqrt(dx * dx + dy * dy); if (dd == 0 || dd != dd) dd = 0.01;
          double need = ra + rads[o];
          if (dd < need) {
            double push = (need - dd) / 2, ux = dx / dd; if (ux == 0 || ux != ux) ux = 1; double uy = dy / dd;
            X[2 * i] -= ux * push; X[2 * i + 1] -= uy * push; X[2 * o] += ux * push; X[2 * o + 1] += uy * push; moved = 1;
          }
        }
      }
    }
    if (!moved) break;
  }
  return moved ? 1 : 0;
}
