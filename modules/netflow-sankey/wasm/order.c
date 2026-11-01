/* Copyright (c) 2026 LFC Foundry. MIT License. The order search of netflow-sankey (barycenter sweeps, neighbor swaps, crossing count) in WebAssembly.
   Same arithmetic, in the same order, as the JavaScript in netflow-sankey.js (build with -ffp-contract=off, no fast-math). */
typedef int i32; typedef double f64;
static i32 nV, nL;
static i32 *layerOf, *layerStart, *ord, *pos, *tmp, *best, *uS, *uI, *dS, *dI, *xBot, *seenOrd, *seenRem;
static i32 nSeen, seenCap;
static i32 *memo, memoN, stamp, *lver, *sig;   /* swapPass shortcuts: decisions kept per pair for one call, and layers whose neighborhood did not change since they last settled */
static f64 *lenOf, *bary, *uO, *dO, *xW, *xBit;

void bind(i32 nV_, i32 nL_, i32 *layerOf_, i32 *layerStart_, i32 *ord_, i32 *pos_, f64 *lenOf_, f64 *bary_, i32 *tmp_, i32 *best_,
          i32 *uS_, i32 *uI_, f64 *uO_, i32 *dS_, i32 *dI_, f64 *dO_, i32 *xBot_, f64 *xW_, f64 *xBit_, i32 *seenOrd_, i32 *seenRem_, i32 seenCap_, i32 *memo_, i32 memoN_, i32 *lver_, i32 *sig_) {
  nV = nV_; nL = nL_; layerOf = layerOf_; layerStart = layerStart_; ord = ord_; pos = pos_; lenOf = lenOf_; bary = bary_; tmp = tmp_; best = best_;
  uS = uS_; uI = uI_; uO = uO_; dS = dS_; dI = dI_; dO = dO_; xBot = xBot_; xW = xW_; xBit = xBit_; seenOrd = seenOrd_; seenRem = seenRem_; seenCap = seenCap_; nSeen = 0;
  memo = memo_; memoN = memoN_; stamp = 0; lver = lver_; sig = sig_;
}

/* Orderings already followed: the search from an ordering is the same every time (sweeps, swaps and tie breaks only read the ordering), so a run that
   reaches an ordering an earlier run already followed for at least as many more rounds can stop with the same final answer. Returns 1 to stop.
   An ordering seen with fewer rounds left than now is kept with the larger count. */
static i32 seenCheck(i32 rem) {
  i32 s, i, *o;
  for (s = 0; s < nSeen; s++) {
    o = seenOrd + s * nV;
    for (i = 0; i < nV && o[i] == ord[i]; i++) ;
    if (i == nV) { if (seenRem[s] >= rem) return 1; seenRem[s] = rem; return 0; }
  }
  if (nSeen < seenCap) { o = seenOrd + nSeen * nV; for (i = 0; i < nV; i++) o[i] = ord[i]; seenRem[nSeen++] = rem; }
  return 0;
}

static f64 crossTyped(i32 q) {
  i32 *o = ord + layerStart[q], len = layerStart[q + 1] - layerStart[q], nb = layerStart[q + 2] - layerStart[q + 1] + 1;
  i32 n = 0, i, k, m, p, v, s0, c, tb; f64 tw, sum, w, all = 0, total = 0;
  for (i = 0; i < len; i++) n += dS[o[i] + 1] - dS[o[i]];
  if (n < 2) return 0;
  for (i = 0; i < nb + 2; i++) xBit[i] = 0;
  for (i = 0; i < len; i++) {
    v = o[i]; s0 = dS[v]; c = dS[v + 1] - s0;
    if (!c) continue;
    for (k = 0; k < c; k++) {
      tb = pos[dI[s0 + k]]; tw = dO[s0 + k];
      for (m = k - 1; m >= 0 && xBot[m] > tb; m--) { xBot[m + 1] = xBot[m]; xW[m + 1] = xW[m]; }
      xBot[m + 1] = tb; xW[m + 1] = tw;
    }
    for (k = 0; k < c; k++) { sum = 0; for (p = xBot[k] + 1; p > 0; p -= p & -p) sum += xBit[p]; total += xW[k] * (all - sum); }
    for (k = 0; k < c; k++) { w = xW[k]; for (p = xBot[k] + 1; p <= nb + 1; p += p & -p) xBit[p] += w; all += w; }
  }
  return total;
}

static f64 totalAll(void) {
  f64 c = 0; i32 q;
  for (q = 0; q + 1 < nL; q++) c += crossTyped(q);
  return c;
}

