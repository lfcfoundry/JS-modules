/* Copyright (c) 2026 LFC Foundry. MIT License.
 * The picture-to-GIF-data half of gif-writer.js in WebAssembly: palette lookup of every pixel (with the same "nearest by eye-weighted distance, lower number wins a tie" rule),
 * the comparison with the previous picture, and the LZW coder. Whole numbers only, so the bytes are the same as the JavaScript code writes.
 * Build: wasm/build.sh, then wasm/embed.py. */
typedef unsigned int u32; typedef unsigned char u8; typedef int i32; typedef unsigned short u16;
#define CAP (1 << 20)
static i32 NP, SR[256], SG[256], SB[256], SI[256];   /* the palette sorted by green (equal greens by number) */
static i32 ck[CAP], used; static u8 cv[CAP];
static i32 l1k[1 << 14]; static u8 l1v[1 << 14];
static i32 hk[16384]; static u16 hv[16384];

static void fill_i32(i32 *p, i32 n, i32 v) { i32 i; for (i = 0; i < n; i++) p[i] = v; }

/* pal: np entries as four arrays of np ints one after the other: red, green, blue, number, all sorted by green */
void setup(i32 np, const i32 *pal) {
  i32 i; NP = np;
  for (i = 0; i < np; i++) { SR[i] = pal[i]; SG[i] = pal[np + i]; SB[i] = pal[2 * np + i]; SI[i] = pal[3 * np + i]; }
  fill_i32(ck, CAP, -1); used = 0; fill_i32(l1k, 1 << 14, -1);
}

static u8 nearest_slow(i32 col) {
  u32 h = ((u32)col * 0x9e3779b1u) >> 12;
  while (ck[h] != -1) { if (ck[h] == col) return cv[h]; h = (h + 1) & (CAP - 1); }
  i32 r = col >> 16, g = (col >> 8) & 255, b = col & 255, best = 0, bd = 1000000000, lo = 0, hi = NP, dg, gap, dd, at;
  while (lo < hi) { i32 mid = (lo + hi) >> 1; if (SG[mid] < g) lo = mid + 1; else hi = mid; }
  i32 down = lo - 1, up = lo;
  while (down >= 0 || up < NP) {
    if (down < 0 || (up < NP && SG[up] - g <= g - SG[down])) {
      dg = SG[up] - g; gap = dg * dg * 4;
      if (gap > bd) { up = NP; continue; }
      at = up++;
    } else {
      dg = SG[down] - g; gap = dg * dg * 4;
      if (gap > bd) { down = -1; continue; }
      at = down--;
    }
    i32 dr = SR[at] - r, db = SB[at] - b;
    dd = dr * dr * 2 + gap + db * db * 3;
    if (dd < bd || (dd == bd && SI[at] < best)) { bd = dd; best = SI[at]; }
  }
  if (used > (i32)(CAP * 0.6)) { fill_i32(ck, CAP, -1); used = 0; h = ((u32)col * 0x9e3779b1u) >> 12; while (ck[h] != -1) h = (h + 1) & (CAP - 1); }
  ck[h] = col; cv[h] = (u8)best; used++;
  return (u8)best;
}
static inline u8 nearest(i32 col) {
  u32 h1 = ((u32)col * 0x9e3779b1u) >> 18;
  if (l1k[h1] == col) return l1v[h1];
  u8 v = nearest_slow(col); l1k[h1] = col; l1v[h1] = v; return v;
}
static inline i32 rgb_of(u32 px) { return (i32)(((px & 255) << 16) | (px & 0xff00) | ((px >> 16) & 255)); }

/* One picture. w: its pixels (as little-endian words), pr: the last picture's pixels, idx: the palette numbers of the last picture, rewritten here for the places that changed, chg: room for a list of
   the places whose number changed. first != 0: no earlier picture (idx is filled whole). res gets minx, miny, maxx, maxy of the changed numbers. Returns how many places changed numbers (first: all of them). */
