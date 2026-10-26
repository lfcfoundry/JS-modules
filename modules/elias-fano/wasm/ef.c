// Copyright (c) 2026 LFC Foundry. MIT License.
// Elias-Fano coded sorted integer lists: build, access by position, "first value at or above x", batches of both, and decode of the whole list.
// Same format and same answers as the plain JavaScript in the module; wasm/build.sh makes ef.wasm (plain) and ef-simd.wasm (this file with -msimd128).
// Format (all little endian; offsets are from the start of the blob; every section starts on an 8 byte boundary):
//   0 magic 45 46 01 00 | 4 n | 8 maxv | 12 l (low bits per value) | 16 s (one sample per 2^s) | 20 nbits (n + (maxv >> l) + 1) | 24 lowOff | 28 highOff | 32 s1Off | 36 s0Off | 40 total length
//   low: n values of l bits, packed from bit 0 (plus 8 spare bytes) | high: nbits bits, bit (v >> l) + i is set for value i | s1: bit position of every 2^s-th one (u32) | s0: bit position of every 2^s-th zero (u32)
#ifdef __wasm_simd128__
#include <wasm_simd128.h>
#endif
typedef unsigned char u8; typedef unsigned short u16; typedef unsigned int u32; typedef unsigned long long u64;
#define POP(x) __builtin_popcountll(x)
#define CTZ(x) __builtin_ctzll(x)
#define HDR 64

static inline u32 rd32(const u8 *b, u32 off) { return *(const u32 *)(b + off); }
static inline u64 mask(u32 l) { return l >= 32 ? 0xffffffffULL : ((1ULL << l) - 1ULL); }
static inline u64 lowAt(const u8 *low, u32 l, u32 i) {   // the l low bits of value i
  u64 p = (u64)i * l; u32 w = (u32)(p >> 5), sh = (u32)(p & 31);
  u64 v = ((u64)*(const u32 *)(low + w * 4 + 4) << 32) | *(const u32 *)(low + w * 4);
  return (v >> sh) & mask(l);
}
static inline u32 sel64(u64 x, u32 r) {   // position of the r-th (from 0) set bit of x; x has more than r bits set
  u32 pos = 0, c;
  c = POP((u32)x); if (r >= c) { r -= c; x >>= 32; pos = 32; }
  c = POP(x & 0xffff); if (r >= c) { r -= c; x >>= 16; pos += 16; }
  c = POP(x & 0xff); if (r >= c) { r -= c; x >>= 8; pos += 8; }
  while (r) { x &= x - 1; r--; }
  return pos + CTZ(x);
}
static inline u32 select1(const u64 *H, const u32 *s1, u32 s, u32 i) {
  u32 k = i >> s, pos = s1[k], rem = i - (k << s), w = pos >> 6, c;
  u64 cur = H[w] & (~0ULL << (pos & 63));
  while (rem >= (c = POP(cur))) { rem -= c; cur = H[++w]; }
  return w * 64 + sel64(cur, rem);
}
static inline u32 select0(const u64 *H, const u32 *s0, u32 s, u32 j) {
  u32 k = j >> s, pos = s0[k], rem = j - (k << s), w = pos >> 6, c;
  u64 cur = ~H[w] & (~0ULL << (pos & 63));
  while (rem >= (c = POP(cur))) { rem -= c; cur = ~H[++w]; }
  return w * 64 + sel64(cur, rem);
}
#define OPEN(B) u32 n = rd32(b, 4), maxv = rd32(b, 8), l = rd32(b, 12), s = rd32(b, 16), nbits = rd32(b, 20); \
  const u8 *low = b + rd32(b, 24); const u64 *H = (const u64 *)(b + rd32(b, 28)); const u32 *s1 = (const u32 *)(b + rd32(b, 32)), *s0 = (const u32 *)(b + rd32(b, 36)); (void)nbits; (void)maxv; (void)s0; (void)s1; (void)H; (void)low; (void)n; (void)l; (void)s;