/* stable merge sort of the slots a[0..n) by key[slot]; ties by pos[slot] when tie is set, else they keep their order */
static void sortSlots(i32 *a, i32 n, f64 *key, i32 tie) {
  i32 i, j, x, y, w, lo, mid, hi, p, q, k, *src = a, *dst = tmp, *t;
  for (lo = 0; lo < n; lo += 8) {
    hi = lo + 8 < n ? lo + 8 : n;
    for (i = lo + 1; i < hi; i++) {
      x = a[i]; j = i - 1;
      while (j >= lo) { y = a[j]; if (key[x] < key[y] || (tie && key[x] == key[y] && pos[x] < pos[y])) { a[j + 1] = y; j--; } else break; }
      a[j + 1] = x;
    }
  }
  for (w = 8; w < n; w *= 2) {
    for (lo = 0; lo < n; lo += 2 * w) {
      mid = lo + w < n ? lo + w : n; hi = lo + 2 * w < n ? lo + 2 * w : n; p = lo; q = mid; k = lo;
      while (p < mid && q < hi) {
        x = src[q]; y = src[p];
        if (key[x] < key[y] || (tie && key[x] == key[y] && pos[x] < pos[y])) { dst[k++] = x; q++; } else { dst[k++] = y; p++; }
      }
      while (p < mid) dst[k++] = src[p++];
      while (q < hi) dst[k++] = src[q++];
    }
    t = src; src = dst; dst = t;
  }
  if (src != a) for (i = 0; i < n; i++) a[i] = src[i];
}

static void sweep(i32 q, i32 goUp) {
  i32 *list = ord + layerStart[q], n = layerStart[q + 1] - layerStart[q], j, e, e1, v, nb, *S, *I; f64 len = lenOf[q], s, w, ww, *O;
  if (goUp) { S = uS; I = uI; O = uO; } else { S = dS; I = dI; O = dO; }
  for (j = 0; j < n; j++) {
    v = list[j]; s = 0; w = 0;
    for (e = S[v], e1 = S[v + 1]; e < e1; e++) { nb = I[e]; ww = O[e]; s += ww * ((f64)pos[nb] + 0.5) / lenOf[layerOf[nb]]; w += ww; }
    bary[v] = w != 0 ? s / w : ((f64)pos[v] + 0.5) / len;
  }
  sortSlots(list, n, bary, 1);
  e = 0; for (j = 0; j < n; j++) { if (pos[list[j]] != j) e = 1; pos[list[j]] = j; }
  if (e) lver[q]++;
}

/* A pair's decision (swap or not) reads only the two bars and the positions of their neighbors in the layers above and below, which this pass does
   not move, so it is kept for the rest of the call (memo, by place at the start of the call). A layer whose own order and both neighbor layers are
   as they were when it last settled (a pass with no swap) would settle again with no swap, so it is skipped (sig). Same decisions as before. */
static i32 pairSwaps(i32 a, i32 b) {
  i32 side, xs, xe, ys, ye, px, py, *S, *I; f64 before = 0, after = 0, *O;
  for (side = 0; side < 2; side++) {
    if (side) { S = dS; I = dI; O = dO; } else { S = uS; I = uI; O = uO; }
    for (xs = S[a], xe = S[a + 1]; xs < xe; xs++) {
      px = pos[I[xs]];
      for (ys = S[b], ye = S[b + 1]; ys < ye; ys++) { py = pos[I[ys]]; if (px > py) before += O[xs] * O[ys]; else if (px < py) after += O[xs] * O[ys]; }
    }
  }
  return after < before - 1e-12;
}
static void swapPass(i32 q) {
  i32 *list = ord + layerStart[q], n = layerStart[q + 1] - layerStart[q], improved = 1, guard = 0, j, a, b, d, m, k, s0, s2, useMemo;
  s0 = q > 0 ? lver[q - 1] : -1; s2 = q + 1 < nL ? lver[q + 1] : -1;
  if (sig[3 * q] == s0 && sig[3 * q + 1] == lver[q] && sig[3 * q + 2] == s2) return;
  useMemo = n <= memoN; if (useMemo) { stamp++; for (j = 0; j < n; j++) tmp[list[j]] = j; }
  while (improved && guard++ < 6) {
    improved = 0;
    for (j = 0; j + 1 < n; j++) {
      a = list[j]; b = list[j + 1];
      if (useMemo) { k = tmp[a] * memoN + tmp[b]; m = memo[k]; if ((m >> 1) == stamp) d = m & 1; else { d = pairSwaps(a, b); memo[k] = (stamp << 1) | d; } }
      else d = pairSwaps(a, b);
      if (d) { list[j] = b; list[j + 1] = a; pos[a] = j + 1; pos[b] = j; improved = 1; }
    }
    if (improved) lver[q]++;
  }
  if (!improved) { sig[3 * q] = s0; sig[3 * q + 1] = lver[q]; sig[3 * q + 2] = s2; } else sig[3 * q] = -2;
}