i32 frame(i32 first, const u32 *w, const u32 *pr, u8 *idx, i32 *chg, i32 width, i32 height, i32 *res) {
  i32 n = width * height, i, x, y, nchg = 0, minx = width, miny = height, maxx = -1, maxy = -1;
  i32 lastIdx = 0; i32 haveLast = 0; u32 last = 0;
  if (first) {
    for (i = 0; i < n; i++) { u32 px = w[i]; if (haveLast && px == last) { idx[i] = (u8)lastIdx; continue; } last = px; haveLast = 1; lastIdx = nearest(rgb_of(px)); idx[i] = (u8)lastIdx; }
    res[0] = 0; res[1] = 0; res[2] = width - 1; res[3] = height - 1;
    return n;
  }
  for (y = 0, i = 0; y < height; y++) {
    i32 rowEnd = i + width, rowHit = 0;
    for (x = i; x < rowEnd; x++) {
      u32 px = w[x];
      if (px == pr[x]) continue;
      if (!(haveLast && px == last)) { last = px; haveLast = 1; lastIdx = nearest(rgb_of(px)); }
      if (idx[x] != (u8)lastIdx) { idx[x] = (u8)lastIdx; rowHit = 1; chg[nchg++] = x; if (x - i < minx) minx = x - i; if (x - i > maxx) maxx = x - i; }
    }
    if (rowHit) { if (y < miny) miny = y; maxy = y; }
    i = rowEnd;
  }
  res[0] = minx; res[1] = miny; res[2] = maxx; res[3] = maxy;
  return nchg;
}

/* LZW (minimum code size 8) of data[0..len), walking runs of one value in a few steps like the JavaScript coder does (see lzw() there: in a run of c the table holds c, cc, ccc ... and the
   code to emit is the longest of them, a fixed pattern). The bytes are the same as the item-by-item coder gives. out has room for ceil((len + 8) * 1.51) + 64 bytes. Returns the length. */
static u16 rc[256][4097]; static i32 top[256]; static i32 topLen[256];
static void reset_chains(void) { i32 q; for (q = 0; q < 256; q++) if (top[q] >= 0) { top[q] = -1; topLen[q] = 0; } }
static void chain_of(i32 sym) { if (top[sym] < 0) { top[sym] = sym; topLen[sym] = 1; rc[sym][1] = (u16)sym; } }
i32 lzw(const u8 *data, i32 len, u8 *out) {
  const i32 minCode = 8; i32 clearCode = 1 << minCode, eoi = clearCode + 1, next = eoi + 1, size = minCode + 1, i, o = 0; u32 cur = 0; i32 shift = 0;
  fill_i32(hk, 16384, 0); fill_i32(top, 256, -1); fill_i32(topLen, 256, 0);
#define EMIT(code) do { cur |= (u32)(code) << shift; shift += size; while (shift >= 8) { out[o++] = (u8)(cur & 255); cur >>= 8; shift -= 8; } } while (0)
  EMIT(clearCode);
  if (len) {
    i32 prefix = data[0];
    for (i = 1; i < len; i++) {
      i32 k = data[i];
      if (prefix == k && k < clearCode) {   /* the lookahead symbol starts a run of k */
        i32 j = i + 1, T, m, c = k; while (j < len && data[j] == k) j++;
        T = j - i + 1;
        chain_of(c); m = topLen[c];
        while (T > m) {
          EMIT(rc[c][m]);
          T -= m;
          if (next == 4096) { EMIT(clearCode); next = eoi + 1; size = minCode + 1; fill_i32(hk, 16384, 0); reset_chains(); chain_of(c); m = 1; }
          else {
            if (next >= (1 << size)) size++;
            i32 rkey = (((i32)rc[c][m] << 8) | c) + 1; u32 rh = ((u32)rkey * 0x9e3779b1u) >> 18;
            while (hk[rh] != 0) rh = (rh + 1) & 16383;
            hk[rh] = rkey; hv[rh] = (u16)next; m++; rc[c][m] = (u16)next; top[c] = next; topLen[c] = m; next++;
          }
        }
        prefix = rc[c][T];
        i = j - 1;
        continue;
      }
      i32 key = ((prefix << 8) | k) + 1; u32 h = ((u32)key * 0x9e3779b1u) >> 18; i32 e = hk[h];
      while (e != 0 && e != key) { h = (h + 1) & 16383; e = hk[h]; }
      if (e == key) { prefix = hv[h]; continue; }
      EMIT(prefix);
      if (next == 4096) { EMIT(clearCode); next = eoi + 1; size = minCode + 1; fill_i32(hk, 16384, 0); reset_chains(); }
      else {
        if (next >= (1 << size)) size++;
        hk[h] = key; hv[h] = (u16)next;
        if (top[k] == prefix) { i32 l2 = topLen[k] + 1; topLen[k] = l2; top[k] = next; rc[k][l2] = (u16)next; }
        next++;
      }
      prefix = k;
    }
    EMIT(prefix);
  }
  EMIT(eoi);
  if (shift > 0) out[o++] = (u8)(cur & 255);
  return o;
}