static inline u32 getOne(const u8 *b, u32 i) {
  OPEN(b)
  u32 h = select1(H, s1, s, i) - i;
  return (u32)(((u64)h << l) | lowAt(low, l, i));
}
// index of the first value >= x, or n when there is none
static inline u32 nextOne(const u8 *b, u32 x) {
  OPEN(b)
  if (n == 0 || x > maxv) return n;
  u32 h = (u32)((u64)x >> l), i, sp;
  u64 xl = (u64)x & mask(l);
  if (h == 0) { i = 0; sp = 0; } else { u32 pz = select0(H, s0, s, h - 1); i = pz - (h - 1); sp = pz + 1; }
  while (i < n) {
    if (!((H[sp >> 6] >> (sp & 63)) & 1)) return i;   // the bucket of h ended: this value is bigger than x
    if (lowAt(low, l, i) >= xl) return i;
    i++; sp++;
  }
  return n;
}
// like nextOne, and also gives the value found (valid when the answer is < n)
static inline u32 nextOneV(const u8 *b, u32 x, u32 *val) {
  OPEN(b)
  if (n == 0 || x > maxv) return n;
  u32 h = (u32)((u64)x >> l), i, sp;
  u64 xl = (u64)x & mask(l);
  if (h == 0) { i = 0; sp = 0; } else { u32 pz = select0(H, s0, s, h - 1); i = pz - (h - 1); sp = pz + 1; }
  while (i < n) {
    if (!((H[sp >> 6] >> (sp & 63)) & 1)) { *val = getOne(b, i); return i; }   // the bucket of h ended: this value is bigger than x
    u64 lo = lowAt(low, l, i);
    if (lo >= xl) { *val = (u32)(((u64)(sp - i) << l) | lo); return i; }
    i++; sp++;
  }
  return n;
}
u32 ef_get(const u8 *b, u32 i) { return getOne(b, i); }
u32 ef_next(const u8 *b, u32 x) { return nextOne(b, x); }
void ef_get_many(const u8 *b, const u32 *idx, u32 *out, u32 k) { for (u32 j = 0; j < k; j++) out[j] = getOne(b, idx[j]); }
void ef_next_many(const u8 *b, const u32 *xs, u32 *out, u32 k) { for (u32 j = 0; j < k; j++) out[j] = nextOne(b, xs[j]); }

// every value, in order, into out[n]
void ef_decode(const u8 *b, u32 *out) {
  OPEN(b)
  u32 i = 0, nw = (nbits + 63) >> 6;
  for (u32 w = 0; w < nw && i < n; w++) {
    u64 x = H[w];
    while (x && i < n) { u32 bit = CTZ(x); out[i] = (w * 64 + bit) - i; i++; x &= x - 1; }
  }
  u32 j = 0;
#ifdef __wasm_simd128__
  if (l == 16) {
    for (; j + 8 <= n; j += 8) {
      v128_t lo = wasm_v128_load((const u8 *)low + j * 2);
      v128_t a = wasm_u32x4_extend_low_u16x8(lo), c = wasm_u32x4_extend_high_u16x8(lo);
      wasm_v128_store(out + j, wasm_v128_or(wasm_i32x4_shl(wasm_v128_load(out + j), 16), a));
      wasm_v128_store(out + j + 4, wasm_v128_or(wasm_i32x4_shl(wasm_v128_load(out + j + 4), 16), c));
    }
  } else if (l == 8) {
    for (; j + 16 <= n; j += 16) {
      v128_t lo = wasm_v128_load((const u8 *)low + j);
      v128_t l16 = wasm_u16x8_extend_low_u8x16(lo), h16 = wasm_u16x8_extend_high_u8x16(lo);
      wasm_v128_store(out + j, wasm_v128_or(wasm_i32x4_shl(wasm_v128_load(out + j), 8), wasm_u32x4_extend_low_u16x8(l16)));
      wasm_v128_store(out + j + 4, wasm_v128_or(wasm_i32x4_shl(wasm_v128_load(out + j + 4), 8), wasm_u32x4_extend_high_u16x8(l16)));
      wasm_v128_store(out + j + 8, wasm_v128_or(wasm_i32x4_shl(wasm_v128_load(out + j + 8), 8), wasm_u32x4_extend_low_u16x8(h16)));
      wasm_v128_store(out + j + 12, wasm_v128_or(wasm_i32x4_shl(wasm_v128_load(out + j + 12), 8), wasm_u32x4_extend_high_u16x8(h16)));
    }
  }
#endif
  for (; j < n; j++) out[j] = (u32)(((u64)out[j] << l) | lowAt(low, l, j));
}

