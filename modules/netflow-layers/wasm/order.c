/* Copyright (c) 2026 LFC Foundry. MIT License.
 * netflow-layers in WebAssembly: the row-order search (order) and the row placement (place) of NetflowLayers.layered, on flat number lists.
 * The arithmetic is the same as the JavaScript in netflow-layers.js, in the same order, with no fused multiply-add (-ffp-contract=off), so every
 * place and every crossing count comes out equal to the last digit. Build: sh wasm/build.sh; embed: python3 wasm/embed.py.
 * All lists live in the module's memory; the JavaScript fills a block of numbers (P) that says where each list is. No allocation here. */
typedef int I;
typedef double D;
typedef unsigned char U8;
enum { NV, NL, MAXLEN, BASE, ROUNDS, BIG, ROWOFF, ORD, BEST, POS, LANE, BARY, UPOFF, UPIDX, DNOFF, DNIDX, SCR, FEN, TMP,
       UPW, DNW, BOTHOFF, BOTHIDX, BOTHW, CA, GAP, CHOKE, DUMMY, WIDE, ITERS, WANT, WT, GAPS, OFF, BS, BW, BN, OUT, DEEPMAX, DEEPSTALL, DEEPTG };
#define PI(x) ((I *)(P[x]))
#define PD(x) ((D *)(P[x]))

static D cross_between(I *P, I k) {
  I *ro = PI(ROWOFF), *ord = PI(ORD), *pos = PI(POS), *doff = PI(DNOFF), *didx = PI(DNIDX), *fen = PI(FEN);
  I a0 = ro[k], a1 = ro[k + 1], K = ro[k + 2] - ro[k + 1] + 1, i, j, t;
  D c = 0; I done = 0;
  for (i = 0; i <= K; i++) fen[i] = 0;
  for (i = a0; i < a1; i++) {
    I u = ord[i], s = doff[u], z = doff[u + 1];
    for (j = s; j < z; j++) { I q = 0; for (t = pos[didx[j]] + 1; t > 0; t -= t & -t) q += fen[t]; c += (D)(done - q); }
    for (j = s; j < z; j++) { for (t = pos[didx[j]] + 1; t <= K; t += t & -t) fen[t]++; done++; }
  }
  return c;
}
static D total_cross(I *P) { D c = 0; I k, nL = P[NL]; for (k = 0; k + 1 < nL; k++) c += cross_between(P, k); return c; }

