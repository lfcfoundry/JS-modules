/* Copyright (c) 2026 LFC Foundry. MIT License.
 * Netflow Map's stress layout (pair building, the one-time shuffle, the forward/backward sweeps) and the overlap push-apart, in C for WebAssembly.
 * Mirrors stressComponent and separate in src/engine.js step for step, so the picture is the same to the last digit. Pairs are kept as two item numbers
 * (4 bytes each) plus one Uint16 "hop code" (the hop count, +512 when the pivot weight applies); distance and weight come from two 1,024-entry tables
 * the page fills with the same float32 rounding the JavaScript used, so 10 bytes a pair instead of 16. All memory is handed in by the page. */
#include <wasm_simd128.h>
typedef int i32; typedef unsigned int u32; typedef unsigned short u16; typedef unsigned long long u64;
#define EXP(n) __attribute__((export_name(n)))
static i32 *off_, *nbr_, *dist_, *queue_;
static i32 K;
static void bfs(i32 src) {
  for (i32 i = 0; i < K; i++) dist_[i] = -1;
  dist_[src] = 0; queue_[0] = src; i32 head = 0, tail = 1;
  while (head < tail && tail < K) { i32 u = queue_[head++], du = dist_[u] + 1; for (i32 e = off_[u], e1 = off_[u + 1]; e < e1; e++) { i32 w = nbr_[e]; if (dist_[w] < 0) { dist_[w] = du; queue_[tail++] = w; } } }
}
/* The same hop counts, found level by level: while the newest level is small each of its items looks at its links (as above); once its links outnumber the links of
 * what is left, every item not yet reached looks for a link into the newest level instead and stops at the first one. Dense pieces finish far sooner this way. */
static i32 degsum_;
static void bfs_levels(i32 src) {
  for (i32 i = 0; i < K; i++) dist_[i] = -1;
  dist_[src] = 0; queue_[0] = src; i32 head = 0, tail = 1, level = 0, left = K - 1, mu = degsum_ - (off_[src + 1] - off_[src]);
  while (head < tail && left > 0) {
    i32 end = tail, mf = 0;
    for (i32 q = head; q < end; q++) { i32 u = queue_[q]; mf += off_[u + 1] - off_[u]; }
    if (mf > mu) {
      for (i32 v = 0; v < K; v++) if (dist_[v] < 0) {
        for (i32 e = off_[v], e1 = off_[v + 1]; e < e1; e++) if (dist_[nbr_[e]] == level) { dist_[v] = level + 1; queue_[tail++] = v; left--; mu -= e1 - off_[v]; break; }
      }
    } else {
      for (i32 q = head; q < end; q++) { i32 u = queue_[q]; for (i32 e = off_[u], e1 = off_[u + 1]; e < e1; e++) { i32 w = nbr_[e]; if (dist_[w] < 0) { dist_[w] = level + 1; queue_[tail++] = w; left--; mu -= off_[w + 1] - off_[w]; } } }
    }
    head = end; level++;
  }
}
typedef struct { i32 *pa, *pb; u16 *pc; i32 cnt, cap, maxD; } Pairs;
/* 0 = fine, 1 = pair list full, 2 = hop count too big for the code (the page then uses its Float32 version) */
static i32 add(Pairs *P, i32 a, i32 b, i32 d, i32 flag) {
  if (P->cnt >= P->cap) return 1;
  if (d > 511) return 2;
  i32 c = P->cnt; P->pa[c] = a; P->pb[c] = b; P->pc[c] = (u16)(d + (flag ? 512 : 0)); P->cnt = c + 1; if (d > P->maxD) P->maxD = d; return 0;
}
/* mode 0 = every pair (small pieces); mode 1 = pivots + links + near neighbors (later-numbered ones only: Distances 3D); mode 2 = the same with the wider near-neighbor walk (Distances). pivFlag: pivot pairs carry the +512 code (the page's pivot weight is not 1).
 * Returns the pair count, -1 when the list is full, -2 when a hop count is over 511. maxD goes to *outMaxD. */