// build the blob at out (already zero filled, length from the layout the caller worked out) from values[n], sorted, n >= 1
void ef_build(const u32 *v, u32 n, u32 l, u32 s, u32 lowOff, u32 highOff, u32 s1Off, u32 s0Off, u32 total, u8 *out) {
  u32 maxv = v[n - 1], nbits = n + (maxv >> l) + 1;
  *(u32 *)(out + 0) = 0x00014645u; *(u32 *)(out + 4) = n; *(u32 *)(out + 8) = maxv; *(u32 *)(out + 12) = l; *(u32 *)(out + 16) = s; *(u32 *)(out + 20) = nbits;
  *(u32 *)(out + 24) = lowOff; *(u32 *)(out + 28) = highOff; *(u32 *)(out + 32) = s1Off; *(u32 *)(out + 36) = s0Off; *(u32 *)(out + 40) = total;
  u8 *low = out + lowOff; u64 *H = (u64 *)(out + highOff); u32 *a1 = (u32 *)(out + s1Off), *a0 = (u32 *)(out + s0Off);
  u64 m = mask(l);
  for (u32 i = 0; i < n; i++) {
    u32 x = v[i];
    if (l) { u64 p = (u64)i * l; u32 w = (u32)(p >> 5), sh = (u32)(p & 31); u64 val = ((u64)x & m) << sh; *(u32 *)(low + w * 4) |= (u32)val; *(u32 *)(low + w * 4 + 4) |= (u32)(val >> 32); }
    u32 pos = (x >> l) + i; H[pos >> 6] |= 1ULL << (pos & 63);
  }
  // samples: bit position of every 2^s-th one (value i sits at (v[i] >> l) + i) and of every 2^s-th zero (zero j sits at j + the number of values whose high part is <= j)
  u32 step = 1u << s, zeros = (maxv >> l) + 1, c = 0;
  for (u32 k = 0, i = 0; i < n; k++, i += step) a1[k] = (v[i] >> l) + i;
  for (u32 k = 0, j = 0; j < zeros; k++, j += step) { while (c < n && (v[c] >> l) <= j) c++; a0[k] = j + c; }
}

// ---- partitioned lists (since 1.2.0): chunks of 2^logC values (the last one shorter), each coded as the cheapest of a dense range, a bitmap or Elias-Fano ----
// Format (little endian, every section on a 4 byte boundary): header 48 bytes: 0 magic 46 50 01 00 | 4 n | 8 logC | 12 nc | 16 firstOff | 20 lastOff | 24 offOff | 28 metaOff | 32 payloadOff | 36 total
//   first[nc]: first value of each chunk | last[nc]: last value | off[nc+1]: byte offset of each chunk's payload from payloadOff | meta[nc] (u8, padded to 4): type (0 dense, 1 bitmap, 2 Elias-Fano) in bits 0-1, l in bits 2-6
//   dense: no payload (values first, first+1, ...) | bitmap: bit (v - first) for every value, span + 1 bits | Elias-Fano: (n*l bits + 32 spare bits, in words) low bits, then n + (span >> l) + 1 high bits in words
static inline u32 popw(u32 x) { return (u32)__builtin_popcount(x); }
static inline u32 ctzw(u32 x) { return (u32)__builtin_ctz(x); }
static inline u32 selw(u32 x, u32 r) { while (r) { x &= x - 1; r--; } return ctzw(x); }   // r-th (from 0) set bit
#define POPEN(B) const u32 *hd = (const u32 *)(B); u32 n = hd[1], logC = hd[2], nc = hd[3]; \
  const u32 *first = hd + (hd[4] >> 2), *last = hd + (hd[5] >> 2), *off = hd + (hd[6] >> 2); const u8 *meta = (const u8 *)hd + hd[7]; const u32 *pay = hd + (hd[8] >> 2); (void)n; (void)nc