/* The data of one picture's frame and its LZW code. first: the whole picture; else only the changed rectangle x0, y0, fw, fh with the unchanged places transparent (255). */
i32 encode(i32 first, const u8 *idx, const i32 *chg, i32 nchg, i32 width, i32 x0, i32 y0, i32 fw, i32 fh, u8 *data, u8 *out) {
  i32 i;
  if (first) return lzw(idx, width * fh, out);
  for (i = 0; i < fw * fh; i++) data[i] = 255;
  for (i = 0; i < nchg; i++) { i32 at = chg[i], yy = at / width; data[(yy - y0) * fw + (at - yy * width - x0)] = idx[at]; }
  return lzw(data, fw * fh, out);
}

/* ---- the palette search (makePalette): color histogram, median cut, k-means. The arithmetic is done in the same order as the JavaScript code, with no fused multiply-add, so the decimals match. ---- */
static inline double jsround(double x) { double f = __builtin_floor(x); return (x - f >= 0.5) ? f + 1 : f; }   /* JavaScript's Math.round: halves go up */

/* Clears the table of pairs (color + 1, count): 2 ints per slot, 1 << hb slots. */
void hist_reset(i32 *tbl, i32 hb) { i32 n = 2 << hb, i; for (i = 0; i < n; i++) tbl[i] = 0; }

/* Counts the colors of one picture (n pixels, every `stride`th). uniq: distinct colors so far; cap: stop when more than this many. Returns the new count. */
i32 hist_picture(const u32 *w, i32 n, i32 stride, i32 *tbl, i32 hb, i32 mask, i32 uniq, i32 cap) {
  i32 i, last = -2, lastSlot = 0, hs1 = (1 << hb) - 1;
  for (i = 0; i < n; i += stride) {
    i32 col = rgb_of(w[i]) & mask;
    if (col == last) { tbl[lastSlot]++; continue; }
    u32 h = ((u32)col * 0x9e3779b1u) >> (32 - hb); i32 c1 = col + 1, e = tbl[h * 2];
    while (e != 0 && e != c1) { h = (h + 1) & hs1; e = tbl[h * 2]; }
    if (e == 0) { tbl[h * 2] = c1; uniq++; if (uniq > cap) break; }
    lastSlot = h * 2 + 1; tbl[lastSlot]++; last = col;
  }
  return uniq;
}

/* The distinct colors in slot order: red, green, blue as bytes, count as double. Returns how many. */
i32 hist_extract(const i32 *tbl, i32 hb, u8 *R, u8 *G, u8 *B, double *C) {
  i32 hs = 1 << hb, i, u = 0;
  for (i = 0; i < hs; i++) if (tbl[i * 2] != 0) { i32 kc = tbl[i * 2] - 1; R[u] = (u8)(kc >> 16); G[u] = (u8)((kc >> 8) & 255); B[u] = (u8)(kc & 255); C[u] = (double)tbl[i * 2 + 1]; u++; }
  return u;
}

typedef struct { i32 lo, hi, ch; double score, tot; } Box;
static Box boxes[256];
static double wsum[256]; static i32 num[256];
static double cr[256], cg[256], cb[256], gv[256], rv[256], bv[256], sr[256], sg[256], sb[256], st[256];
static i32 byG[256];