/* is stop a before stop b in a row: lane, then middle place, then the place it had */
static int before(I *P, I a, I b) {
  D *lane = PD(LANE), *bary = PD(BARY); I *pos = PI(POS);
  D d = lane[a] - lane[b];
  if (d != 0) return d < 0;
  d = bary[a] - bary[b];
  if (d != 0) return d < 0;
  return pos[a] < pos[b];
}
static void sort_row(I *P, I *a, I n) {
  I *tmp = PI(TMP), i, j, w, lo, mid, hi, e;
  /* runs of 16 by insertion, then bottom-up merges; the order is total (the last tie-break is the place), so the result does not depend on the method */
  for (lo = 0; lo < n; lo += 16) {
    e = lo + 16 < n ? lo + 16 : n;
    for (i = lo + 1; i < e; i++) { I v = a[i]; for (j = i - 1; j >= lo && before(P, v, a[j]); j--) a[j + 1] = a[j]; a[j + 1] = v; }
  }
  for (w = 16; w < n; w *= 2) {
    for (lo = 0; lo < n; lo += 2 * w) {
      mid = lo + w < n ? lo + w : n; hi = lo + 2 * w < n ? lo + 2 * w : n;
      I x = lo, y = mid, o = lo;
      while (x < mid && y < hi) tmp[o++] = before(P, a[y], a[x]) ? a[y++] : a[x++];
      while (x < mid) tmp[o++] = a[x++];
      while (y < hi) tmp[o++] = a[y++];
    }
    for (i = 0; i < n; i++) a[i] = tmp[i];
  }
}
static void sweep(I *P, I k, const I *noff, const I *nidx, I median) {
  I *ro = PI(ROWOFF), *ord = PI(ORD), *pos = PI(POS), *scr = PI(SCR);
  D *bary = PD(BARY);
  I a0 = ro[k], n = ro[k + 1] - a0, i, j;
  for (i = 0; i < n; i++) {
    I v = ord[a0 + i], a = noff[v], z = noff[v + 1], cnt = z - a;
    if (median && cnt) {
      for (j = 0; j < cnt; j++) { I pv = pos[nidx[a + j]], q = j - 1; while (q >= 0 && scr[q] > pv) { scr[q + 1] = scr[q]; q--; } scr[q + 1] = pv; }
      I mid = cnt >> 1; bary[v] = cnt % 2 ? (D)scr[mid] : (D)(scr[mid - 1] + scr[mid]) / 2;
    } else if (cnt) { D sum = 0; for (j = a; j < z; j++) sum += (D)pos[nidx[j]]; bary[v] = sum / (D)cnt; }
    else bary[v] = (D)pos[v];
  }
  sort_row(P, ord + a0, n);
  for (i = 0; i < n; i++) pos[ord[a0 + i]] = i;
}
static void tally(I *P, I ax, I bx, const I *noff, const I *nidx, I *before_, I *after_) {
  I *pos = PI(POS), p, q;
  for (p = noff[ax]; p < noff[ax + 1]; p++) for (q = noff[bx]; q < noff[bx + 1]; q++) {
    I x = pos[nidx[p]], y = pos[nidx[q]];
    if (x > y) (*before_)++; else if (x < y) (*after_)++;
  }
}
static void transpose(I *P, I k, I tg) {
  I *ro = PI(ROWOFF), *ord = PI(ORD), *pos = PI(POS), nL = P[NL];
  D *lane = PD(LANE);
  I a0 = ro[k], n = ro[k + 1] - a0, improved = 1, guard = 0, i;
  while (improved && guard++ < tg) {
    improved = 0;
    for (i = 0; i + 1 < n; i++) {
      I a = ord[a0 + i], b = ord[a0 + i + 1], bf = 0, af = 0;
      if (lane[a] != lane[b]) continue;
      if (k + 1 < nL) tally(P, a, b, PI(DNOFF), PI(DNIDX), &bf, &af);
      if (k > 0) tally(P, a, b, PI(UPOFF), PI(UPIDX), &bf, &af);
      if (af < bf) { pos[a] = i + 1; pos[b] = i; ord[a0 + i] = b; ord[a0 + i + 1] = a; improved = 1; }
    }
  }
}
/* the whole order search: returns the crossings of the best order, which is left in BEST (and the work order in ORD) */
D order(I *P) {
  I nL = P[NL], nV = P[NV], k, i, it, rounds = P[ROUNDS], base = P[BASE], big = P[BIG];
  I *ord = PI(ORD), *best = PI(BEST), *pos = PI(POS);
  for (i = 0; i < nV; i++) best[i] = ord[i];
  D bestC = total_cross(P);
  for (it = 0; it < rounds && bestC > 0; it++) {
    I median = it >= base && (it - base) % 2 == 1;
    for (k = 1; k < nL; k++) sweep(P, k, PI(UPOFF), PI(UPIDX), median);
    for (k = nL - 2; k >= 0; k--) sweep(P, k, PI(DNOFF), PI(DNIDX), median);
    if (!big || it >= base) for (k = 0; k < nL; k++) transpose(P, k, 8);
    D c = total_cross(P);
    if (c < bestC) { bestC = c; for (i = 0; i < nV; i++) best[i] = ord[i]; }
  }
  /* deep: from the best order so far, rounds with neighbor swaps right after each row's sweep and a full swap pass; stops after DEEPSTALL rounds with no gain */
  if (P[DEEPMAX] > 0 && bestC > 0) {
    I *ro = PI(ROWOFF), tg = P[DEEPTG], stall = 0, d;
    for (i = 0; i < nV; i++) ord[i] = best[i];
    for (k = 0; k < nL; k++) for (i = ro[k]; i < ro[k + 1]; i++) pos[ord[i]] = i - ro[k];
    for (d = 0; d < P[DEEPMAX] && bestC > 0 && stall < P[DEEPSTALL]; d++) {
      I median = d % 2 == 1;
      for (k = 1; k < nL; k++) { sweep(P, k, PI(UPOFF), PI(UPIDX), median); transpose(P, k, tg); }
      for (k = nL - 2; k >= 0; k--) { sweep(P, k, PI(DNOFF), PI(DNIDX), median); transpose(P, k, tg); }
      for (k = 0; k < nL; k++) transpose(P, k, tg);
      D c = total_cross(P);
      if (c < bestC) { bestC = c; for (i = 0; i < nV; i++) best[i] = ord[i]; stall = 0; } else stall++;
    }
  }
  return bestC;
}