static inline u32 chunkN(u32 n, u32 logC, u32 nc, u32 c) { return c + 1 < nc ? (1u << logC) : n - ((nc - 1) << logC); }
static inline u32 lowW(const u32 *w, u32 l, u32 j) {
  u32 p = j * l, i = p >> 5, sh = p & 31; u64 v = ((u64)w[i + 1] << 32) | w[i];
  return (u32)((v >> sh) & mask(l));
}
static u32 pChunkGet(const u32 *p, u32 meta, u32 nci, u32 j, u32 f, u32 lastv) {   // value number j of a chunk with nci values
  u32 t = meta & 3, l = meta >> 2;
  (void)lastv;
  if (t == 0) return f + j;
  if (t == 1) { u32 w = 0, r = j, c; while (r >= (c = popw(p[w]))) { r -= c; w++; } return f + w * 32 + selw(p[w], r); }
  const u32 *H = p + (((nci * l + 31) >> 5) + 1); u32 w = 0, r = j, c;
  while (r >= (c = popw(H[w]))) { r -= c; w++; }
  u32 pos = w * 32 + selw(H[w], r);
  return f + (u32)((((u64)(pos - j)) << l) | lowW(p, l, j));
}
// index inside the chunk of the first value >= f + d, 1 <= d <= span (so there is one)
static u32 pChunkNext(const u32 *p, u32 meta, u32 nci, u32 d, u32 span) {
  u32 t = meta & 3, l = meta >> 2;
  if (t == 0) return d;
  if (t == 1) {
    u32 wq = d >> 5, cnt = 0, w; for (w = 0; w < wq; w++) cnt += popw(p[w]);
    if (d & 31) cnt += popw(p[wq] & ((1u << (d & 31)) - 1));
    return cnt;
  }
  const u32 *H = p + (((nci * l + 31) >> 5) + 1); u32 nhw = (nci + (u32)(((u64)span) >> l) + 1 + 31) >> 5;
  u32 h = (u32)((u64)d >> l), xl = (u32)((u64)d & mask(l)), j, q, w, c;
  if (h == 0) { j = 0; q = 0; } else { u32 r = h - 1; w = 0; while (r >= (c = popw(~H[w]))) { r -= c; w++; } u32 pz = w * 32 + selw(~H[w], r); j = pz - (h - 1); q = pz + 1; }
  while (j < nci) {
    w = q >> 5; u32 x = H[w] & (0xffffffffu << (q & 31));
    while (x == 0) { w++; if (w >= nhw) return nci; x = H[w]; }
    u32 pos = w * 32 + ctzw(x), hj = pos - j;
    if (hj > h) return j;
    if (lowW(p, l, j) >= xl) return j;
    j++; q = pos + 1;
  }
  return nci;
}
static void pChunkDecode(const u32 *p, u32 meta, u32 nci, u32 f, u32 *out) {
  u32 t = meta & 3, l = meta >> 2, j = 0;
  if (t == 0) { for (; j < nci; j++) out[j] = f + j; return; }
  if (t == 1) { for (u32 w = 0; j < nci; w++) { u32 x = p[w]; while (x) { out[j++] = f + w * 32 + ctzw(x); x &= x - 1; } } return; }
  const u32 *H = p + (((nci * l + 31) >> 5) + 1);
  for (u32 w = 0; j < nci; w++) { u32 x = H[w]; while (x && j < nci) { u32 pos = w * 32 + ctzw(x); out[j] = f + (u32)((((u64)(pos - j)) << l) | lowW(p, l, j)); j++; x &= x - 1; } }
}
u32 pef_get(const u8 *b, u32 i) {
  POPEN(b); u32 c = i >> logC, j = i & ((1u << logC) - 1);
  return pChunkGet(pay + (off[c] >> 2), meta[c], chunkN(n, logC, nc, c), j, first[c], last[c]);
}
u32 pef_next(const u8 *b, u32 x) {
  POPEN(b);
  if (n == 0 || x <= first[0]) return 0;
  if (x > last[nc - 1]) return n;
  u32 lo = 0, hi = nc - 1;   // first chunk whose last value is >= x
  while (lo < hi) { u32 m = (lo + hi) >> 1; if (last[m] >= x) hi = m; else lo = m + 1; }
  u32 c = lo;
  if (x <= first[c]) return c << logC;
  return (c << logC) + pChunkNext(pay + (off[c] >> 2), meta[c], chunkN(n, logC, nc, c), x - first[c], last[c] - first[c]);
}
// pef_next, and the value found too (valid when the answer is < n)
static u32 pefNextV(const u8 *b, u32 x, u32 *val, u32 *hint) {   // *hint: the chunk found last time (candidates only go up, so search on from there)
  POPEN(b);
  if (n == 0) return 0;
  if (x <= first[0]) { *val = first[0]; return 0; }
  if (x > last[nc - 1]) return n;
  u32 lo = *hint < nc ? *hint : 0, hi, step = 1;
  if (last[lo] < x) { lo++; while (lo + step < nc && last[lo + step] < x) { lo += step; step <<= 1; } hi = lo + step < nc - 1 ? lo + step : nc - 1; }
  else hi = lo;
  while (lo < hi) { u32 m = (lo + hi) >> 1; if (last[m] >= x) hi = m; else lo = m + 1; }
  u32 c = lo; *hint = c;
  if (x <= first[c]) { *val = first[c]; return c << logC; }
  u32 nci = chunkN(n, logC, nc, c);
  const u32 *p = pay + (off[c] >> 2); u32 j = pChunkNext(p, meta[c], nci, x - first[c], last[c] - first[c]);
  *val = pChunkGet(p, meta[c], nci, j, first[c], last[c]);
  return (c << logC) + j;
}
void pef_get_many(const u8 *b, const u32 *idx, u32 *out, u32 k) { for (u32 j = 0; j < k; j++) out[j] = pef_get(b, idx[j]); }
void pef_next_many(const u8 *b, const u32 *xs, u32 *out, u32 k) { for (u32 j = 0; j < k; j++) out[j] = pef_next(b, xs[j]); }
// values a up to (not including) e into out[e - a]
void pef_decode_range(const u8 *b, u32 a, u32 e, u32 *out) {
  POPEN(b); u32 tmp[1024];
  if (e <= a) return;
  for (u32 c = a >> logC; c <= (e - 1) >> logC; c++) {
    u32 nci = chunkN(n, logC, nc, c), base = c << logC, from = a > base ? a - base : 0, to = e - base < nci ? e - base : nci;
    pChunkDecode(pay + (off[c] >> 2), meta[c], nci, first[c], tmp);
    for (u32 j = from; j < to; j++) out[base + j - a] = tmp[j];
  }
}