static Box mk_box(i32 lo, i32 hi, i32 r0, i32 r1, i32 g0, i32 g1, i32 b0, i32 b1, double tot) {
  i32 dr = r1 - r0, dg = g1 - g0, db = b1 - b0, mx = dr > dg ? dr : dg; if (db > mx) mx = db;
  Box b; b.lo = lo; b.hi = hi; b.ch = (dr >= dg && dr >= db) ? 0 : (dg >= db ? 1 : 2); b.score = (hi - lo < 2) ? 0 : (double)mx * __builtin_sqrt(tot); b.tot = tot; return b;
}
static void sort_ints(i32 *a, i32 n) {   /* ascending; heap sort (the values are all different, so any sort gives the same order) */
  i32 i, s, c, t, end;
  for (i = n / 2 - 1; i >= 0; i--) { s = i; for (;;) { c = 2 * s + 1; if (c >= n) break; if (c + 1 < n && a[c + 1] > a[c]) c++; if (a[s] >= a[c]) break; t = a[s]; a[s] = a[c]; a[c] = t; s = c; } }
  for (end = n - 1; end > 0; end--) { t = a[0]; a[0] = a[end]; a[end] = t; s = 0; for (;;) { c = 2 * s + 1; if (c >= end) break; if (c + 1 < end && a[c + 1] > a[c]) c++; if (a[s] >= a[c]) break; t = a[s]; a[s] = a[c]; a[c] = t; s = c; } }
}