EXP("build") i32 build(i32 k, i32 *off, i32 *nbr, i32 *pa, i32 *pb, u16 *pc, i32 cap, i32 mode, i32 nPiv, i32 near, i32 rootL, i32 pivFlag,
                       i32 *dist, i32 *queue, i32 *minD, i32 *stamp, i32 *dl, i32 *outMaxD) {
  Pairs P = { pa, pb, pc, 0, cap, 1 }; K = k; off_ = off; nbr_ = nbr; dist_ = dist; queue_ = queue; i32 r;
#define ADD(a, b, d, f) do { r = add(&P, a, b, d, f); if (r) return -r; } while (0)
  if (mode == 0) {
    degsum_ = off[k];
    for (i32 i = 0; i < k; i++) {
      bfs_levels(i);
      if (P.cnt + (k - i - 1) > cap) return -1;
      i32 c = P.cnt, md = P.maxD;
      for (i32 j = i + 1; j < k; j++) { i32 d = dist[j]; if (d > 0) { pa[c] = i; pb[c] = j; pc[c] = (u16)d; c++; if (d > md) md = d; } }
      if (md > 511) return -2;
      P.cnt = c; P.maxD = md;
    }
  } else {
    for (i32 i = 0; i < k; i++) minD[i] = 1000000000;
    i32 piv = rootL;
    for (i32 h = 0; h < nPiv; h++) {
      bfs(piv); i32 far = -1, fd = -1;
      for (i32 j = 0; j < k; j++) { i32 dj = dist[j]; if (dj < minD[j]) minD[j] = dj; if (minD[j] > fd) { fd = minD[j]; far = j; } if (j != piv && dj > 0) ADD(piv, j, dj, pivFlag); }
      piv = far;
    }
    for (i32 i = 0; i < k; i++) for (i32 j = off[i]; j < off[i + 1]; j++) if (nbr[j] > i) ADD(i, nbr[j], 1, 0);
    if (near > 0 && mode == 2) {   /* any item two or more hops away counts (not only later-numbered ones); each list is entered at a place that depends on the item, so the items around a hub do not all pick the same few; the walk has a budget, so a hub costs no more than a quiet item */
      for (i32 i = 0; i < k; i++) stamp[i] = -1;
      for (i32 i = 0; i < k; i++) {
        i32 tail2 = 1, head2 = 0, got = 0, budget = 16 * near + (off[i + 1] - off[i]), scanned = 0; queue[0] = i; stamp[i] = i; dl[i] = 0;
        u32 hsh = ((u32)i * 2654435761u) >> 8;
        while (head2 < tail2 && got < near && scanned < budget) {
          i32 u = queue[head2++], e0 = off[u], dg = off[u + 1] - e0, st = u == i || dg == 0 ? 0 : (i32)(hsh % (u32)dg), du = dl[u] + 1;
          for (i32 t = 0; t < dg && got < near && scanned < budget; t++) {
            i32 e2 = st + t; if (e2 >= dg) e2 -= dg;
            i32 w = nbr[e0 + e2]; scanned++;
            if (stamp[w] != i) { stamp[w] = i; dl[w] = du; queue[tail2++] = w; if (du >= 2) { ADD(i, w, du, 0); got++; } }
          }
        }
      }
    } else if (near > 0) {
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
/* The same sweeps, two pairs at a time. Two neighbors in the shuffled list that share no item do not touch each other's numbers, so doing them side by side (one
 * pair per lane) gives exactly what doing them one after the other gives, to the last digit; when they do share an item, that pair runs alone as above. Every
 * multiply, add, divide and square root is the same operation in the same order (no fused multiply-add), so the positions match the JavaScript ones. */
static inline v128_t clampmu(v128_t mu) { v128_t one = wasm_f64x2_splat(1.0); return wasm_v128_bitselect(one, mu, wasm_f64x2_gt(mu, one)); }
static inline v128_t fixmag(v128_t mag) { v128_t bad = wasm_v128_or(wasm_f64x2_eq(mag, wasm_f64x2_splat(0.0)), wasm_f64x2_ne(mag, mag)); return wasm_v128_bitselect(wasm_f64x2_splat(1e-6), mag, bad); }
EXP("sweepsv") void sweepsv(double *X, const i32 *pa, const i32 *pb, const u16 *pc, const float *pdT, const float *pwT, i32 cnt, const double *etas, i32 tmax) {
  for (i32 t = 0; t < tmax; t++) {
    double eta = etas[t]; i32 back = t & 1, q = back ? cnt - 1 : 0, step = back ? -1 : 1; v128_t etav = wasm_f64x2_splat(eta); i32 n = 0;
    for (; n + 1 < cnt; ) {
      i32 q2 = q + step, a1 = pa[q], b1 = pb[q], a2 = pa[q2], b2 = pb[q2];
      if (a1 != a2 && a1 != b2 && b1 != a2 && b1 != b2) {
        i32 c1 = pc[q], c2 = pc[q2], a1i = a1 * 2, b1i = b1 * 2, a2i = a2 * 2, b2i = b2 * 2;
        v128_t mu = clampmu(wasm_f64x2_mul(wasm_f64x2_make((double)pwT[c1], (double)pwT[c2]), etav));
        v128_t dd = wasm_f64x2_make((double)pdT[c1], (double)pdT[c2]);
        v128_t xa = wasm_f64x2_make(X[a1i], X[a2i]), xb = wasm_f64x2_make(X[b1i], X[b2i]), ya = wasm_f64x2_make(X[a1i + 1], X[a2i + 1]), yb = wasm_f64x2_make(X[b1i + 1], X[b2i + 1]);
        v128_t dx = wasm_f64x2_sub(xa, xb), dy = wasm_f64x2_sub(ya, yb);
        v128_t mag = fixmag(wasm_f64x2_sqrt(wasm_f64x2_add(wasm_f64x2_mul(dx, dx), wasm_f64x2_mul(dy, dy))));
        v128_t r = wasm_f64x2_div(wasm_f64x2_mul(mu, wasm_f64x2_sub(mag, dd)), wasm_f64x2_mul(wasm_f64x2_splat(2.0), mag));
        v128_t rx = wasm_f64x2_mul(r, dx), ry = wasm_f64x2_mul(r, dy);
        v128_t nxa = wasm_f64x2_sub(xa, rx), nya = wasm_f64x2_sub(ya, ry), nxb = wasm_f64x2_add(xb, rx), nyb = wasm_f64x2_add(yb, ry);
        X[a1i] = wasm_f64x2_extract_lane(nxa, 0); X[a1i + 1] = wasm_f64x2_extract_lane(nya, 0); X[b1i] = wasm_f64x2_extract_lane(nxb, 0); X[b1i + 1] = wasm_f64x2_extract_lane(nyb, 0);
        X[a2i] = wasm_f64x2_extract_lane(nxa, 1); X[a2i + 1] = wasm_f64x2_extract_lane(nya, 1); X[b2i] = wasm_f64x2_extract_lane(nxb, 1); X[b2i + 1] = wasm_f64x2_extract_lane(nyb, 1);
        q += 2 * step; n += 2;
      } else {
        i32 c = pc[q]; double mu = (double)pwT[c] * eta; if (mu > 1) mu = 1;
        i32 ai = a1 * 2, bi = b1 * 2;
        double dx = X[ai] - X[bi], dy = X[ai + 1] - X[bi + 1], mag = __builtin_sqrt(dx * dx + dy * dy);
        if (mag == 0 || mag != mag) mag = 1e-6;
        double r = (mu * (mag - (double)pdT[c])) / (2 * mag), rx = r * dx, ry = r * dy;
        X[ai] -= rx; X[ai + 1] -= ry; X[bi] += rx; X[bi + 1] += ry;
        q += step; n += 1;
      }
    }
    if (n < cnt) {
      i32 c = pc[q]; double mu = (double)pwT[c] * eta; if (mu > 1) mu = 1;
      i32 ai = pa[q] * 2, bi = pb[q] * 2;
      double dx = X[ai] - X[bi], dy = X[ai + 1] - X[bi + 1], mag = __builtin_sqrt(dx * dx + dy * dy);
      if (mag == 0 || mag != mag) mag = 1e-6;
      double r = (mu * (mag - (double)pdT[c])) / (2 * mag), rx = r * dx, ry = r * dy;
      X[ai] -= rx; X[ai + 1] -= ry; X[bi] += rx; X[bi + 1] += ry;
    }
  }
}
/* Every-pair pieces without a pair list. dense(): the hop counts of all pairs as one byte each, kept by offset: row r - 1 (r = 1 .. k/2) holds, for every item i, the
 * count between i and i + r (wrapping round), so a sweep reads its row straight through. Returns the largest count, or -2 when one is over 255 (the page then uses
 * the pair list). */
EXP("dense") i32 dense(i32 k, i32 *off, i32 *nbr, unsigned char *D, u64 *seen, u64 *front, unsigned char *T) {
  /* First by item (T: row i = the counts from i to i + 1 .. i + k/2). The search runs from 64 items at once: each item keeps one bit per start item ("reached"),
   * and a level is one pass over the links that ORs the bits of the newest level into the neighbors. Hop counts are whole numbers, so they are the ones a search
   * from one item at a time finds. (Idea: Then and others, "The More the Merrier: Efficient Multi-Source Graph Traversal", 2014.) */
  i32 maxD = 1, nr = k / 2; u64 *next = front + k;
  __builtin_memset(T, 0, (unsigned long)k * (unsigned long)nr);
  for (i32 b0 = 0; b0 < k; b0 += 64) {
    i32 nb = k - b0 < 64 ? k - b0 : 64;
    for (i32 v = 0; v < k; v++) { seen[v] = 0; front[v] = 0; }
    for (i32 t = 0; t < nb; t++) { seen[b0 + t] = (u64)1 << t; front[b0 + t] = (u64)1 << t; }
    for (i32 level = 1; ; level++) {   /* plain passes over all items: keeping lists of the newest level was tried and was slower on meshes */
      for (i32 v = 0; v < k; v++) next[v] = 0;
      for (i32 u = 0; u < k; u++) { u64 f = front[u]; if (!f) continue; for (i32 e = off[u], e1 = off[u + 1]; e < e1; e++) next[nbr[e]] |= f; }
      i32 any = 0;
      for (i32 v = 0; v < k; v++) {
        u64 n = next[v] & ~seen[v]; front[v] = n; if (!n) continue;
        seen[v] |= n; any = 1;
        if (level > 255) return -2;
        do { i32 s = b0 + (i32)__builtin_ctzll(n), r = v - s; n &= n - 1; if (r < 0) r += k; if (r <= nr) T[(long)s * nr + r - 1] = (unsigned char)level; } while (n);
      }
      if (!any) break;
      if (level > maxD) maxD = level;
    }
  }
  for (i32 ib = 0; ib < k; ib += 64) for (i32 rb = 0; rb < nr; rb += 64) {   /* then turned on its side, a block at a time (kind to the cache) */
    i32 ie = ib + 64 < k ? ib + 64 : k, re = rb + 64 < nr ? rb + 64 : nr;
    for (i32 r = rb; r < re; r++) { unsigned char *drow = D + (long)r * k; for (i32 i = ib; i < ie; i++) drow[i] = T[(long)i * nr + r]; }
  }
  return maxD;
}
static inline void pair1(double *X, i32 i, i32 j, i32 c, const float *pdT, const float *pwT, double eta) {
  double mu = (double)pwT[c] * eta; if (mu > 1) mu = 1;
  i32 a2 = i * 2, b2 = j * 2;
  double dx = X[a2] - X[b2], dy = X[a2 + 1] - X[b2 + 1], mag = __builtin_sqrt(dx * dx + dy * dy);
  if (mag == 0 || mag != mag) mag = 1e-6;
  double r = (mu * (mag - (double)pdT[c])) / (2 * mag), rx = r * dx, ry = r * dy;
  X[a2] -= rx; X[a2 + 1] -= ry; X[b2] += rx; X[b2 + 1] += ry;
}
/* sweepsd(): the sweeps over that table. A sweep takes the offsets r = 1 .. k/2 in a fresh random order (the page's xorshift) and, for each, the pairs (i, i + r) for
 * i = 0, 1, 2, ... (wrapping round), so every pair comes once per sweep and the items are read in order (use < k/2 takes only the first `use` offsets of each sweep's order:
 * an even sample of the pairs). Two neighbors in that order, (i, i + r) and (i + 1, i + 1 + r),
 * share no item unless r is 1, so they run side by side, one per lane, and give exactly what one after the other gives (same operations, no fused multiply-add). */
EXP("sweepsd") void sweepsd(double *X, i32 k, const unsigned char *D, const float *pdT, const float *pwT, const double *etas, i32 tmax, u32 s, i32 *ord, i32 use) {
  i32 nr = k / 2;
  for (i32 q = 0; q < nr; q++) ord[q] = q + 1;
  for (i32 t = 0; t < tmax; t++) {
    double eta = etas[t]; v128_t etav = wasm_f64x2_splat(eta);
    for (i32 q = nr - 1; q > 0; q--) { s ^= s << 13; s ^= s >> 17; s ^= s << 5; i32 j = (i32)(((double)s / 4294967296.0) * (double)(q + 1)); i32 p = ord[q]; ord[q] = ord[j]; ord[j] = p; }
    for (i32 q = 0; q < use; q++) {
      i32 r = ord[q], lim = 2 * r == k ? nr : k; const unsigned char *Dr = D + (long)(r - 1) * k;
      for (i32 seg = 0; seg < 2; seg++) {   /* seg 0: i + r stays under k; seg 1: it wraps */
        i32 i0 = seg ? k - r : 0, i1 = seg ? lim : (lim < k - r ? lim : k - r), sh = seg ? r - k : r, i = i0;
        if (r != 1) for (; i + 1 < i1; i += 2) {
          i32 j = i + sh, c1 = Dr[i], c2 = Dr[i + 1];
          if (c1 == 0 || c2 == 0) { if (c1) pair1(X, i, j, c1, pdT, pwT, eta); if (c2) pair1(X, i + 1, j + 1, c2, pdT, pwT, eta); continue; }
          v128_t mu = clampmu(wasm_f64x2_mul(wasm_f64x2_make((double)pwT[c1], (double)pwT[c2]), etav));
          v128_t dd = wasm_f64x2_make((double)pdT[c1], (double)pdT[c2]);
          v128_t pa = wasm_v128_load(X + 2 * i), pb = wasm_v128_load(X + 2 * i + 2), qa = wasm_v128_load(X + 2 * j), qb = wasm_v128_load(X + 2 * j + 2);   /* (x, y) of i, i + 1, j, j + 1 */
          v128_t xa = wasm_i64x2_shuffle(pa, pb, 0, 2), ya = wasm_i64x2_shuffle(pa, pb, 1, 3), xb = wasm_i64x2_shuffle(qa, qb, 0, 2), yb = wasm_i64x2_shuffle(qa, qb, 1, 3);
          v128_t dx = wasm_f64x2_sub(xa, xb), dy = wasm_f64x2_sub(ya, yb);
          v128_t mag = fixmag(wasm_f64x2_sqrt(wasm_f64x2_add(wasm_f64x2_mul(dx, dx), wasm_f64x2_mul(dy, dy))));
          v128_t rr = wasm_f64x2_div(wasm_f64x2_mul(mu, wasm_f64x2_sub(mag, dd)), wasm_f64x2_mul(wasm_f64x2_splat(2.0), mag));
          v128_t rx = wasm_f64x2_mul(rr, dx), ry = wasm_f64x2_mul(rr, dy);
          v128_t nxa = wasm_f64x2_sub(xa, rx), nya = wasm_f64x2_sub(ya, ry), nxb = wasm_f64x2_add(xb, rx), nyb = wasm_f64x2_add(yb, ry);
          wasm_v128_store(X + 2 * i, wasm_i64x2_shuffle(nxa, nya, 0, 2)); wasm_v128_store(X + 2 * i + 2, wasm_i64x2_shuffle(nxa, nya, 1, 3));
          wasm_v128_store(X + 2 * j, wasm_i64x2_shuffle(nxb, nyb, 0, 2)); wasm_v128_store(X + 2 * j + 2, wasm_i64x2_shuffle(nxb, nyb, 1, 3));
        }
        for (; i < i1; i++) { i32 c = Dr[i]; if (c) pair1(X, i, i + sh, c, pdT, pwT, eta); }
      }
    }
  }
}
/* The same sweeps in three dimensions (Distances 3D), 3 numbers per item; the pairs, the tables and the one shuffle are the ones above. etas[t] is the page's. */
EXP("sweeps3") void sweeps3(double *X, const i32 *pa, const i32 *pb, const u16 *pc, const float *pdT, const float *pwT, i32 cnt, const double *etas, i32 tmax) {
  for (i32 t = 0; t < tmax; t++) {
    double eta = etas[t]; i32 back = t & 1, q = back ? cnt - 1 : 0, step = back ? -1 : 1;
    for (i32 n = 0; n < cnt; n++, q += step) {
      i32 c = pc[q]; double mu = (double)pwT[c] * eta; if (mu > 1) mu = 1;
      i32 a3 = pa[q] * 3, b3 = pb[q] * 3;
      double dx = X[a3] - X[b3], dy = X[a3 + 1] - X[b3 + 1], dz = X[a3 + 2] - X[b3 + 2], mag = __builtin_sqrt(dx * dx + dy * dy + dz * dz);
      if (mag == 0 || mag != mag) mag = 1e-6;
      double r = (mu * (mag - (double)pdT[c])) / (2 * mag), rx = r * dx, ry = r * dy, rz = r * dz;
      X[a3] -= rx; X[a3 + 1] -= ry; X[a3 + 2] -= rz; X[b3] += rx; X[b3 + 1] += ry; X[b3 + 2] += rz;
    }
  }
}
/* The Closeness rounds (closenessComponent's loop, with b = 1): linked items pulled together, a few random others pushed away, steps clipped. U holds 2 numbers per
 * item (already scaled by 1/EDGE); ea/eb are the links; s is the page's xorshift seed. Same operations in the same order as the JavaScript. */
static u32 rs_;
static i32 next_int(i32 n) { u32 s = rs_; s ^= s << 13; s ^= s >> 17; s ^= s << 5; rs_ = s; return (i32)(((double)s / 4294967296.0) * (double)n); }
EXP("closeness") void closeness(double *U, i32 k, const i32 *ea, const i32 *eb, i32 nE, u32 seed, i32 epochs, i32 neg, double a, double b, double clip, double alpha0) {
  rs_ = seed;
  for (i32 ep = 0; ep < epochs; ep++) {
    double alpha = alpha0 * (1 - (double)ep / (double)epochs);
    for (i32 e = 0; e < nE; e++) {
      i32 p = ea[e], q = eb[e];
      double dx = U[2 * p] - U[2 * q], dy = U[2 * p + 1] - U[2 * q + 1], d2 = dx * dx + dy * dy;
      double g = d2 > 0 ? -2 * a / (1 + a * d2) : 0;
      double mx = g * dx, my = g * dy; if (mx > clip) mx = clip; else if (mx < -clip) mx = -clip; if (my > clip) my = clip; else if (my < -clip) my = -clip;
      U[2 * p] += alpha * mx; U[2 * p + 1] += alpha * my; U[2 * q] -= alpha * mx; U[2 * q + 1] -= alpha * my;
      for (i32 r = 0; r < neg; r++) {
        i32 c = next_int(k); if (c == p) continue;
        double rx = U[2 * p] - U[2 * c], ry = U[2 * p + 1] - U[2 * c + 1], r2 = rx * rx + ry * ry;
        double gr = 2 * b / ((0.001 + r2) * (1 + a * r2));
        double qx = gr * rx, qy = gr * ry; if (qx > clip) qx = clip; else if (qx < -clip) qx = -clip; if (qy > clip) qy = clip; else if (qy < -clip) qy = -clip;
        U[2 * p] += alpha * qx; U[2 * p + 1] += alpha * qy;
      }
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
/* separate2(): the push-apart for Distances pictures that were stretched first (clearOverlaps, direct). Two savings over separate(): the touching test compares squared
 * distances, so the square root is taken only for pairs that do touch; and an item that did not move in the last pass is only tested from the side of a neighbor that
 * did (act marks the items that moved; fresh = 1 starts with every item marked, 0 carries on after the page gave a bigger start table). Same return values. */
EXP("separate2") i32 separate2(double *X, i32 k, const double *rads, double rmax, i32 passes, i32 *cellOf, i32 *sorted, i32 *start, i32 startCap, unsigned char *act, unsigned char *nxt, i32 fresh) {
  double cell = 2 * rmax > 20 ? 2 * rmax : 20; i32 moved = 0;
  if (fresh) for (i32 i = 0; i < k; i++) act[i] = 1;
  for (i32 pass = 0; pass < passes; pass++) {
    double x0 = 1e308, y0 = 1e308, x1 = -1e308, y1 = -1e308;
    for (i32 i = 0; i < k; i++) { double px = X[2 * i], py = X[2 * i + 1]; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
    double gwd = __builtin_floor((x1 - x0) / cell) + 3, ghd = __builtin_floor((y1 - y0) / cell) + 3;
    if (!(gwd * ghd <= 4000000.0)) return -(pass + 1);
    i32 GW = (i32)gwd, GH = (i32)ghd, ncell = GW * GH;
    if (ncell + 1 > startCap) return -(100000 + pass);
    for (i32 c = 0; c <= ncell; c++) start[c] = 0;
    for (i32 i = 0; i < k; i++) { i32 c = ((i32)__builtin_floor((X[2 * i + 1] - y0) / cell) + 1) * GW + (i32)__builtin_floor((X[2 * i] - x0) / cell) + 1; cellOf[i] = c; start[c + 1]++; nxt[i] = 0; }
    for (i32 c = 0; c < ncell; c++) start[c + 1] += start[c];
    for (i32 i = 0; i < k; i++) sorted[start[cellOf[i]]++] = i;
    for (i32 c = ncell; c > 0; c--) start[c] = start[c - 1];
    start[0] = 0; moved = 0;
    for (i32 i = 0; i < k; i++) {
      if (!act[i]) continue;
      i32 ci = cellOf[i]; double ra = rads[i];
      for (i32 row = -1; row <= 1; row++) {
        i32 from = start[ci + row * GW - 1], to = start[ci + row * GW + 2];
        for (i32 q = from; q < to; q++) {
          i32 o = sorted[q]; if (o == i || (o < i && act[o])) continue;
          double dx = X[2 * o] - X[2 * i], dy = X[2 * o + 1] - X[2 * i + 1], d2 = dx * dx + dy * dy, need = ra + rads[o];
          if (d2 < need * need) {
            double dd = __builtin_sqrt(d2); if (dd == 0 || dd != dd) dd = 0.01;
            double push = (need - dd) / 2, ux = dx / dd; if (ux == 0 || ux != ux) ux = 1; double uy = dy / dd;
            X[2 * i] -= ux * push; X[2 * i + 1] -= uy * push; X[2 * o] += ux * push; X[2 * o + 1] += uy * push; moved = 1; nxt[i] = 1; nxt[o] = 1;
          }
        }
      }
    }
    for (i32 i = 0; i < k; i++) act[i] = nxt[i];
    if (!moved) break;
  }
  return moved ? 1 : 0;
}
/* separateSparse(): the same push-apart on a hash grid (cells 90 wide, key = the page's integer key), for pictures too spread out for a plain grid. Items of one cell are a list
 * whose newest item comes first, as in the JavaScript, so the pushes happen in the same order. hk/hv: an open-addressing table of cap (a power of two, at least twice k)
 * entries; hv = -2 marks an empty one. Returns 1 when the last pass still moved something. */
typedef long long i64; typedef unsigned long long u64;
static i32 slot_of(const i64 *hk, const i32 *hv, i32 mask, i64 key) {
  u64 h = (u64)key * 0x9E3779B97F4A7C15ULL; i32 sl = (i32)(h >> 40) & mask;
  while (hv[sl] != -2 && hk[sl] != key) sl = (sl + 1) & mask;
  return sl;
}
EXP("separate_sparse") i32 separate_sparse(double *X, i32 k, const double *rads, i32 passes, i32 *next, i64 *hk, i32 *hv, i32 cap) {
  const double cell = 90; i32 mask = cap - 1, moved = 0;
  for (i32 pass = 0; pass < passes; pass++) {
    for (i32 c = 0; c < cap; c++) hv[c] = -2;
    moved = 0;
    for (i32 i = 0; i < k; i++) {
      double key = (__builtin_floor(X[2 * i] / cell) + 4096) * 8192 + __builtin_floor(X[2 * i + 1] / cell) + 4096;
      i32 sl = slot_of(hk, hv, mask, (i64)key);
      if (hv[sl] == -2) { hk[sl] = (i64)key; next[i] = -1; } else next[i] = hv[sl];
      hv[sl] = i;
    }
    for (i32 i = 0; i < k; i++) {
      double cx = __builtin_floor(X[2 * i] / cell) + 4096, cy = __builtin_floor(X[2 * i + 1] / cell) + 4096, ra = rads[i];
      for (double gx = cx - 1; gx <= cx + 1; gx++) for (double gy = cy - 1; gy <= cy + 1; gy++) {
        i32 sl = slot_of(hk, hv, mask, (i64)(gx * 8192 + gy)); if (hv[sl] == -2) continue;
        for (i32 o = hv[sl]; o >= 0; o = next[o]) {
          if (o <= i) continue;
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
  return moved;
}