// ---- intersection of sorted lists (since 1.3.0): leapfrog over nextGEQ, no list is decoded ----
// h: k pairs {pointer to the blob, kind} (kind 0 flat Elias-Fano, 1 partitioned), the shortest list first. Writes each common value once into out (room for the shortest list's length) and returns how many.
static inline u32 lenOf(const u8 *b) { return rd32(b, 4); }
static u32 leapfrog(const u32 *h, u32 k, u32 *out) {
  u32 o = 0, i, hint[64];
  if (k > 64) return 0;
  for (i = 0; i < 64; i++) hint[i] = 0;
  const u8 *b0 = (const u8 *)h[0];
  if (k == 0 || lenOf(b0) == 0) return 0;
  for (i = 1; i < k; i++) if (lenOf((const u8 *)h[2 * i]) == 0) return 0;
  u32 cand = h[1] == 0 ? getOne(b0, 0) : pef_get(b0, 0);
  for (;;) {
    u32 agree = 1;
    for (i = 0; i < k; i++) {
      const u8 *b = (const u8 *)h[2 * i]; u32 kind = h[2 * i + 1], len = lenOf(b);
      u32 v, j;
      if (kind == 0) j = nextOneV(b, cand, &v); else j = pefNextV(b, cand, &v, &hint[i]);
      if (j >= len) return o;
      if (v != cand) { cand = v; agree = 0; }
    }
    if (agree) { out[o++] = cand; if (cand == 0xffffffffu) return o; cand++; }
  }
}