static void place_row(I *P, I k, const I *noff, const I *nidx, const D *nw) {
  I *ro = PI(ROWOFF), *ord = PI(ORD), *bn = PI(BN);
  D *cA = PD(CA), *gapb = PD(GAP), *want = PD(WANT), *wt = PD(WT), *gaps = PD(GAPS), *off = PD(OFF), *bs = PD(BS), *bw = PD(BW), *out = PD(OUT);
  U8 *choke = (U8 *)P[CHOKE], *dummy = (U8 *)P[DUMMY];
  I wide = P[WIDE], a0 = ro[k], n = ro[k + 1] - a0, i, j, m, at, bi, kk;
  if (!n) return;
  for (i = 0; i < n; i++) {
    I vi = ord[a0 + i], na = noff[vi], nz = noff[vi + 1];
    D s = 0, sw = 0;
    for (j = na; j < nz; j++) { s += cA[nidx[j]] * nw[j]; sw += nw[j]; }
    if (choke[vi]) { want[i] = 0; wt[i] = 1000; }
    else {
      D mid = sw ? s / sw : cA[vi];
      if (wide && sw && !dummy[vi] && nz - na > 1) {
        D lo = __builtin_inf(), hi = -__builtin_inf();
        for (j = na; j < nz; j++) { lo = __builtin_wasm_min_f64(lo, cA[nidx[j]]); hi = __builtin_wasm_max_f64(hi, cA[nidx[j]]); }
        mid = (lo + hi) / 2;
      }
      want[i] = mid; wt[i] = sw ? sw + (dummy[vi] ? 2 : 0) : 0.2;
    }
    if (i) gaps[i - 1] = gapb[vi];
  }
  off[0] = 0;
  for (i = 1; i < n; i++) off[i] = off[i - 1] + gaps[i - 1];
  m = 0;
  for (i = 0; i < n; i++) {
    bs[m] = wt[i] * (want[i] - off[i]); bw[m] = wt[i]; bn[m] = 1; m++;
    while (m > 1 && bs[m - 2] / bw[m - 2] > bs[m - 1] / bw[m - 1]) { m--; bs[m - 1] += bs[m]; bw[m - 1] += bw[m]; bn[m - 1] += bn[m]; }
  }
  at = 0;
  for (bi = 0; bi < m; bi++) { D val = bs[bi] / bw[bi]; for (kk = 0; kk < bn[bi]; kk++, at++) out[at] = val + off[at]; }
  for (i = 1; i < n; i++) if (out[i] < out[i - 1] + gaps[i - 1]) out[i] = out[i - 1] + gaps[i - 1];
  for (i = 0; i < n; i++) cA[ord[a0 + i]] = out[i];
}
/* up neighbors first, then down neighbors, for each stop */
static void build_both(I *P) {
  I nV = P[NV], i, j, at = 0;
  I *uo = PI(UPOFF), *ui = PI(UPIDX), *dof = PI(DNOFF), *di = PI(DNIDX), *bo = PI(BOTHOFF), *bi = PI(BOTHIDX);
  D *uw = PD(UPW), *dw = PD(DNW), *bw = PD(BOTHW);
  for (i = 0; i < nV; i++) {
    bo[i] = at;
    for (j = uo[i]; j < uo[i + 1]; j++) { bi[at] = ui[j]; bw[at++] = uw[j]; }
    for (j = dof[i]; j < dof[i + 1]; j++) { bi[at] = di[j]; bw[at++] = dw[j]; }
  }
  bo[nV] = at;
}
void place(I *P) {
  I nL = P[NL], it, k, iters = P[ITERS];
  build_both(P);
  for (it = 0; it < iters; it++) {
    I both = it % 3 == 2;
    for (k = 1; k < nL; k++) { if (both) place_row(P, k, PI(BOTHOFF), PI(BOTHIDX), PD(BOTHW)); else place_row(P, k, PI(UPOFF), PI(UPIDX), PD(UPW)); }
    for (k = nL - 2; k >= 0; k--) { if (both) place_row(P, k, PI(BOTHOFF), PI(BOTHIDX), PD(BOTHW)); else place_row(P, k, PI(DNOFF), PI(DNIDX), PD(DNW)); }
  }
}
