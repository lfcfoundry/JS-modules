// Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
// Measure-only prototypes of Elias-Fano rivals, written for this study. Not shipped code.
// bp_*  : SIMD-BP128 style (Lemire and Boytsov): 128 gaps per block, one bit width per block, 4 lanes, per-block max + offset for skipping.
// svb_* : Stream VByte (Lemire, Kurz, Rupp): control bytes apart from data bytes, SIMD swizzle decode, gaps.
// bic_* : binary interpolative coding (Moffat and Stuiver), truncated binary codes, recursive.
#include <wasm_simd128.h>
typedef unsigned u32; typedef unsigned char u8; typedef unsigned long long u64;

static inline v128_t prefix4(v128_t x, v128_t *carry) {
  const v128_t z = wasm_i32x4_splat(0);
  x = wasm_i32x4_add(x, wasm_i8x16_shuffle(z, x, 0,1,2,3, 16,17,18,19, 20,21,22,23, 24,25,26,27));
  x = wasm_i32x4_add(x, wasm_i8x16_shuffle(z, x, 0,1,2,3, 0,1,2,3, 16,17,18,19, 20,21,22,23));
  x = wasm_i32x4_add(x, *carry);
  *carry = wasm_i32x4_shuffle(x, x, 3, 3, 3, 3);
  return x;
}

/* ---------------- SIMD-BP128 style ---------------- */
// meta: 3 u32 per block {last value, byte offset, width}. Returns payload bytes. a must be strictly increasing.
u32 bp_enc(const u32 *a, u32 n, u32 *meta, u32 *out) {
  u32 nb = (n + 127) >> 7, off = 0; u32 prev = 0;
  for (u32 b = 0; b < nb; b++) {
    u32 d[128], mx = 0, last = prev;
    for (u32 i = 0; i < 128; i++) { u32 k = b * 128 + i; u32 v = k < n ? a[k] : last; d[i] = v - last; last = v; if (d[i] > mx) mx = d[i]; }
    u32 w = 0; while (w < 32 && (mx >> w)) w++;
    u32 *o = out + (off >> 2);
    for (u32 i = 0; i < 4 * w; i++) o[i] = 0;
    for (u32 r = 0; r < 32; r++) for (u32 l = 0; l < 4; l++) {
      u32 v = d[4 * r + l], pos = r * w, k = pos >> 5, sh = pos & 31;
      o[k * 4 + l] |= v << sh;
      if (sh + w > 32) o[(k + 1) * 4 + l] |= v >> (32 - sh);
    }
    meta[3 * b] = last; meta[3 * b + 1] = off; meta[3 * b + 2] = w;
    off += 16 * w; prev = last;
  }
  return off;
}
static void bp_block(const u32 *p, u32 w, u32 prev, u32 *out) {
  const v128_t mask = wasm_i32x4_splat(w == 32 ? ~0u : ((1u << w) - 1)); v128_t carry = wasm_i32x4_splat(prev);
  for (u32 r = 0; r < 32; r++) {
    u32 pos = r * w, k = pos >> 5, sh = pos & 31;
    v128_t x = wasm_u32x4_shr(wasm_v128_load(p + 4 * k), sh);
    if (sh + w > 32) x = wasm_v128_or(x, wasm_i32x4_shl(wasm_v128_load(p + 4 * (k + 1)), 32 - sh));
    x = wasm_v128_and(x, mask);
    wasm_v128_store(out + 4 * r, prefix4(x, &carry));
  }
}
void bp_dec(const u32 *meta, u32 n, const u32 *data, u32 *out) {
  u32 nb = (n + 127) >> 7, tmp[128];
  for (u32 b = 0; b < nb; b++) {
    u32 prev = b ? meta[3 * b - 3] : 0, w = meta[3 * b + 2];
    const u32 *p = data + (meta[3 * b + 1] >> 2);
    if (b + 1 < nb) bp_block(p, w, prev, out + b * 128);
    else { bp_block(p, w, prev, tmp); for (u32 i = 0; b * 128 + i < n; i++) out[b * 128 + i] = tmp[i]; }
  }
}
// first value >= q for each query; 0xFFFFFFFF when none. Last decoded block is kept.
void bp_next_many(const u32 *meta, u32 n, const u32 *data, const u32 *qs, u32 nq, u32 *res, u32 *scratch) {
  u32 nb = (n + 127) >> 7; u32 cached = 0xFFFFFFFF;
  for (u32 t = 0; t < nq; t++) {
    u32 q = qs[t]; u32 lo = 0, hi = nb;
    while (lo < hi) { u32 m = (lo + hi) >> 1; if (meta[3 * m] < q) lo = m + 1; else hi = m; }
    if (lo == nb) { res[t] = n; continue; }
    if (lo != cached) { bp_block(data + (meta[3 * lo + 1] >> 2), meta[3 * lo + 2], lo ? meta[3 * lo - 3] : 0, scratch); cached = lo; }
    u32 cnt = (lo + 1 == nb) ? n - lo * 128 : 128, a = 0, c = cnt;
    while (a < c) { u32 m = (a + c) >> 1; if (scratch[m] < q) a = m + 1; else c = m; }
    res[t] = lo * 128 + a;
  }
}
// intersection: A decoded fully (the smaller list), B walked block by block (binary search over block maxima when the current block is behind).
u32 bp_and(const u32 *ma, u32 na, const u32 *da, const u32 *mb, u32 nbv, const u32 *db, u32 *outv, u32 *sa, u32 *sb) {
  bp_dec(ma, na, da, sa);
  u32 nbb = (nbv + 127) >> 7, cur = 0xFFFFFFFF, cnt = 0, pos = 0, blk = 0;
  for (u32 i = 0; i < na; i++) {
    u32 x = sa[i];
    if (mb[3 * blk] < x) {
      u32 a = blk + 1, c = nbb;
      while (a < c) { u32 m = (a + c) >> 1; if (mb[3 * m] < x) a = m + 1; else c = m; }
      blk = a; if (blk >= nbb) break; pos = 0;
    }
    if (blk != cur) { bp_block(db + (mb[3 * blk + 1] >> 2), mb[3 * blk + 2], blk ? mb[3 * blk - 3] : 0, sb); cur = blk; pos = 0; }
    u32 c2 = (blk + 1 == nbb) ? nbv - blk * 128 : 128;
    while (pos < c2 && sb[pos] < x) pos++;
    if (pos < c2 && sb[pos] == x) outv[cnt++] = x;
  }
  return cnt;
}