/* Median cut then k-means on the uniq colors (R, G, B bytes, C counts); order and scratch: uniq ints each. out gets the number of colors, then red, green, blue of each (rounded). */
i32 quantize(i32 uniq, i32 maxColors, const u8 *R, const u8 *G, const u8 *B, const double *C, i32 *order, i32 *scratch, i32 *out) {
  const u8 *chans[3]; chans[0] = R; chans[1] = G; chans[2] = B;
  i32 i, nb = 0, q, v;
  for (i = 0; i < uniq; i++) order[i] = i;
  {
    i32 r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0; double tot0 = 0;
    for (i = 0; i < uniq; i++) { i32 rr = R[i], gg = G[i], bb = B[i]; if (rr < r0) r0 = rr; if (rr > r1) r1 = rr; if (gg < g0) g0 = gg; if (gg > g1) g1 = gg; if (bb < b0) b0 = bb; if (bb > b1) b1 = bb; tot0 += C[i]; }
    boxes[nb++] = mk_box(0, uniq, r0, r1, g0, g1, b0, b1, tot0);
  }
  while (nb < maxColors) {
    i32 bi = -1; double bs = 0;
    for (q = 0; q < nb; q++) if (boxes[q].score > bs) { bs = boxes[q].score; bi = q; }
    if (bi < 0) break;
    Box bx = boxes[bi]; const u8 *ch = chans[bx.ch];
    i32 size = bx.hi - bx.lo, o2, below = 0; double half = bx.tot / 2, run = 0;
    for (v = 0; v < 256; v++) { wsum[v] = 0; num[v] = 0; }
    for (q = bx.lo; q < bx.hi; q++) { o2 = order[q]; v = ch[o2]; wsum[v] += C[o2]; num[v]++; }
    for (v = 0; v < 256; v++) { if (num[v] && run + wsum[v] >= half) break; run += wsum[v]; below += num[v]; }
    i32 m = num[v], gn = 0, pl; i32 *g = scratch;
    for (q = bx.lo; q < bx.hi; q++) { o2 = order[q]; if (ch[o2] == v) g[gn++] = o2; }
    sort_ints(g, gn);
    for (pl = 0; pl < m; pl++) { run += C[g[pl]]; if (run >= half) break; }
    if (below + pl + 1 > size - 1) pl--;
    i32 T = pl >= 0 ? g[pl] : -1, a = bx.lo, b2 = 0, cut = bx.lo + below + pl + 1; i32 *tmp = scratch;
    i32 lr0 = 255, lr1 = 0, lg0 = 255, lg1 = 0, lb0 = 255, lb1 = 0, ur0 = 255, ur1 = 0, ug0 = 255, ug1 = 0, ub0 = 255, ub1 = 0; double lt = 0, ut = 0;
    for (q = bx.lo; q < bx.hi; q++) {
      o2 = order[q]; i32 v2 = ch[o2], cr3 = R[o2], cg3 = G[o2], cb3 = B[o2];
      if (v2 < v || (v2 == v && o2 <= T)) {
        order[a++] = o2; lt += C[o2];
        if (cr3 < lr0) lr0 = cr3; if (cr3 > lr1) lr1 = cr3; if (cg3 < lg0) lg0 = cg3; if (cg3 > lg1) lg1 = cg3; if (cb3 < lb0) lb0 = cb3; if (cb3 > lb1) lb1 = cb3;
      } else {
        tmp[b2++] = o2; ut += C[o2];
        if (cr3 < ur0) ur0 = cr3; if (cr3 > ur1) ur1 = cr3; if (cg3 < ug0) ug0 = cg3; if (cg3 > ug1) ug1 = cg3; if (cb3 < ub0) ub0 = cb3; if (cb3 > ub1) ub1 = cb3;
      }
    }
    for (q = 0; q < b2; q++) order[a + q] = tmp[q];
    for (q = nb; q > bi + 1; q--) boxes[q] = boxes[q - 1];
    nb++;
    boxes[bi] = mk_box(bx.lo, cut, lr0, lr1, lg0, lg1, lb0, lb1, lt);
    boxes[bi + 1] = mk_box(cut, bx.hi, ur0, ur1, ug0, ug1, ub0, ub1, ut);
  }
  i32 K = nb, k;
  for (k = 0; k < K; k++) {
    double r = 0, g = 0, b = 0, t = 0;
    for (q = boxes[k].lo; q < boxes[k].hi; q++) { i32 o = order[q]; double c = C[o]; r += R[o] * c; g += G[o] * c; b += B[o] * c; t += c; }
    cr[k] = r / t; cg[k] = g / t; cb[k] = b / t;
  }
  i32 rounds = ((double)uniq * (double)K <= 6e7) ? 2 : ((double)uniq * (double)K <= 3e8 ? 1 : 0), it;
  for (it = 0; it < rounds; it++) {
    i32 k2;
    for (k2 = 0; k2 < K; k2++) { sr[k2] = 0; sg[k2] = 0; sb[k2] = 0; st[k2] = 0; byG[k2] = k2; }
    for (k2 = 1; k2 < K; k2++) {   /* insertion sort by green then number, the order the JavaScript comparator gives */
      i32 x = byG[k2], j = k2 - 1;
      while (j >= 0 && (cg[byG[j]] > cg[x] || (cg[byG[j]] == cg[x] && byG[j] > x))) { byG[j + 1] = byG[j]; j--; }
      byG[j + 1] = x;
    }
    for (k2 = 0; k2 < K; k2++) { gv[k2] = cg[byG[k2]]; rv[k2] = cr[byG[k2]]; bv[k2] = cb[byG[k2]]; }
    for (i = 0; i < uniq; i++) {
      i32 r2 = R[i], g2 = G[i], b2 = B[i], best = 0, kk, lo2 = 0, hi2 = K; double bd = 1e18, dr2, dg2, db2, dd, gap;
      while (lo2 < hi2) { i32 mid = (lo2 + hi2) >> 1; if (gv[mid] < g2) lo2 = mid + 1; else hi2 = mid; }
      i32 down = lo2 - 1, up = lo2;
      while (down >= 0 || up < K) {
        if (down < 0 || (up < K && gv[up] - g2 <= g2 - gv[down])) {
          dg2 = gv[up] - g2; gap = dg2 * dg2 * 4;
          if (gap > bd) { up = K; continue; }
          dr2 = rv[up] - r2; db2 = bv[up] - b2; kk = up++;
        } else {
          dg2 = gv[down] - g2; gap = dg2 * dg2 * 4;
          if (gap > bd) { down = -1; continue; }
          dr2 = rv[down] - r2; db2 = bv[down] - b2; kk = down--;
        }
        dd = dr2 * dr2 * 2 + gap + db2 * db2 * 3;
        if (dd < bd || (dd == bd && byG[kk] < best)) { bd = dd; best = byG[kk]; }
      }
      double c2 = C[i]; sr[best] += r2 * c2; sg[best] += g2 * c2; sb[best] += b2 * c2; st[best] += c2;
    }
    for (k2 = 0; k2 < K; k2++) if (st[k2] > 0) { cr[k2] = sr[k2] / st[k2]; cg[k2] = sg[k2] / st[k2]; cb[k2] = sb[k2] / st[k2]; }
  }
  out[0] = K;
  for (k = 0; k < K; k++) { out[1 + 3 * k] = (i32)jsround(cr[k]); out[2 + 3 * k] = (i32)jsround(cg[k]); out[3 + 3 * k] = (i32)jsround(cb[k]); }
  return K;
}