/* rounds of (sweep down, sweep up, neighbor swaps when doSwap) with the best order kept; leaves the best order in place and returns its crossing weight */
f64 run(i32 rounds, i32 doSwap) {
  i32 r, q, i; f64 bestC, cur;
  for (i = 0; i < nV; i++) best[i] = ord[i];
  for (q = 0; q < nL; q++) { lver[q] = 0; sig[3 * q] = -2; }   /* the caller may have reordered: nothing is known to be settled */
  bestC = totalAll();
  seenCheck(rounds);
  for (r = 0; r < rounds && bestC > 0; r++) {
    for (q = 1; q < nL; q++) sweep(q, 1);
    for (q = nL - 2; q >= 0; q--) sweep(q, 0);
    if (doSwap) for (q = 0; q < nL; q++) swapPass(q);
    cur = totalAll();
    if (cur < bestC - 1e-12) { bestC = cur; for (i = 0; i < nV; i++) best[i] = ord[i]; }
    if (seenCheck(rounds - r - 1)) break;
  }
  for (i = 0; i < nV; i++) ord[i] = best[i];
  for (q = 0; q < nL; q++) sig[3 * q] = -2;
  for (q = 0; q < nL; q++) for (i = layerStart[q]; i < layerStart[q + 1]; i++) pos[ord[i]] = i - layerStart[q];
  return bestC;
}

/* The vertical relaxation of netflow-sankey (pull toward the weighted middle of the neighbors, then settle: keep the order, enforce gaps, pull back
   inside the top), on flat lists made by relaxWasm in netflow-sankey.js. Same arithmetic, in the same order, as the JavaScript (pull and settle there). */
static void settleRow(f64 *Y, const f64 *Hh, const unsigned char *Dm, const i32 *list, i32 n, f64 pad, f64 padD) {
  i32 j;
  for (j = 1; j < n; j++) { i32 p = list[j - 1], c = list[j]; f64 lim = Y[p] + Hh[p] / 2 + (Dm[p] || Dm[c] ? padD : pad) + Hh[c] / 2; if (Y[c] < lim) Y[c] = lim; }
  if (n) { f64 up = Y[list[0]] - Hh[list[0]] / 2; if (up < 0) for (j = 0; j < n; j++) Y[list[j]] -= up; }
}
static void pullRow(f64 *Y, const f64 *Hh, const unsigned char *Dm, const i32 *list, i32 n, i32 mode, f64 a, const i32 *upS, const i32 *upI, const f64 *upW,
                    const i32 *dnS, const i32 *dnI, const f64 *dnW, f64 pad, f64 padD) {
  i32 j, q, e;
  for (j = 0; j < n; j++) {
    i32 i = list[j]; f64 s = 0, w = 0;
    if (mode != 1) for (q = upS[i], e = upS[i + 1]; q < e; q++) { s += Y[upI[q]] * upW[q]; w += upW[q]; }
    if (mode != 0) for (q = dnS[i], e = dnS[i + 1]; q < e; q++) { s += Y[dnI[q]] * dnW[q]; w += dnW[q]; }
    if (w > 0) Y[i] += (s / w - Y[i]) * a;
  }
  settleRow(Y, Hh, Dm, list, n, pad, padD);
}
void relax(i32 nL_, const i32 *start, const i32 *ix, f64 *Y, const f64 *Hh, const unsigned char *Dm, const i32 *upS, const i32 *upI, const f64 *upW,
           const i32 *dnS, const i32 *dnI, const f64 *dnW, f64 pad, f64 padD, const f64 *alpha, i32 iters) {
  i32 it, k;
  for (it = 0; it < iters; it++) {
    f64 a = alpha[it]; i32 both = it % 3 == 2;
    for (k = 1; k < nL_; k++) pullRow(Y, Hh, Dm, ix + start[k], start[k + 1] - start[k], both ? 2 : 0, a, upS, upI, upW, dnS, dnI, dnW, pad, padD);
    for (k = nL_ - 2; k >= 0; k--) pullRow(Y, Hh, Dm, ix + start[k], start[k + 1] - start[k], both ? 2 : 1, a, upS, upI, upW, dnS, dnI, dnW, pad, padD);
  }
}