/* ---------------- Stream VByte ---------------- */
void svb_init(u8 *tbl, u8 *lens) {
  for (u32 c = 0; c < 256; c++) {
    u32 off = 0;
    for (u32 i = 0; i < 4; i++) { u32 len = ((c >> (2 * i)) & 3) + 1; for (u32 j = 0; j < 4; j++) tbl[c * 16 + 4 * i + j] = j < len ? (u8)(off + j) : 0x80; off += len; }
    lens[c] = (u8)off;
  }
}
// n padded up to a multiple of 4 by repeating the last value (gap 0). Returns data bytes; control bytes go to ctl.
u32 svb_enc(const u32 *a, u32 n, u8 *ctl, u8 *data) {
  u32 off = 0, prev = 0; u32 n4 = (n + 3) & ~3u;
  for (u32 i = 0; i < n4; i += 4) {
    u8 c = 0;
    for (u32 j = 0; j < 4; j++) {
      u32 v = i + j < n ? a[i + j] : prev, d = v - prev; prev = v;
      u32 len = d < 256 ? 1 : d < 65536 ? 2 : d < 16777216 ? 3 : 4;
      c |= (len - 1) << (2 * j);
      for (u32 q = 0; q < len; q++) data[off++] = (u8)(d >> (8 * q));
    }
    ctl[i >> 2] = c;
  }
  return off;
}
void svb_dec(const u8 *ctl, u32 n, const u8 *data, const u8 *tbl, const u8 *lens, u32 *out) {
  u32 n4 = (n + 3) & ~3u, off = 0; v128_t carry = wasm_i32x4_splat(0);
  for (u32 i = 0; i < n4; i += 4) {
    u8 c = ctl[i >> 2];
    v128_t x = wasm_i8x16_swizzle(wasm_v128_load(data + off), wasm_v128_load(tbl + c * 16));
    x = prefix4(x, &carry);
    if (i + 4 <= n) wasm_v128_store(out + i, x);
    else { u32 t[4]; wasm_v128_store(t, x); for (u32 j = 0; i + j < n; j++) out[i + j] = t[j]; }
    off += lens[c];
  }
}

/* ---------------- binary interpolative coding ---------------- */
static u32 *bw; static u64 bacc; static u32 bnb, bpos;
static void put(u32 v, u32 nbits) {
  if (!nbits) return;
  bacc |= (u64)v << bnb; bnb += nbits;
  while (bnb >= 32) { bw[bpos++] = (u32)bacc; bacc >>= 32; bnb -= 32; }
}
static u32 flog2(u32 x) { return 31 - __builtin_clz(x); }
static void putmb(u32 v, u32 r) { // truncated binary of v in [0, r)
  if (r <= 1) return;
  u32 k = flog2(r), u = (2u << k) - r;
  if (v < u) put(v, k); else { u32 x = v + u; put(x >> 1, k); put(x & 1, 1); }
}
static const u32 *ia;
static void bic_e(u32 i, u32 j, u32 vlo, u32 vhi) { // indices [i, j), values within [vlo, vhi]
  if (i >= j) return;
  u32 m = (i + j) >> 1, lower = vlo + (m - i), upper = vhi - (j - 1 - m);
  putmb(ia[m] - lower, upper - lower + 1);
  if (i < m) bic_e(i, m, vlo, ia[m] - 1);
  if (m + 1 < j) bic_e(m + 1, j, ia[m] + 1, vhi);
}
// returns bytes written
u32 bic_enc(const u32 *a, u32 n, u32 *out) {
  bw = out; bacc = 0; bnb = 0; bpos = 0; ia = a;
  bic_e(0, n, 0, a[n - 1]);
  if (bnb) { bw[bpos++] = (u32)bacc; }
  return bpos * 4;
}
static const u32 *rd; static u64 racc; static u32 rn, rpos; static u32 *oa;
static u32 getb(u32 nbits) {
  if (!nbits) return 0;
  while (rn < nbits) { racc |= (u64)rd[rpos++] << rn; rn += 32; }
  u32 v = (u32)(racc & ((1ull << nbits) - 1)); racc >>= nbits; rn -= nbits; return v;
}
static u32 getmb(u32 r) {
  if (r <= 1) return 0;
  u32 k = flog2(r), u = (2u << k) - r, y = getb(k);
  if (y < u) return y;
  return ((y << 1) | getb(1)) - u;
}
static void bic_d(u32 i, u32 j, u32 vlo, u32 vhi) {
  if (i >= j) return;
  u32 m = (i + j) >> 1, lower = vlo + (m - i), upper = vhi - (j - 1 - m);
  u32 v = lower + getmb(upper - lower + 1); oa[m] = v;
  if (i < m) bic_d(i, m, vlo, v - 1);
  if (m + 1 < j) bic_d(m + 1, j, v + 1, vhi);
}
void bic_dec(const u32 *in, u32 n, u32 maxv, u32 *out) {
  rd = in; racc = 0; rn = 0; rpos = 0; oa = out;
  bic_d(0, n, 0, maxv);
}