// ---- two lists of similar size: decode a block of the shorter one, find the matching stretch of the longer one with two nextGEQ, decode that and merge the two small buffers ----
#define BLK 256
#define BBLK 512
// values a .. a+cnt-1 of a flat list into out
static void efRange(const u8 *b, u32 a, u32 cnt, u32 *out) {
  OPEN(b)
  if (cnt == 0) return;
  u32 pos = select1(H, s1, s, a), w = pos >> 6, i = a, e = a + cnt;
  u64 x = H[w] & (~0ULL << (pos & 63));
  while (i < e) {
    while (!x) x = H[++w];
    u32 bit = CTZ(x), hh = (w * 64 + bit) - i;
    out[i - a] = (u32)(((u64)hh << l) | lowAt(low, l, i)); i++; x &= x - 1;
  }
}
static void rangeOf(const u8 *b, u32 kind, u32 a, u32 cnt, u32 *out) { if (kind == 0) efRange(b, a, cnt, out); else pef_decode_range(b, a, a + cnt, out); }
static u32 nextOf(const u8 *b, u32 kind, u32 x) { return kind == 0 ? nextOne(b, x) : pef_next(b, x); }
// two lists, a the shorter; writes the distinct common values to out, returns how many
static u32 mergePair(const u8 *a, u32 ka, const u8 *b, u32 kb, u32 *out) {
  u32 na = lenOf(a), nb = lenOf(b), o = 0, ia = 0, jb = 0, bufA[BLK], bufB[BBLK];
  int have = 0; u32 lastOut = 0;
  while (ia < na && jb < nb) {
    u32 ca = na - ia < BLK ? na - ia : BLK;
    rangeOf(a, ka, ia, ca, bufA);
    u32 lo = bufA[0], hi = bufA[ca - 1];
    u32 from = nextOf(b, kb, lo); if (from < jb) from = jb;
    u32 to = hi == 0xffffffffu ? nb : nextOf(b, kb, hi + 1);
    while (from < to) {
      u32 cb = to - from < BBLK ? to - from : BBLK;
      rangeOf(b, kb, from, cb, bufB);
      u32 i = 0, j = 0;
      while (i < ca && j < cb) {
        u32 x = bufA[i], y = bufB[j];
        if (x < y) i++; else if (y < x) j++;
        else { if (!have || x != lastOut) { out[o++] = x; lastOut = x; have = 1; } i++; j++; }
      }
      from += cb;
    }
    if (to > jb) jb = to;
    ia += ca;
  }
  return o;
}
u32 ef_intersect(const u32 *h, u32 k, u32 *out) {
  if (k < 2) return leapfrog(h, k, out);
  const u8 *a = (const u8 *)h[0], *b = (const u8 *)h[2];
  u32 na = lenOf(a), nb = lenOf(b);
  if (na == 0 || nb == 0) return 0;
  if ((u64)nb < 32ULL * na) {
    u32 m = mergePair(a, h[1], b, h[3], out);
    for (u32 i = 2; i < k && m; i++) {   // the few that are left: keep those the other lists have too
      const u8 *c = (const u8 *)h[2 * i]; u32 kc = h[2 * i + 1], lenc = lenOf(c), keep = 0, hint = 0, v;
      for (u32 t = 0; t < m; t++) {
        u32 j = kc == 0 ? nextOneV(c, out[t], &v) : pefNextV(c, out[t], &v, &hint);
        if (j >= lenc) break;
        if (v == out[t]) out[keep++] = v;
      }
      m = keep;
    }
    return m;
  }
  return leapfrog(h, k, out);
}
