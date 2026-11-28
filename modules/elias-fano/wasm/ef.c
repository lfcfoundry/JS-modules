// Copyright (c) 2026 LFC Foundry. MIT License.
// Elias-Fano coded sorted integer lists: build, access by position, "first value at or above x", batches of both, and decode of the whole list.
// Same format and same answers as the plain JavaScript in the module; wasm/build.sh makes ef.wasm (plain) and ef-simd.wasm (this file with -msimd128).
// Format (all little endian; offsets are from the start of the blob; every section starts on an 8 byte boundary):
//   0 magic 45 46 01 00 | 4 n | 8 maxv | 12 l (low bits per value) | 16 s (one sample per 2^s) | 20 nbits (n + (maxv >> l) + 1) | 24 lowOff | 28 highOff | 32 s1Off | 36 s0Off | 40 total length
//   44 bias (2.5.0: 0 to 2 more low bits than the smallest layout) | 48 dense (2.5.0: 1 = plain bitmap) | 52 base (dense: the first value) | 56-63 zero
//   low: n values of l bits, packed from bit 0 (plus 8 spare bytes) | high: nbits bits, bit (v >> l) + i is set for value i | s1: bit position of every 2^s-th one (u32) | s0: bit position of every 2^(s - bias)-th zero (u32)
//   run lists (dense = 2, strictly increasing with long runs of consecutive values): nbits = R runs; lowOff (64): a classic list of the R run starts; highOff: a classic list of
//   how many values come before each run (0 first); s1Off = s0Off = total = the end. Value i is start[k] + i - before[k] for the last run k with before[k] <= i
//   dense lists (strictly increasing, l = 0, nbits = maxv - base + 1): high bit v - base is set for each value | s1 as above | s0: how many values lie below bit k * 512, for every k
#ifdef __wasm_simd128__
#include <wasm_simd128.h>
#endif
typedef unsigned char u8; typedef unsigned short u16; typedef unsigned int u32; typedef unsigned long long u64;
#define POP(x) __builtin_popcountll(x)
#define CTZ(x) __builtin_ctzll(x)
#define HDR 64
#define DENSE_T 9   // dense lists: one rank sample per 2^9 bits

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
  const u8 *low = b + rd32(b, 24); const u64 *H = (const u64 *)(b + rd32(b, 28)); const u32 *s1 = (const u32 *)(b + rd32(b, 32)), *s0 = (const u32 *)(b + rd32(b, 36)); (void)nbits; (void)maxv; (void)s0; (void)s1; (void)H; (void)low; (void)n; (void)l; (void)s; \
  u32 dense = rd32(b, 48), base = rd32(b, 52), s0s = dense ? DENSE_T : s - rd32(b, 44), dm = dense ? 0u : ~0u; (void)dense; (void)base; (void)s0s; (void)dm;

static u32 runsGet(const u8 *b, u32 i); static u32 runsNextV(const u8 *b, u32 x, u32 *val); static void runsRange(const u8 *b, u32 a, u32 cnt, u32 *out); static void efRange(const u8 *b, u32 a, u32 cnt, u32 *out);
static inline u32 getOne(const u8 *b, u32 i) {
  OPEN(b)
  if (dense == 2) return runsGet(b, i);
  u32 h = select1(H, s1, s, i) - (i & dm);
  return base + (u32)(((u64)h << l) | lowAt(low, l, i));
}
// Long runs of equal values (since 2.1.3): a bucket can hold a long run of ones, so the zero search and the scan inside the bucket could walk it bit by bit. Both now stop after a few
// steps and find the place by galloping over values (getOne), which costs a few dozen reads however long the run is. Ordinary lists never reach the limits, so they take the same steps as before.
#define SEL_WORDS 4
#define SCAN_STEPS 8
__attribute__((noinline)) static u32 gallop(const u8 *b, u32 lo, u32 n, u32 x) {   // the first position t >= lo whose value is >= x (values never go down), or n
  u32 hi = lo, step = 1;
  while (hi < n && getOne(b, hi) < x) { lo = hi + 1; hi = lo + step; step <<= 1; }
  if (hi > n) hi = n;
  while (lo < hi) { u32 mid = lo + ((hi - lo) >> 1); if (getOne(b, mid) < x) lo = mid + 1; else hi = mid; }
  return lo;
}
// where the values of bucket h start: *i = how many values lie in lower buckets, *sp = their bit position; the zero search gives up after SEL_WORDS words (a long run of ones)
static void bucketStart(const u8 *b, u32 h, u32 *iout, u32 *spout) {
  OPEN(b)
  if (h == 0) { *iout = 0; *spout = 0; return; }
  u32 j = h - 1, k = j >> s0s, pos = s0[k], rem = j - (k << s0s), w = pos >> 6, c, steps = 0;
  u64 cur = ~H[w] & (~0ULL << (pos & 63));
  while (rem >= (c = POP(cur))) { rem -= c; cur = ~H[++w]; if (++steps > SEL_WORDS) { u32 i = gallop(b, pos - (k << s0s), n, (u32)((u64)h << l)); *iout = i; *spout = i + h; return; } }
  u32 pz = w * 64 + sel64(cur, rem); *iout = pz - j; *spout = pz + 1;
}
// dense lists: the index of the first value >= x is how many values lie below it, read from the rank sample and the words after it
static inline u32 denseNext(const u8 *b, u32 x) {
  OPEN(b)
  if (x <= base) return 0;
  u32 p = x - base; if (p >= nbits) return n;
  u32 k = p >> s0s, c = s0[k], w = (k << s0s) >> 6, pw = p >> 6;
  for (; w < pw; w++) c += (u32)POP(H[w]);
  return c + (u32)POP(H[pw] & ((1ULL << (p & 63)) - 1));
}
static inline u32 denseNextV(const u8 *b, u32 x, u32 *val) {
  OPEN(b)
  u32 i = denseNext(b, x); if (i >= n) return n;
  u32 p = x <= base ? 0 : x - base, w = p >> 6; u64 cur = H[w] & (~0ULL << (p & 63));
  while (!cur) cur = H[++w];
  *val = base + w * 64 + CTZ(cur); return i;
}
// index of the first value >= x, or n when there is none
static inline u32 nextOne(const u8 *b, u32 x) {
  OPEN(b)
  if (dense == 2) { u32 v; return runsNextV(b, x, &v); }
  if (dense) return denseNext(b, x);
  if (n == 0 || x > maxv) return n;
  u32 h = (u32)((u64)x >> l), i, sp, steps = 0;
  u64 xl = (u64)x & mask(l);
  bucketStart(b, h, &i, &sp);
  while (i < n) {
    if (!((H[sp >> 6] >> (sp & 63)) & 1)) return i;   // the bucket of h ended: this value is bigger than x
    if (lowAt(low, l, i) >= xl) return i;
    if (++steps >= SCAN_STEPS) return gallop(b, i + 1, n, x);
    i++; sp++;
  }
  return n;
}
// like nextOne, and also gives the value found (valid when the answer is < n)
static inline u32 nextOneV(const u8 *b, u32 x, u32 *val) {
  OPEN(b)
  if (dense == 2) return runsNextV(b, x, val);
  if (dense) return denseNextV(b, x, val);
  if (n == 0 || x > maxv) return n;
  u32 h = (u32)((u64)x >> l), i, sp, steps = 0;
  u64 xl = (u64)x & mask(l);
  bucketStart(b, h, &i, &sp);
  while (i < n) {
    if (!((H[sp >> 6] >> (sp & 63)) & 1)) { *val = getOne(b, i); return i; }   // the bucket of h ended: this value is bigger than x
    u64 lo = lowAt(low, l, i);
    if (lo >= xl) { *val = (u32)(((u64)(sp - i) << l) | lo); return i; }
    if (++steps >= SCAN_STEPS) { i = gallop(b, i + 1, n, x); if (i < n) *val = getOne(b, i); return i; }
    i++; sp++;
  }
  return n;
}
u32 ef_get(const u8 *b, u32 i) { return getOne(b, i); }
u32 ef_next(const u8 *b, u32 x) { return nextOne(b, x); }
void ef_get_many(const u8 *b, const u32 *idx, u32 *out, u32 k) {
  // B at a time, each step done for all B before the next, so the memory reads overlap instead of waiting in turn
  OPEN(b)
  u32 j = 0, I[8], P[8]; u64 C[8], LO[8];
  if (dense == 2) { for (; j < k; j++) out[j] = runsGet(b, idx[j]); return; }
  for (; j + 8 <= k; j += 8) {
    for (u32 q = 0; q < 8; q++) I[q] = idx[j + q];
    for (u32 q = 0; q < 8; q++) P[q] = s1[I[q] >> s];
    for (u32 q = 0; q < 8; q++) { C[q] = H[P[q] >> 6]; LO[q] = lowAt(low, l, I[q]); }
    for (u32 q = 0; q < 8; q++) { u32 i = I[q], p = P[q], rem = i - ((i >> s) << s), w = p >> 6, c; u64 cur = C[q] & (~0ULL << (p & 63));
      while (rem >= (c = POP(cur))) { rem -= c; cur = H[++w]; } out[j + q] = base + (u32)(((u64)(w * 64 + sel64(cur, rem) - (i & dm)) << l) | LO[q]); }
  }
  for (; j < k; j++) out[j] = getOne(b, idx[j]);
}
void ef_next_many(const u8 *b, const u32 *xs, u32 *out, u32 k) {
  // 8 at a time like ef_get_many: the sample reads and the first word reads of all 8 overlap
  OPEN(b)
  u32 j = 0, X[8], P[8], I[8], S[8]; u64 C[8], XL[8], F[8];
  if (dense == 2) { for (; j < k; j++) { u32 v; out[j] = runsNextV(b, xs[j], &v); } return; }
  if (dense) { for (; j < k; j++) out[j] = denseNext(b, xs[j]); return; }
  if (n > 0 && !rd32(b, 44)) for (; j + 8 <= k; j += 8) {
    for (u32 q = 0; q < 8; q++) X[q] = xs[j + q];
    for (u32 q = 0; q < 8; q++) { u32 h = (u32)((u64)X[q] >> l); P[q] = (h == 0 || X[q] > maxv) ? 0 : s0[(h - 1) >> s0s]; }
    for (u32 q = 0; q < 8; q++) C[q] = ~H[P[q] >> 6];
    for (u32 q = 0; q < 8; q++) {
      u32 x = X[q], h = (u32)((u64)x >> l), i, sp;
      if (x > maxv) { out[j + q] = n; continue; }
      u64 xl = (u64)x & mask(l);
      u32 steps = 0, far = 0;
      if (h == 0) { i = 0; sp = 0; }
      else { u32 jj = h - 1, p = P[q], rem = jj - ((jj >> s0s) << s0s), w = p >> 6, c; u64 cur = C[q] & (~0ULL << (p & 63));
        while (rem >= (c = POP(cur))) { rem -= c; cur = ~H[++w]; if (++steps > SEL_WORDS) { far = 1; break; } }
        if (far) { i = gallop(b, p - ((jj >> s0s) << s0s), n, (u32)((u64)h << l)); sp = i + h; }
        else { u32 pz = w * 64 + sel64(cur, rem); i = pz - (h - 1); sp = pz + 1; } }
      steps = 0;
      while (i < n) { if (!((H[sp >> 6] >> (sp & 63)) & 1)) break; if (lowAt(low, l, i) >= xl) break; if (++steps >= SCAN_STEPS) { i = gallop(b, i + 1, n, x); break; } i++; sp++; }
      out[j + q] = i;
    }
  }
  if (n > 0 && rd32(b, 44)) for (; j + 8 <= k; j += 8) {
    for (u32 q = 0; q < 8; q++) X[q] = xs[j + q];
    for (u32 q = 0; q < 8; q++) { u32 h = (u32)((u64)X[q] >> l); P[q] = (h == 0 || X[q] > maxv) ? 0 : s0[(h - 1) >> s0s]; }
    for (u32 q = 0; q < 8; q++) C[q] = ~H[P[q] >> 6];
    for (u32 q = 0; q < 8; q++) {
      u32 x = X[q], h = (u32)((u64)x >> l), i, sp;
      if (x > maxv) { out[j + q] = n; continue; }
      u64 xl = (u64)x & mask(l);
      u32 steps = 0, far = 0;
      if (h == 0) { i = 0; sp = 0; }
      else { u32 jj = h - 1, p = P[q], rem = jj - ((jj >> s0s) << s0s), w = p >> 6, c; u64 cur = C[q] & (~0ULL << (p & 63));
        while (rem >= (c = POP(cur))) { rem -= c; cur = ~H[++w]; if (++steps > SEL_WORDS) { far = 1; break; } }
        if (far) { i = gallop(b, p - ((jj >> s0s) << s0s), n, (u32)((u64)h << l)); sp = i + h; }
        else { u32 pz = w * 64 + sel64(cur, rem); i = pz - (h - 1); sp = pz + 1; } }
      I[q] = i; S[q] = sp; XL[q] = xl;   // biased layouts (about 1 value per bucket): the bucket scans run below, after all 8 first low reads are issued
    }
    for (u32 q = 0; q < 8; q++) if (X[q] <= maxv && I[q] < n) F[q] = lowAt(low, l, I[q]);
    for (u32 q = 0; q < 8; q++) {
      if (X[q] > maxv) continue;
      u32 i = I[q], sp = S[q], steps = 0; u64 xl = XL[q];
      if (i < n && ((H[sp >> 6] >> (sp & 63)) & 1) && F[q] < xl) {
        i++; sp++;
        while (i < n) { if (!((H[sp >> 6] >> (sp & 63)) & 1)) break; if (lowAt(low, l, i) >= xl) break; if (++steps >= SCAN_STEPS - 1) { i = gallop(b, i + 1, n, X[q]); break; } i++; sp++; }
      }
      out[j + q] = i;
    }
  }
  for (; j < k; j++) out[j] = nextOne(b, xs[j]);
}

// every value, in order, into out[n]
void ef_decode(const u8 *b, u32 *out) {
  OPEN(b)
  if (dense == 2) { runsRange(b, 0, n, out); return; }
  u32 i = 0, nw = (nbits + 63) >> 6;
  if (dense) for (u32 w = 0; w < nw && i < n; w++) { u64 x = H[w]; while (x && i < n) { out[i] = w * 64 + CTZ(x) + base; i++; x &= x - 1; } }
  else for (u32 w = 0; w < nw && i < n; w++) { u64 x = H[w]; while (x && i < n) { out[i] = (w * 64 + CTZ(x)) - i; i++; x &= x - 1; } }   // the 2.4.1 loop, kept apart so classic lists pay nothing for bitmaps
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

#ifdef __wasm_simd128__
static u8 QT[256][8], QP[256][8], Q8[256]; static u32 qtOk; static u8 SW8[17][16], SW16[17][32]; static u16 MU8[17][8]; static u32 MU16[17][8];   // for each byte value: where its set bits are, each minus its rank, and how many there are
static void qtInit(void) { for (u32 x = 0; x < 256; x++) { u32 n = 0; for (u32 b = 0; b < 8; b++) if (x >> b & 1) { QT[x][n] = (u8)(b - n); QP[x][n] = (u8)b; n++; } Q8[x] = (u8)n; }
  for (u32 l = 1; l <= 16; l++) {
    for (u32 t = 0; t < 8; t++) {
      u32 bo = t * l;
      if (l <= 8) { SW8[l][2 * t] = (u8)(bo >> 3); SW8[l][2 * t + 1] = (u8)((bo >> 3) + 1); MU8[l][t] = (u16)(1u << (8 - (bo & 7))); }
      else { u32 h2 = (4 * l) >> 3, base = t < 4 ? 0 : h2, by = (bo >> 3) - base + (t < 4 ? 0 : 8); for (u32 z = 0; z < 4; z++) SW16[l][4 * t + z] = (u8)(by + z); MU16[l][t] = 1u << (16 - (bo & 7)); }
    }
  }
  qtOk = 1; }
#endif
// like ef_decode but 8 values at a time with a byte table for the high parts and swizzle+multiply for the low parts (l up to 16); out needs 32 spare bytes after the n values
#ifdef __wasm_simd128__
// writes up to 7 values past out[n]; n >= 16, l <= 16; low: n*l packed bits, Hb: high bits as bytes
static void efFastCore(const u8 *low, const u8 *Hb, u32 n, u32 l, u32 *out, u32 dense, u32 base) {
  if (!qtOk) qtInit();
  u32 i = 0;
  if (dense) {   // a plain bitmap: each set bit is a value, no low bits
    for (u32 k = 0; i < n; k++) {
      u32 x = Hb[k]; v128_t q = wasm_u16x8_load8x8(QP[x]); v128_t bv = wasm_i32x4_splat((int)(base + k * 8));
      wasm_v128_store(out + i, wasm_i32x4_add(wasm_u32x4_extend_low_u16x8(q), bv)); wasm_v128_store(out + i + 4, wasm_i32x4_add(wasm_u32x4_extend_high_u16x8(q), bv)); i += Q8[x];
    }
    return;
  }
  for (u32 k = 0; i < n; k++) {
    u32 x = Hb[k]; v128_t q = wasm_u16x8_load8x8(QT[x]); v128_t base = wasm_i32x4_splat((int)(k * 8 - i));
    wasm_v128_store(out + i, wasm_i32x4_add(wasm_u32x4_extend_low_u16x8(q), base)); wasm_v128_store(out + i + 4, wasm_i32x4_add(wasm_u32x4_extend_high_u16x8(q), base)); i += Q8[x];
  }
  if (l == 0) return;
  if (l > 16) {   // 17 or more low bits (sparse lists): one unaligned 8-byte read per value
    u32 g = 0;
    for (; g + 4 <= n; g += 4) {
      u32 l0 = (u32)lowAt(low, l, g), l1 = (u32)lowAt(low, l, g + 1), l2 = (u32)lowAt(low, l, g + 2), l3 = (u32)lowAt(low, l, g + 3);
      v128_t lo = wasm_u32x4_make(l0, l1, l2, l3);
      wasm_v128_store(out + g, wasm_v128_or(wasm_i32x4_shl(wasm_v128_load(out + g), l), lo));
    }
    for (; g < n; g++) out[g] = (u32)(((u64)out[g] << l) | lowAt(low, l, g));
    return;
  }
  if (l <= 8) {
    v128_t SW = wasm_v128_load(SW8[l]), MU = wasm_v128_load(MU8[l]), MK = wasm_i16x8_splat((short)mask(l));
    for (u32 g = 0; g < n; g += 8) {
      v128_t f = wasm_i8x16_swizzle(wasm_v128_load64_zero((const u8 *)low + (g >> 3) * l), SW);
      f = wasm_v128_and(wasm_u16x8_shr(wasm_i16x8_mul(f, MU), 8), MK);
      wasm_v128_store(out + g, wasm_v128_or(wasm_i32x4_shl(wasm_v128_load(out + g), l), wasm_u32x4_extend_low_u16x8(f)));
      wasm_v128_store(out + g + 4, wasm_v128_or(wasm_i32x4_shl(wasm_v128_load(out + g + 4), l), wasm_u32x4_extend_high_u16x8(f)));
    }
    return;
  }
  u32 h2 = (4 * l) >> 3;
  v128_t S0 = wasm_v128_load(SW16[l]), S1 = wasm_v128_load(SW16[l] + 16), M0 = wasm_v128_load(MU16[l]), M1 = wasm_v128_load(MU16[l] + 4), MK = wasm_i32x4_splat((int)mask(l));
  for (u32 g = 0; g < n; g += 8) {
    const u8 *p = (const u8 *)low + (g >> 3) * l; v128_t v = wasm_v128_load64_lane(p + h2, wasm_v128_load64_zero(p), 1);
    v128_t f0 = wasm_v128_and(wasm_u32x4_shr(wasm_i32x4_mul(wasm_i8x16_swizzle(v, S0), M0), 16), MK);
    v128_t f1 = wasm_v128_and(wasm_u32x4_shr(wasm_i32x4_mul(wasm_i8x16_swizzle(v, S1), M1), 16), MK);
    wasm_v128_store(out + g, wasm_v128_or(wasm_i32x4_shl(wasm_v128_load(out + g), l), f0));
    wasm_v128_store(out + g + 4, wasm_v128_or(wasm_i32x4_shl(wasm_v128_load(out + g + 4), l), f1));
  }

}
#endif
static void runsDecodeFast(const u8 *b, u32 *out);
void ef_decode_fast(const u8 *b, u32 *out) {
#ifdef __wasm_simd128__
  OPEN(b)
  if (dense == 2) { runsDecodeFast(b, out); return; }
  if (n < 16 || l > 31) { ef_decode(b, out); return; }
  efFastCore(low, (const u8 *)H, n, l, out, dense, base);
  return;
#else
  ef_decode(b, out);
#endif
}

// build the blob at out (already zero filled, length from the layout the caller worked out) from values[n], sorted, n >= 1
void ef_build(const u32 *v, u32 n, u32 l, u32 s, u32 lowOff, u32 highOff, u32 s1Off, u32 s0Off, u32 total, u8 *out, u32 bias, u32 dense) {
  u32 maxv = v[n - 1], base = dense ? v[0] : 0, nbits = dense ? maxv - base + 1 : n + (maxv >> l) + 1;
  *(u32 *)(out + 44) = bias; *(u32 *)(out + 48) = dense; *(u32 *)(out + 52) = base;
  *(u32 *)(out + 0) = 0x00014645u; *(u32 *)(out + 4) = n; *(u32 *)(out + 8) = maxv; *(u32 *)(out + 12) = l; *(u32 *)(out + 16) = s; *(u32 *)(out + 20) = nbits;
  *(u32 *)(out + 24) = lowOff; *(u32 *)(out + 28) = highOff; *(u32 *)(out + 32) = s1Off; *(u32 *)(out + 36) = s0Off; *(u32 *)(out + 40) = total;
  u8 *low = out + lowOff; u64 *H = (u64 *)(out + highOff); u32 *a1 = (u32 *)(out + s1Off), *a0 = (u32 *)(out + s0Off);
  if (dense) {   // strictly increasing: bit v - base per value; s1 every 2^s-th one, s0 the count below every 2^DENSE_T-th bit
    for (u32 i = 0; i < n; i++) { u32 p = v[i] - base; H[p >> 6] |= 1ULL << (p & 63); }
    for (u32 k = 0, i = 0; i < n; k++, i += 1u << s) a1[k] = v[i] - base;
    for (u32 k = 0, c = 0; ((u64)k << DENSE_T) < nbits; k++) { u32 p = k << DENSE_T; while (c < n && v[c] - base < p) c++; a0[k] = c; }
    return;
  }
  u64 m = mask(l);
  for (u32 i = 0; i < n; i++) {
    u32 x = v[i];
    if (l) { u64 p = (u64)i * l; u32 w = (u32)(p >> 5), sh = (u32)(p & 31); u64 val = ((u64)x & m) << sh; *(u32 *)(low + w * 4) |= (u32)val; *(u32 *)(low + w * 4 + 4) |= (u32)(val >> 32); }
    u32 pos = (x >> l) + i; H[pos >> 6] |= 1ULL << (pos & 63);
  }
  // samples: bit position of every 2^s-th one (value i sits at (v[i] >> l) + i) and of every 2^s-th zero (zero j sits at j + the number of values whose high part is <= j)
  u32 step = 1u << s, step0 = 1u << (s - bias), zeros = (maxv >> l) + 1, c = 0;
  for (u32 k = 0, i = 0; i < n; k++, i += step) a1[k] = (v[i] >> l) + i;
  for (u32 k = 0, j = 0; j < zeros; k++, j += step0) { while (c < n && (v[c] >> l) <= j) c++; a0[k] = j + c; }
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
#ifdef __wasm_simd128__
    if (from == 0 && to == nci && nci >= 16) {   // whole chunk: decode straight into out (writes up to 7 values past it, the next chunk or the 32 spare bytes take them)
      u32 *o = out + (base - a), f = first[c], mt = meta[c], t = mt & 3, l = mt >> 2; const u32 *p = pay + (off[c] >> 2);
      if (t == 0) { v128_t f4 = wasm_i32x4_splat((int)f), st = wasm_i32x4_make(0, 1, 2, 3), fo = wasm_i32x4_splat(4); for (u32 j = 0; j < nci; j += 4) { wasm_v128_store(o + j, wasm_i32x4_add(f4, st)); st = wasm_i32x4_add(st, fo); } continue; }
      if (t == 1) {   // bitmap: the set bit positions are what the high-part stage yields (each minus its rank), so add rank and the chunk's first value
        efFastCore((const u8 *)p, (const u8 *)p, nci, 0, o, 0, 0);
        v128_t f4 = wasm_i32x4_splat((int)f), st = wasm_i32x4_make(0, 1, 2, 3), fo = wasm_i32x4_splat(4);
        for (u32 j = 0; j < nci; j += 4) { wasm_v128_store(o + j, wasm_i32x4_add(wasm_i32x4_add(wasm_v128_load(o + j), st), f4)); st = wasm_i32x4_add(st, fo); }
        continue;
      }
      if (t == 2 && l <= 16) {
        efFastCore((const u8 *)p, (const u8 *)(p + (((nci * l + 31) >> 5) + 1)), nci, l, o, 0, 0);
        v128_t f4 = wasm_i32x4_splat((int)f); for (u32 j = 0; j < nci; j += 4) wasm_v128_store(o + j, wasm_i32x4_add(wasm_v128_load(o + j), f4));
        continue;
      }
    }
#endif
    pChunkDecode(pay + (off[c] >> 2), meta[c], nci, first[c], tmp);
    for (u32 j = from; j < to; j++) out[base + j - a] = tmp[j];
  }
}

// ---- run lists (2.5.0): two classic lists, run starts and the count before each run ----
#define RUN_S(b) ((b) + rd32(b, 24))
#define RUN_C(b) ((b) + rd32(b, 28))
// Once a run list is in the module's memory, ef_runs_unpack writes its starts and counts as plain arrays after it (8 bytes a run) and puts their offset in header word 14 of
// that copy only; reads then binary search those small arrays. The saved bytes never carry the word (the module's .js clears it when it copies the bytes back out).
static inline const u32 *runTab(const u8 *b) { u32 o = rd32(b, 56); return o ? (const u32 *)(b + o) : 0; }
static inline u32 firstAbove(const u32 *A, u32 len, u32 x) { const u32 *p = A; while (len > 0) { u32 h = len >> 1; if (p[h] <= x) { p += h + 1; len -= h + 1; } else len = h; } return (u32)(p - A); }
void ef_runs_unpack(u8 *b) {
  u32 R = rd32(b, 20), n = rd32(b, 4), T = (rd32(b, 40) + 15) & ~15u; u32 *St = (u32 *)(b + T), *Ct = St + ((R + 16) & ~3u);
#ifdef __wasm_simd128__
  ef_decode_fast(RUN_S(b), St); ef_decode_fast(RUN_C(b), Ct);
#else
  ef_decode(RUN_S(b), St); ef_decode(RUN_C(b), Ct);
#endif
  Ct[R] = n; *(u32 *)(b + 56) = T;
}
#define RUN_TABS(b, R, St, Ct) const u32 *St = runTab(b), *Ct = St ? St + ((R + 16) & ~3u) : 0;
static u32 runsGet(const u8 *b, u32 i) {
  { u32 R = rd32(b, 20); RUN_TABS(b, R, St, Ct) if (St) { u32 k = firstAbove(Ct, R, i) - 1; return St[k] + (i - Ct[k]); } }
  const u8 *S = RUN_S(b), *C = RUN_C(b); u32 k = nextOne(C, i + 1) - 1;
  return getOne(S, k) + (i - getOne(C, k));
}
static u32 runsNextV(const u8 *b, u32 x, u32 *val) {
  u32 n = rd32(b, 4), maxv = rd32(b, 8), R = rd32(b, 20); const u8 *S = RUN_S(b), *C = RUN_C(b);
  if (n == 0 || x > maxv) return n;
  { RUN_TABS(b, R, St, Ct) if (St) { u32 k = firstAbove(St, R, x); if (k == 0) { *val = St[0]; return 0; } k--;
      if (x - St[k] < Ct[k + 1] - Ct[k]) { *val = x; return Ct[k] + (x - St[k]); } *val = St[k + 1]; return Ct[k + 1]; } }
  u32 sn, k = nextOneV(S, x + 1, &sn);   // the first run that starts above x, and its start
  if (k == 0) { *val = sn; return 0; }
  u32 s = getOne(S, k - 1), cc[2];
  if (k < R) efRange(C, k - 1, 2, cc); else { cc[0] = getOne(C, k - 1); cc[1] = n; }
  if (x - s < cc[1] - cc[0]) { *val = x; return cc[0] + (x - s); }
  *val = sn; return cc[1];   // x > maxv was ruled out, so a next run exists (k < R)
}
static inline void fillRun(u32 *o, u32 s, u32 L) {   // s, s+1, ..., s+L-1 (exactly L values)
  u32 t = 0;
#ifdef __wasm_simd128__
  v128_t v = wasm_i32x4_add(wasm_i32x4_splat((int)s), wasm_i32x4_make(0, 1, 2, 3)), f = wasm_i32x4_splat(4);
  for (; t + 4 <= L; t += 4) { wasm_v128_store(o + t, v); v = wasm_i32x4_add(v, f); }
#endif
  for (; t < L; t++) o[t] = s + t;
}
static void runsRange(const u8 *b, u32 a, u32 cnt, u32 *out) {   // values a .. a+cnt-1, exactly cnt written
  u32 n = rd32(b, 4), R = rd32(b, 20), done = 0, bs[64], bc[65]; const u8 *S = RUN_S(b), *C = RUN_C(b);
  if (cnt == 0) return;
  { RUN_TABS(b, R, St, Ct) if (St) { u32 k = firstAbove(Ct, R, a) - 1, off = a - Ct[k];
      for (; done < cnt && k < R; k++) { u32 L = Ct[k + 1] - Ct[k] - off, take = L < cnt - done ? L : cnt - done; fillRun(out + done, St[k] + off, take); done += take; off = 0; }
      return; } }
  u32 k = nextOne(C, a + 1) - 1, off = a - getOne(C, k);
  while (done < cnt && k < R) {
    u32 ch = R - k < 64 ? R - k : 64, cc = k + ch < R ? ch + 1 : ch;
    efRange(S, k, ch, bs); efRange(C, k, cc, bc); if (cc == ch) bc[ch] = n;
    for (u32 t = 0; t < ch && done < cnt; t++) { u32 L = bc[t + 1] - bc[t] - off, take = L < cnt - done ? L : cnt - done; fillRun(out + done, bs[t] + off, take); done += take; off = 0; }
    k += ch;
  }
}
// whole list: the starts and counts are decoded with the SIMD decoder into the space after out (n + 8 values on: 2R + 48 values, the caller's room), then each run is filled
static void runsDecodeFast(const u8 *b, u32 *out) {
#ifdef __wasm_simd128__
  u32 n = rd32(b, 4), R = rd32(b, 20); const u8 *S = RUN_S(b), *C = RUN_C(b);
  RUN_TABS(b, R, St, Ct)
  const u32 *bs = St, *bc = Ct;
  if (!St) { u32 *ws = out + n + 8, *wc = ws + ((R + 16) & ~3u); ef_decode_fast(S, ws); ef_decode_fast(C, wc); wc[R] = n; bs = ws; bc = wc; }
  v128_t f = wasm_i32x4_splat(4), io = wasm_i32x4_make(0, 1, 2, 3);
  for (u32 k = 0; k < R; k++) {   // 4 at a time; up to 3 values past a run, which the next run (or the spare room after n) takes
    u32 *o = out + bc[k], L = bc[k + 1] - bc[k]; v128_t v = wasm_i32x4_add(wasm_i32x4_splat((int)bs[k]), io);
    for (u32 t = 0; t < L; t += 4) { wasm_v128_store(o + t, v); v = wasm_i32x4_add(v, f); }
  }
#else
  runsRange(b, 0, rd32(b, 4), out);
#endif
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
  if (dense == 2) { runsRange(b, a, cnt, out); return; }
  u32 pos = select1(H, s1, s, a), w = pos >> 6, i = a, e = a + cnt;
  u64 x = H[w] & (~0ULL << (pos & 63));
  while (i < e) {
    while (!x) x = H[++w];
    u32 bit = CTZ(x), hh = (w * 64 + bit) - (i & dm);
    out[i - a] = base + (u32)(((u64)hh << l) | lowAt(low, l, i)); i++; x &= x - 1;
  }
}
// many lists of one list set, for the lists that sit in one chunk: list ids[j] has cnt = offs[j+1] - offs[j] values starting at value aIdx[j] of the chunk (aIdx counts from the
// chunk's first value, cs below is taken off by the caller); they are written to out + offs[j] less the list's base (its place in the chunk times K)
void ef_gather(const u8 *b, u32 chunk, u32 C, u32 K, const u32 *ids, const u32 *aIdx, const u32 *offs, u32 k, u32 *out) {
  for (u32 j = 0; j < k; j++) {
    u32 d = offs[j], c = offs[j + 1] - d, id = ids[j];
    if (!c || id / C != chunk) continue;
    efRange(b, aIdx[j], c, out + d);
    u32 bs = (id - chunk * C) * K;
    for (u32 t = 0; t < c; t++) out[d + t] -= bs;
  }
}
// the values of one list-set chunk, in order, with each list's base taken off in place of the caller's loop: the chunk holds nl lists, offs[0..nl] are their absolute value
// positions (offs[0] is where the chunk starts), K is the list-set step; list j sits at out[offs[j] - offs[0] .. offs[j+1] - offs[0]) and had j * K added when it was built
void ef_lists_decode(const u8 *b, u32 K, const u32 *offs, u32 nl, u32 *out) {
  ef_decode(b, out);
  u32 cs = offs[0];
  for (u32 j = 1; j < nl; j++) {
    u32 bs = j * K, e = offs[j + 1] - cs;
    for (u32 t = offs[j] - cs; t < e; t++) out[t] -= bs;
  }
}
static void rangeOf(const u8 *b, u32 kind, u32 a, u32 cnt, u32 *out) { if (kind == 0) efRange(b, a, cnt, out); else pef_decode_range(b, a, a + cnt, out); }
static u32 nextOf(const u8 *b, u32 kind, u32 x) { return kind == 0 ? nextOne(b, x) : pef_next(b, x); }
// two lists, a the shorter; writes the distinct common values to out, returns how many
static u32 mergePair(const u8 *a, u32 ka, const u8 *b, u32 kb, u32 *out) {
  u32 na = lenOf(a), nb = lenOf(b), o = 0, ia = 0, jb = 0, bufA[BLK + 8], bufB[BBLK + 8];
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
// dense (bitmap) lists, 2.5.0: a bitmap against another bitmap is a word AND; against any other list its values are tested bit by bit, so nothing is merged
static inline u32 isDense(const u8 *b, u32 kind) { return kind == 0 && rd32(b, 48) == 1; }
static inline u64 bitsAt(const u64 *H, u32 p) { u32 w = p >> 6, sh = p & 63; return sh ? (H[w] >> sh) | (H[w + 1] << (64 - sh)) : H[w]; }   // 64 bits from bit p (the high part has a spare word)
static u32 andDense2(const u8 *a, const u8 *b, u32 *out) {
  u32 ba = rd32(a, 52), bb = rd32(b, 52), ma = rd32(a, 8), mb = rd32(b, 8), lo = ba > bb ? ba : bb, hi = ma < mb ? ma : mb, o = 0;
  if (lo > hi) return 0;
  const u64 *A = (const u64 *)(a + rd32(a, 28)), *B = (const u64 *)(b + rd32(b, 28));
  for (u64 v = lo; v <= hi; v += 64) {
    u64 x = bitsAt(A, (u32)(v - ba)) & bitsAt(B, (u32)(v - bb)); u32 left = (u32)(hi - v);
    if (left < 63) x &= (2ULL << left) - 1;
    while (x) { out[o++] = (u32)v + CTZ(x); x &= x - 1; }
  }
  return o;
}
static u32 andDense1(const u8 *d, const u8 *x, u32 kx, u32 *out) {   // d dense; x any flat or partitioned list
  u32 bd = rd32(d, 52), md = rd32(d, 8), nx = lenOf(x), o = 0, i = nextOf(x, kx, bd), buf[BLK + 8];
  const u64 *D = (const u64 *)(d + rd32(d, 28)); int have = 0; u32 last = 0;
  while (i < nx) {
    u32 c = nx - i < BLK ? nx - i : BLK; rangeOf(x, kx, i, c, buf);
    for (u32 t = 0; t < c; t++) {
      u32 v = buf[t]; if (v > md) return o;
      u32 p = v - bd; u32 hit = (u32)(D[p >> 6] >> (p & 63)) & 1;
      if (hit && (!have || v != last)) { out[o++] = v; last = v; have = 1; }
    }
    i += c;
  }
  return o;
}
u32 ef_intersect(const u32 *h, u32 k, u32 *out) {
  if (k < 2) return leapfrog(h, k, out);
  const u8 *a = (const u8 *)h[0], *b = (const u8 *)h[2];
  u32 na = lenOf(a), nb = lenOf(b);
  if (na == 0 || nb == 0) return 0;
  u32 da = isDense(a, h[1]), db = isDense(b, h[3]);
  if ((da || db) && (u64)nb < 32ULL * na) {
    u32 m = da && db ? andDense2(a, b, out) : da ? andDense1(a, b, h[3], out) : andDense1(b, a, h[1], out);
    for (u32 i = 2; i < k && m; i++) {
      const u8 *c = (const u8 *)h[2 * i]; u32 kc = h[2 * i + 1], lenc = lenOf(c), keep = 0, hint = 0, v;
      for (u32 t = 0; t < m; t++) { u32 j = kc == 0 ? nextOneV(c, out[t], &v) : pefNextV(c, out[t], &v, &hint); if (j >= lenc) break; if (v == out[t]) out[keep++] = v; }
      m = keep;
    }
    return m;
  }
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

// 2.5.0: two flat lists of similar size are decoded whole with the SIMD decoder into scr and intersected 4 by 4 (each block of the shorter against each rotation of the
// other's block, then the hits packed with a swizzle); a bitmap list is tested bit by bit instead. scr needs room for both lists plus 64 values; out 4 values more than the
// shortest list. Partitioned lists and very different lengths take ef_intersect.
#ifdef __wasm_simd128__
static u8 PK[16][16]; static u32 pkOk;
static void pkInit(void) { for (u32 m = 0; m < 16; m++) { u32 o = 0; for (u32 t = 0; t < 4; t++) if (m >> t & 1) { for (u32 z = 0; z < 4; z++) PK[m][o * 4 + z] = (u8)(t * 4 + z); o++; } for (; o < 4; o++) for (u32 z = 0; z < 4; z++) PK[m][o * 4 + z] = 0x80; } pkOk = 1; }
// 4 by 4 block compare of A[i..] and B[j..]: writes the matches at out + o, then steps the side with the smaller last value (both when equal).
// em: lanes of this A block already written (the block stays while B steps on), so each value of A is written at most once and a stream never outgrows its share of out
#define AND4(A, B, i, j, o, em) { v128_t va = wasm_v128_load(A + i), vb = wasm_v128_load(B + j); \
    v128_t m = wasm_v128_or(wasm_v128_or(wasm_i32x4_eq(va, vb), wasm_i32x4_eq(va, wasm_i32x4_shuffle(vb, vb, 1, 2, 3, 0))), \
                            wasm_v128_or(wasm_i32x4_eq(va, wasm_i32x4_shuffle(vb, vb, 2, 3, 0, 1)), wasm_i32x4_eq(va, wasm_i32x4_shuffle(vb, vb, 3, 0, 1, 2)))); \
    u32 mk = (u32)wasm_i32x4_bitmask(m) & ~em; wasm_v128_store(out + o, wasm_i8x16_swizzle(va, wasm_v128_load(PK[mk]))); o += (u32)__builtin_popcount(mk); \
    u32 am = A[i + 3], bm = B[j + 3]; em = am <= bm ? 0 : em | mk; i += am <= bm ? 4 : 0; j += bm <= am ? 4 : 0; }
static u32 and1(const u32 *A, u32 i, u32 na, const u32 *B, u32 j, u32 nb, u32 *out, u32 o, u32 em) {
  while (i + 4 <= na && j + 4 <= nb) AND4(A, B, i, j, o, em)
  u32 ib = i;   // lanes of the block at ib in em are written already
  while (i < na && j < nb) { u32 x = A[i], y = B[j]; if (x < y) i++; else if (y < x) j++; else { if (i - ib >= 4 || !((em >> (i - ib)) & 1)) out[o++] = x; i++; j++; } }
  return o;
}
// the same block compare without the marks (WebKitGTK ran mid lists 1.16-1.33x slower with them); a value of A can then come out more than once only when
// B repeats values, so the caller checks the count against na and redoes the merge with marks if it ever passes it
#define AND4P(A, B, i, j, o) { v128_t va = wasm_v128_load(A + i), vb = wasm_v128_load(B + j); \
    v128_t m = wasm_v128_or(wasm_v128_or(wasm_i32x4_eq(va, vb), wasm_i32x4_eq(va, wasm_i32x4_shuffle(vb, vb, 1, 2, 3, 0))), \
                            wasm_v128_or(wasm_i32x4_eq(va, wasm_i32x4_shuffle(vb, vb, 2, 3, 0, 1)), wasm_i32x4_eq(va, wasm_i32x4_shuffle(vb, vb, 3, 0, 1, 2)))); \
    u32 mk = (u32)wasm_i32x4_bitmask(m); wasm_v128_store(out + o, wasm_i8x16_swizzle(va, wasm_v128_load(PK[mk]))); o += (u32)__builtin_popcount(mk); \
    u32 am = A[i + 3], bm = B[j + 3]; i += am <= bm ? 4 : 0; j += bm <= am ? 4 : 0; }
static u32 and1p(const u32 *A, u32 na, const u32 *B, u32 nb, u32 *out) {   // ~0u when the count passed na
  u32 i = 0, j = 0, o = 0;
  while (i + 4 <= na && j + 4 <= nb) { AND4P(A, B, i, j, o) if (o > na) return ~0u; }
  while (i < na && j < nb) { u32 x = A[i], y = B[j]; if (x < y) i++; else if (y < x) j++; else { out[o++] = x; i++; j++; } }
  return o > na ? ~0u : o;
}
static u32 lowerB(const u32 *B, u32 nb, u32 x) { u32 lo = 0, hi = nb; while (lo < hi) { u32 m = (lo + hi) >> 1; if (B[m] < x) lo = m + 1; else hi = m; } return lo; }
static u32 simdAnd(const u32 *A, u32 na, const u32 *B, u32 nb, u32 *out) {
  if (!pkOk) pkInit();
  u32 o;
  if (na >= 1024 && nb >= 1024) {   // long lists only: WebKitGTK ran mid lists 1.15-1.31x slower with it
    // two merges at once, split at the middle value of A: independent chains of loads and compares, so each waits less on the other
    u32 h = na >> 1, jb = lowerB(B, nb, A[h]);
    u32 i1 = 0, j1 = 0, o1 = 0, i2 = h, j2 = jb, o2 = h + 4, e1 = 0, e2 = 0;   // stream 2 writes from out + h + 4: stream 1 finds at most h values and a block store writes up to 3 past its count
    while (i1 + 4 <= h && j1 + 4 <= jb && i2 + 4 <= na && j2 + 4 <= nb) { AND4(A, B, i1, j1, o1, e1) AND4(A, B, i2, j2, o2, e2) }
    o1 = and1(A, i1, h, B, j1, jb, out, o1, e1); o2 = and1(A, i2, na, B, j2, nb, out, o2, e2);
    for (u32 t = h + 4; t < o2; t++) out[o1++] = out[t];
    o = o1;
  } else { o = and1p(A, na, B, nb, out); if (o == ~0u) o = and1(A, 0, na, B, 0, nb, out, 0, 0); }
  u32 w = 0; for (u32 t = 0; t < o; t++) if (w == 0 || out[t] != out[w - 1]) out[w++] = out[t];   // each common value once
  return w;
}
static u32 andBits(const u32 *A, u32 na, const u8 *d, u32 *out) {   // values of A (sorted) that the bitmap list d holds, each once
  u32 bd = rd32(d, 52), md = rd32(d, 8), o = 0, t = 0; const u64 *D = (const u64 *)(d + rd32(d, 28));
  while (t < na && A[t] < bd) t++;
  for (; t < na; t++) { u32 v = A[t]; if (v > md) break; u32 p = v - bd; out[o] = v; o += (u32)(D[p >> 6] >> (p & 63)) & (o == 0 || out[o - 1] != v); }
  return o;
}
#endif
#ifndef SKEW
#define SKEW 16
#endif
// values of A (sorted, na) that the much longer flat list b (classic or fast layout) holds, each once: one forward walk over b's high bits, bucket by bucket,
// with a jump through the zero samples when the next bucket is far; nothing of b is decoded
typedef struct { u32 p, z, t, e, o, s; } Walk;   // s: where this walker's output starts
// one value of A for walker w: move to its bucket in b's high bits, then over the bucket's ones until the low part reaches it
static inline void skewStep(Walk *w, const u32 *A, const u64 *H, const u32 *s0, u32 s0s, const u8 *low, u32 l, u32 lm, u32 *out) {
  u32 x = A[w->t++], h = l < 32 ? x >> l : 0, xl = x & lm, p = w->p, z = w->z;
  if (z < h) {
    u32 need = h - z;
    if (need > 256) p = select0(H, s0, s0s, h - 1) + 1;
    else { u32 q = p >> 6; u64 cur = ~H[q] & (~0ULL << (p & 63)); u32 c; while (need > (c = (u32)POP(cur))) { need -= c; cur = ~H[++q]; } p = q * 64 + sel64(cur, need - 1) + 1; }
    z = h;
  }
  for (;;) {
    if (!((H[p >> 6] >> (p & 63)) & 1)) break;
    u32 lo = (u32)lowAt(low, l, p - z);
    if (lo >= xl) { if (lo == xl && (w->o == w->s || out[w->o - 1] != x)) out[w->o++] = x; break; }
    p++;
  }
  w->p = p; w->z = z;
}
// values of A (sorted, na) that the much longer flat list b (classic or fast layout) holds, each once: forward walks over b's high bits, bucket by bucket,
// with a jump through the zero samples when the next bucket is far; nothing of b is decoded
static u32 skewAnd(const u32 *A, u32 na, const u8 *b, u32 *out) {
  OPEN(b)
  u32 hmax = maxv >> l, lm = l ? (u32)mask(l) : 0, e = na;
  while (e > 0 && (l < 32 ? A[e - 1] >> l : 0) > hmax) e--;   // values above b's last bucket cannot match
  Walk w = { 0, 0, 0, e, 0, 0 };   // (two walkers side by side were slower in all 3 browsers)
  while (w.t < w.e) skewStep(&w, A, H, s0, s0s, low, l, lm, out);
  return w.o;
}
#ifdef __wasm_simd128__
// values r0 .. r0+cnt-1 of a flat list (not bitmap, not runs; l <= 16, r0 a multiple of 8) into out, pos0 = the high-bits place of value r0.
// Writes up to 7 values before out and up to 7 after out[cnt]; the caller keeps what sits before out.
static void efSegCore(const u8 *low, const u8 *Hb, u32 l, u32 r0, u32 cnt, u32 pos0, u32 *out) {
  u32 k = pos0 >> 3, e = r0 + cnt, i = r0 - (u32)__builtin_popcount(Hb[k] & ((1u << (pos0 & 7)) - 1));
  u32 *o = out - r0;
  for (; i < e; k++) {
    u32 x = Hb[k]; v128_t q = wasm_u16x8_load8x8(QT[x]); v128_t bv = wasm_i32x4_splat((int)(k * 8 - i));
    wasm_v128_store(o + i, wasm_i32x4_add(wasm_u32x4_extend_low_u16x8(q), bv)); wasm_v128_store(o + i + 4, wasm_i32x4_add(wasm_u32x4_extend_high_u16x8(q), bv)); i += Q8[x];
  }
  if (l == 0) return;
  if (l > 16) { for (u32 g = r0; g < e; g++) o[g] = (u32)(((u64)o[g] << l) | lowAt(low, l, g)); return; }
  if (l <= 8) {
    v128_t SW = wasm_v128_load(SW8[l]), MU = wasm_v128_load(MU8[l]), MK = wasm_i16x8_splat((short)mask(l));
    for (u32 g = r0; g < e; g += 8) {
      v128_t f = wasm_i8x16_swizzle(wasm_v128_load64_zero(low + (g >> 3) * l), SW);
      f = wasm_v128_and(wasm_u16x8_shr(wasm_i16x8_mul(f, MU), 8), MK);
      wasm_v128_store(o + g, wasm_v128_or(wasm_i32x4_shl(wasm_v128_load(o + g), l), wasm_u32x4_extend_low_u16x8(f)));
      wasm_v128_store(o + g + 4, wasm_v128_or(wasm_i32x4_shl(wasm_v128_load(o + g + 4), l), wasm_u32x4_extend_high_u16x8(f)));
    }
    return;
  }
  u32 h2 = (4 * l) >> 3;
  v128_t S0 = wasm_v128_load(SW16[l]), S1 = wasm_v128_load(SW16[l] + 16), M0 = wasm_v128_load(MU16[l]), M1 = wasm_v128_load(MU16[l] + 4), MK = wasm_i32x4_splat((int)mask(l));
  for (u32 g = r0; g < e; g += 8) {
    const u8 *p = low + (g >> 3) * l; v128_t v = wasm_v128_load64_lane(p + h2, wasm_v128_load64_zero(p), 1);
    v128_t f0 = wasm_v128_and(wasm_u32x4_shr(wasm_i32x4_mul(wasm_i8x16_swizzle(v, S0), M0), 16), MK);
    v128_t f1 = wasm_v128_and(wasm_u32x4_shr(wasm_i32x4_mul(wasm_i8x16_swizzle(v, S1), M1), 16), MK);
    wasm_v128_store(o + g, wasm_v128_or(wasm_i32x4_shl(wasm_v128_load(o + g), l), f0));
    wasm_v128_store(o + g + 4, wasm_v128_or(wasm_i32x4_shl(wasm_v128_load(o + g + 4), l), f1));
  }
}
static u32 segFlush(const u8 *low, const u64 *H, u32 l, u32 n, u32 s, const u32 *s1, u32 g0, u32 g1, u32 *out) {   // stretches g0 .. g1-1 into out, keeping the 8 values before out
  u32 r0 = g0 << s, e = g1 << s, c = (e < n ? e : n) - r0, keep[8];
  for (u32 t = 0; t < 8; t++) keep[t] = out[(int)t - 8];
  efSegCore(low, (const u8 *)H, l, r0, c, s1[g0], out);
  for (u32 t = 0; t < 8; t++) out[(int)t - 8] = keep[t];
  return c;
}
// the values of a flat list (not bitmap or runs) from the first one >= lo through the last one <= hi, into out (a few values below lo may come first:
// they cannot be common, as lo is at least the first value of both lists); writes up to 8 values before out and 7 after the count it returns
static u32 trimDecode(const u8 *b, u32 lo, u32 hi, u32 *out) {
  OPEN(b)
  if (n < 16 || l > 31) { ef_decode_fast(b, out); return n; }
  u32 r = nextOne(b, lo), e = hi == 0xffffffffu ? n : nextOne(b, hi + 1);
  if (r >= e) return 0;
  if (!qtOk) qtInit();
  u32 r0 = r & ~7u;
  efSegCore(low, (const u8 *)H, l, r0, e - r0, select1(H, s1, s, r0), out);
  return e - r0;
}
// the longer list b (flat, not bitmap or runs, l <= 16) decoded only in the sample stretches (2^s values) that hold a value of A (sorted, na values); returns how many went to out
static u32 segDecode(const u32 *A, u32 na, const u8 *b, u32 *out) {
  OPEN(b)
  if (!qtOk) qtInit();
  u32 G = (n + (1u << s) - 1) >> s, j = 0, o = 0, g = 0, cur = lowAt(low, l, 0) | (u32)((u64)s1[0] << l); int st = -1;
  for (; g < G; g++) {
    u32 r1 = (g + 1) << s, nxt = g + 1 < G ? (u32)(((u64)(s1[g + 1] - r1) << l) | lowAt(low, l, r1)) : maxv;
    while (j < na && A[j] < cur) j++;
    if (j < na && A[j] <= nxt) { if (st < 0) st = (int)g; }
    else { if (st >= 0) { o += segFlush(low, H, l, n, s, s1, (u32)st, g, out + o); st = -1; } if (j >= na) break; }
    cur = nxt;
  }
  if (st >= 0) o += segFlush(low, H, l, n, s, s1, (u32)st, g, out + o);
  return o;
}
// the same, for the stretches of b that meet one of the runs (as[k] .. as[k] + ac[k+1] - ac[k] - 1) of a run list
static u32 segDecodeIv(const u32 *as, const u32 *ac, u32 Ra, const u8 *b, u32 *out) {
  OPEN(b)
  if (!qtOk) qtInit();
  u32 G = (n + (1u << s) - 1) >> s, k = 0, o = 0, g = 0, cur = lowAt(low, l, 0) | (u32)((u64)s1[0] << l); int st = -1;
  for (; g < G; g++) {
    u32 r1 = (g + 1) << s, nxt = g + 1 < G ? (u32)(((u64)(s1[g + 1] - r1) << l) | lowAt(low, l, r1)) : maxv;
    while (k < Ra && (u64)as[k] + (ac[k + 1] - ac[k]) <= cur) k++;
    if (k < Ra && as[k] <= nxt) { if (st < 0) st = (int)g; }
    else { if (st >= 0) { o += segFlush(low, H, l, n, s, s1, (u32)st, g, out + o); st = -1; } if (k >= Ra) break; }
    cur = nxt;
  }
  if (st >= 0) o += segFlush(low, H, l, n, s, s1, (u32)st, g, out + o);
  return o;
}
#endif
#ifdef __wasm_simd128__
// a run list against any flat list: the runs are walked as intervals (starts and counts decoded into scr), the other list is decoded whole unless it has runs too
static u32 gallopGE(const u32 *X, u32 i, u32 n, u64 key) {   // first index from i on with X[index] >= key (X sorted)
  u32 step = 1, lo = i, hi = i;
  while (hi < n && X[hi] < key) { lo = hi + 1; hi += step; step <<= 1; }
  if (hi > n) hi = n;
  while (lo < hi) { u32 m = (lo + hi) >> 1; if (X[m] < key) lo = m + 1; else hi = m; }
  return lo;
}
static u32 andRuns(const u8 *a, const u8 *b, u32 ra, u32 rb, u32 *out, u32 *scr) {
  if (!ra) { const u8 *t = a; a = b; b = t; ra = 1; rb = 0; }   // a has runs
  u32 Ra = rd32(a, 20), na = lenOf(a), o = 0, *was = scr, *wac = was + ((Ra + 16) & ~3u), *rest = wac + ((Ra + 16) & ~3u);
  RUN_TABS(a, Ra, Sa, Ca) const u32 *as = Sa, *ac = Ca;
  if (!Sa) { ef_decode_fast(RUN_S(a), was); ef_decode_fast(RUN_C(a), wac); wac[Ra] = na; as = was; ac = wac; }
  if (rb) {   // both: overlap of intervals
    u32 Rb = rd32(b, 20), nb = lenOf(b), *wbs = rest, *wbc = wbs + ((Rb + 16) & ~3u), i = 0, j = 0;
    RUN_TABS(b, Rb, Sb, Cb) const u32 *bs = Sb, *bc = Cb;
    if (!Sb) { ef_decode_fast(RUN_S(b), wbs); ef_decode_fast(RUN_C(b), wbc); wbc[Rb] = nb; bs = wbs; bc = wbc; }
    if (Rb > 16 * Ra || Ra > 16 * Rb) {   // one has far more runs: for each run of the other, jump to the first overlapping run by binary search
      const u32 *xs = as, *xc = ac, *ys = bs, *yc = bc; u32 Rx = Ra, Ry = Rb; if (Ra > Rb) { xs = bs; xc = bc; ys = as; yc = ac; Rx = Rb; Ry = Ra; }
      for (u32 t = 0; t < Rx; t++) {
        u64 s1 = xs[t], e1 = s1 + (xc[t + 1] - xc[t]);
        u32 q = firstAbove(ys + j, Ry - j, (u32)s1) + j; j = q ? q - 1 : 0;   // the last run starting at or below s1
        for (; j < Ry; j++) {
          u64 s2 = ys[j], e2 = s2 + (yc[j + 1] - yc[j]), lo = s1 > s2 ? s1 : s2, hi = e1 < e2 ? e1 : e2;
          if (s2 >= e1) break;
          if (lo < hi) { fillRun(out + o, (u32)lo, (u32)(hi - lo)); o += (u32)(hi - lo); }
        }
        if (j > 0) j--;
      }
      return o;
    }
    while (i < Ra && j < Rb) {
      u64 s1 = as[i], e1 = s1 + (ac[i + 1] - ac[i]), s2 = bs[j], e2 = s2 + (bc[j + 1] - bc[j]), lo = s1 > s2 ? s1 : s2, hi = e1 < e2 ? e1 : e2;
      if (lo < hi) { fillRun(out + o, (u32)lo, (u32)(hi - lo)); o += (u32)(hi - lo); }
      if (e1 <= e2) i++; else j++;
    }
    return o;
  }
  if (rd32(b, 48) == 1) {   // a bitmap: read its words inside each run, nothing is decoded
    u32 bd = rd32(b, 52), md = rd32(b, 8); const u64 *D = (const u64 *)(b + rd32(b, 28));
    for (u32 k = 0; k < Ra; k++) {
      u64 s0 = as[k], e0 = s0 + (ac[k + 1] - ac[k]); if (e0 <= bd) continue; if (s0 > md) break;
      u32 p0 = s0 > bd ? (u32)(s0 - bd) : 0, p1 = (u32)((e0 > (u64)md + 1 ? (u64)md + 1 : e0) - bd), w = p0 >> 6, we = (p1 - 1) >> 6;
      for (; w <= we; w++) {
        u64 x = D[w]; if (w == p0 >> 6) x &= ~0ULL << (p0 & 63); if (w == we && (p1 & 63)) x &= (1ULL << (p1 & 63)) - 1;
        while (x) { out[o++] = bd + w * 64 + CTZ(x); x &= x - 1; }
      }
    }
    return o;
  }
  u32 nb = lenOf(b), *xb = rest + 8, k = 0; u64 end = (u64)as[0] + (ac[1] - ac[0]);
  if (nb >= 1024 && rd32(b, 48) == 0 && rd32(b, 12) <= 16) nb = segDecodeIv(as, ac, Ra, b, xb); else ef_decode_fast(b, xb);
  if ((u64)Ra * 8 < nb) {   // few runs for many values: jump to each run's first and past its last value, then copy the stretch between
    u32 t = 0;
    for (k = 0; k < Ra && t < nb; k++) {
      u64 s0 = as[k], e0 = s0 + (ac[k + 1] - ac[k]);
      t = gallopGE(xb, t, nb, s0); u32 u = gallopGE(xb, t, nb, e0);
      for (; t < u; t++) { u32 x = xb[t]; out[o] = x; o += (o == 0 || out[o - 1] != x); }
    }
    return o;
  }
  for (u32 t = 0; t < nb; t++) {
    u32 x = xb[t];
    while (x >= end) { if (++k >= Ra) return o; end = (u64)as[k] + (ac[k + 1] - ac[k]); }
    out[o] = x; o += (x >= as[k]) & (o == 0 || out[o - 1] != x);
  }
  return o;
}
#endif
u32 ef_intersect_s(const u32 *h, u32 k, u32 *out, u32 *scr) {
#ifdef __wasm_simd128__
  if (k >= 2 && h[1] == 0 && h[3] == 0) {
    const u8 *a = (const u8 *)h[0], *b = (const u8 *)h[2]; u32 na = lenOf(a), nb = lenOf(b);
    if (na == 0 || nb == 0) return 0;
    if (nb >= (u64)SKEW * na && rd32(b, 48) == 0 && rd32(b, 12) < 32) {   // the shorter list decoded, the longer one walked
      u32 m; ef_decode_fast(a, scr); m = skewAnd(scr, na, b, out);
      for (u32 i = 2; i < k && m; i++) {
        const u8 *c = (const u8 *)h[2 * i]; u32 kc = h[2 * i + 1], lenc = lenOf(c), keep = 0, hint = 0, v;
        for (u32 t = 0; t < m; t++) { u32 j = kc == 0 ? nextOneV(c, out[t], &v) : pefNextV(c, out[t], &v, &hint); if (j >= lenc) break; if (v == out[t]) out[keep++] = v; }
        m = keep;
      }
      return m;
    }
    if ((u64)nb < 32ULL * na || (nb < 512ULL * na && (rd32(b, 48) != 0 || (nb >= 1024 && rd32(b, 12) <= 16)))) {
      u32 da = rd32(a, 48) == 1, db = rd32(b, 48) == 1, m;
      u32 ra = rd32(a, 48) == 2, rb = rd32(b, 48) == 2;
      if (ra || rb) m = andRuns(a, b, ra, rb, out, scr);
      else if (da && db) m = andDense2(a, b, out);
      else if (da && nb >= 4 * na && nb >= 1024 && rd32(b, 12) <= 16) { u32 *sb = scr + ((na + 96) & ~3u); ef_decode_fast(a, scr); u32 mb = segDecode(scr, na, b, sb); m = simdAnd(scr, na, sb, mb, out); }
      else if (da || db) { const u8 *x = da ? b : a; ef_decode_fast(x, scr); m = andBits(scr, lenOf(x), da ? a : b, out); }
      else {   // both flat: only the stretch where their ranges overlap is decoded (none when they do not overlap)
        u32 fa = getOne(a, 0), fb = getOne(b, 0), xa = rd32(a, 8), xb = rd32(b, 8), lo = fa > fb ? fa : fb, hi = xa < xb ? xa : xb;
        // trimming costs a few lookups: worth it only when the overlap leaves out a good part (over 1/8) of either list's range
        u32 full = (lo <= hi && (u64)(hi - lo) * 8 >= (u64)(xa - fa) * 7 && (u64)(hi - lo) * 8 >= (u64)(xb - fb) * 7);
        if (lo > hi || full) { if (lo > hi) return 0;
          u32 *sb = scr + ((na + 96) & ~3u); ef_decode_fast(a, scr);
          u32 mb = (nb >= 1024 && rd32(b, 12) <= 16) ? segDecode(scr, na, b, sb) : (ef_decode_fast(b, sb), nb); m = simdAnd(scr, na, sb, mb, out); }
        else {
          u32 *sa = scr + 8, ta = trimDecode(a, lo, hi, sa), *sb = sa + ((na + 96) & ~3u);
          u32 mb = (nb >= 1024 && rd32(b, 12) <= 16) ? segDecode(sa, ta, b, sb) : trimDecode(b, lo, hi, sb); m = simdAnd(sa, ta, sb, mb, out);
        }
      }
      for (u32 i = 2; i < k && m; i++) {
        const u8 *c = (const u8 *)h[2 * i]; u32 kc = h[2 * i + 1], lenc = lenOf(c), keep = 0, hint = 0, v;
        for (u32 t = 0; t < m; t++) { u32 j = kc == 0 ? nextOneV(c, out[t], &v) : pefNextV(c, out[t], &v, &hint); if (j >= lenc) break; if (v == out[t]) out[keep++] = v; }
        m = keep;
      }
      return m;
    }
  }
#endif
  (void)scr; return ef_intersect(h, k, out);
}

// ---- block lists (format in the module's .js, buildBlocks): blocks of 65,536 values, each Elias-Fano, a bitmap or a sorted u16 array ----
#define BHDR 64
typedef struct { u32 key, kind, l, c; const u8 *d; } Blk;
static inline Blk blkAt(const u8 *b, u32 k) {
  const u32 *t = (const u32 *)(b + BHDR) + 4 * k; u32 n = rd32(b, 4), nb = rd32(b, 8);
  Blk r; r.key = t[0]; r.kind = t[1] & 255; r.l = t[1] >> 8; r.c = (k + 1 < nb ? t[6] : n) - t[2]; r.d = b + t[3]; return r;
}
static inline u32 efBlkLowB(u32 c, u32 l) { return ((((c * l + 31) >> 5) + 2) * 4 + 7) & ~7u; }
static inline u32 efLowBits(const u8 *low, u32 l, u32 q) { return (u32)lowAt(low, l, q); }
// block values as u16 into out (EF and array blocks); returns the count. out needs 8 spare slots after the count.
static u32 blkU16(Blk B, u16 *out) {
  if (B.kind == 2) { const u16 *a = (const u16 *)B.d; for (u32 q = 0; q < B.c; q++) out[q] = a[q]; return B.c; }
  const u8 *low = B.d; const u64 *H = (const u64 *)(B.d + efBlkLowB(B.c, B.l)); u32 i = 0, l = B.l, c = B.c;
#ifdef __wasm_simd128__
  // high parts, one byte of high bits at a time: the table gives 8 candidate values at once and the byte's bit count says how many to keep
  if (!qtOk) qtInit();
  const u8 *Hb = (const u8 *)H;
  for (u32 k = 0; i < c; k++) { u32 x = Hb[k]; wasm_v128_store(out + i, wasm_i16x8_add(wasm_u16x8_load8x8(QT[x]), wasm_i16x8_splat((short)(k * 8 - i)))); i += Q8[x]; }
  if (l <= 8) {   // low parts, 8 values (l bytes) at a time: each lane takes the 2 bytes holding its bits, a multiply lines them up, a shift and a mask cut them out
    v128_t SW = wasm_v128_load(SW8[l]), MU = wasm_v128_load(MU8[l]), MK = wasm_i16x8_splat((short)mask(l));
    for (u32 g = 0; g < c; g += 8) {
      v128_t f = wasm_i8x16_swizzle(wasm_v128_load64_zero(low + (g >> 3) * l), SW);
      f = wasm_v128_and(wasm_u16x8_shr(wasm_i16x8_mul(f, MU), 8), MK);
      wasm_v128_store(out + g, wasm_v128_or(wasm_i16x8_shl(wasm_v128_load(out + g), l), f));
    }
    return c;
  }
  if (l <= 16) {   // 9 to 16 low bits: 8 values are 9 to 16 bytes, read as two 8-byte halves; each lane takes 4 bytes
    u8 sw[32]; u32 mu[8]; u32 h2 = (4 * l) >> 3;
    for (u32 t = 0; t < 8; t++) { u32 bo = t * l, base = t < 4 ? 0 : h2, by = (bo >> 3) - base + (t < 4 ? 0 : 8); for (u32 z = 0; z < 4; z++) sw[4 * t + z] = (u8)(by + z); mu[t] = 1u << (16 - (bo & 7)); }
    v128_t S0 = wasm_v128_load(sw), S1 = wasm_v128_load(sw + 16), M0 = wasm_v128_load(mu), M1 = wasm_v128_load(mu + 4), MK = wasm_i32x4_splat((int)mask(l));
    for (u32 g = 0; g < c; g += 8) {
      const u8 *p = low + (g >> 3) * l; v128_t v = wasm_v128_load64_lane(p + h2, wasm_v128_load64_zero(p), 1);
      v128_t f0 = wasm_v128_and(wasm_u32x4_shr(wasm_i32x4_mul(wasm_i8x16_swizzle(v, S0), M0), 16), MK);
      v128_t f1 = wasm_v128_and(wasm_u32x4_shr(wasm_i32x4_mul(wasm_i8x16_swizzle(v, S1), M1), 16), MK);
      wasm_v128_store(out + g, wasm_v128_or(wasm_i16x8_shl(wasm_v128_load(out + g), l), wasm_u16x8_narrow_i32x4(f0, f1)));
    }
    return c;
  }
  for (u32 q = 0; q < c; q++) out[q] = (u16)(((u32)out[q] << l) | efLowBits(low, l, q));
#else
  for (u32 w = 0; i < c; w++) { u64 x = H[w]; while (x && i < c) { u32 bit = CTZ(x); out[i] = (u16)((((w * 64 + bit) - i) << l) | efLowBits(low, l, i)); i++; x &= x - 1; } }
#endif
  return c;
}
static __attribute__((noinline)) u32 bmpDecode(const u64 *M, u32 hi, u32 *out) { u32 o = 0; for (u32 w = 0; w < 1024; w++) { u64 x = M[w]; while (x) { out[o++] = hi | (w * 64 + CTZ(x)); x &= x - 1; } } return o; }
void bl_decode(const u8 *b, u32 *out) {   // out needs 32 spare bytes
  u32 nb = rd32(b, 8), o = 0;
  for (u32 k = 0; k < nb; k++) {
    Blk B = blkAt(b, k); u32 hi = B.key << 16;
    if (B.kind == 1) o += bmpDecode((const u64 *)B.d, hi, out + o);
    else if (B.kind == 2) { const u16 *a = (const u16 *)B.d; for (u32 q = 0; q < B.c; q++) out[o + q] = hi | a[q]; o += B.c; }
#ifdef __wasm_simd128__
    else {   // decode as u16 into the back half of this block's output, then widen forward 8 at a time (writes never pass the values still to be read)
      u16 *t = (u16 *)(out + o) + B.c; blkU16(B, t); v128_t vh = wasm_i32x4_splat((int)hi);
      for (u32 q = 0; q < B.c; q += 8) { v128_t v = wasm_v128_load(t + q); wasm_v128_store(out + o + q, wasm_v128_or(wasm_u32x4_extend_low_u16x8(v), vh)); wasm_v128_store(out + o + q + 4, wasm_v128_or(wasm_u32x4_extend_high_u16x8(v), vh)); }
      o += B.c; }
#else
    else { const u8 *low = B.d; const u64 *H = (const u64 *)(B.d + efBlkLowB(B.c, B.l)); u32 i = 0, l = B.l;
      for (u32 w = 0; i < B.c; w++) { u64 x = H[w]; while (x && i < B.c) { u32 bit = CTZ(x); out[o + i] = hi | ((((w * 64 + bit) - i) << l) | efLowBits(low, l, i)); i++; x &= x - 1; } }
      o += B.c; }
#endif
  }
}
static u32 blkHas(Blk B, u32 v) {
  if (B.kind == 1) return (u32)((((const u64 *)B.d)[v >> 6] >> (v & 63)) & 1);
  if (B.kind == 2) { const u16 *a = (const u16 *)B.d; u32 lo = 0, h = B.c; while (lo < h) { u32 m = (lo + h) >> 1; if (a[m] < v) lo = m + 1; else h = m; } return lo < B.c && a[lo] == v; }
  const u8 *low = B.d; const u64 *H = (const u64 *)(B.d + efBlkLowB(B.c, B.l)); u32 l = B.l, hb = v >> l, vl = v & (u32)mask(l), sp = 0, i = 0;
  if (hb) {   // start of bucket hb: after the hb-th zero
    u32 need = hb, w = 0;
    for (;; w++) { u64 z = ~H[w]; u32 c = POP(z); if (c < need) { need -= c; continue; } u32 pos = w * 64 + sel64(z, need - 1); sp = pos + 1; i = sp - hb; break; }
  }
  while (i < B.c && ((H[sp >> 6] >> (sp & 63)) & 1)) { u32 lo = efLowBits(low, l, i); if (lo >= vl) return lo == vl; i++; sp++; }
  return 0;
}
void bl_contains_many(const u8 *b, const u32 *xs, u8 *out, u32 k) {
  u32 nb = rd32(b, 8); const u32 *t = (const u32 *)(b + BHDR);
  for (u32 q = 0; q < k; q++) {
    u32 x = xs[q], key = x >> 16, lo = 0, h = nb;
    while (lo < h) { u32 m = (lo + h) >> 1; if (t[4 * m] < key) lo = m + 1; else h = m; }
    out[q] = (lo < nb && t[4 * lo] == key) ? (u8)blkHas(blkAt(b, lo), x & 65535) : 0;
  }
}
#define SIMDR 8    // a at least 1/8 of b: SIMD 8-by-8 compare (ef-simd.wasm); shorter: galloping
#define GALLOP 4   // plain build: gallop when a is under 1/4 of b, else a merge without branches
static u32 andU16(const u16 *a, u32 na, const u16 *b, u32 nb, u32 hi, u32 *out) {   // a the shorter; out has one spare slot
  u32 i = 0, j = 0, o = 0;
#ifdef __wasm_simd128__
  if (na * SIMDR >= nb) {   // 8 against 8: each value of a's 8 compared with every rotation of b's 8 at once; matches are rare in sparse blocks, so they are written one by one
    while (i + 8 <= na && j + 8 <= nb) {
      v128_t va = wasm_v128_load(a + i), vb = wasm_v128_load(b + j);
      v128_t m = wasm_i16x8_eq(va, vb);
      m = wasm_v128_or(m, wasm_i16x8_eq(va, wasm_i8x16_shuffle(vb, vb, 2,3,4,5,6,7,8,9,10,11,12,13,14,15,0,1)));
      m = wasm_v128_or(m, wasm_i16x8_eq(va, wasm_i8x16_shuffle(vb, vb, 4,5,6,7,8,9,10,11,12,13,14,15,0,1,2,3)));
      m = wasm_v128_or(m, wasm_i16x8_eq(va, wasm_i8x16_shuffle(vb, vb, 6,7,8,9,10,11,12,13,14,15,0,1,2,3,4,5)));
      m = wasm_v128_or(m, wasm_i16x8_eq(va, wasm_i8x16_shuffle(vb, vb, 8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7)));
      m = wasm_v128_or(m, wasm_i16x8_eq(va, wasm_i8x16_shuffle(vb, vb, 10,11,12,13,14,15,0,1,2,3,4,5,6,7,8,9)));
      m = wasm_v128_or(m, wasm_i16x8_eq(va, wasm_i8x16_shuffle(vb, vb, 12,13,14,15,0,1,2,3,4,5,6,7,8,9,10,11)));
      m = wasm_v128_or(m, wasm_i16x8_eq(va, wasm_i8x16_shuffle(vb, vb, 14,15,0,1,2,3,4,5,6,7,8,9,10,11,12,13)));
      u32 bits = wasm_i16x8_bitmask(m);
      while (bits) { u32 t = CTZ(bits); out[o++] = hi | a[i + t]; bits &= bits - 1; }
      u16 am = a[i + 7], bm = b[j + 7]; i += am <= bm ? 8 : 0; j += bm <= am ? 8 : 0;
    }
    while (i < na && j < nb) { u16 x = a[i], y = b[j]; out[o] = hi | x; o += x == y; i += x <= y; j += y <= x; }
    return o;
  }
#endif
  if (na * GALLOP < nb) {   // much shorter: gallop through b
    for (; i < na; i++) { u16 x = a[i]; u32 step = 1, lo = j; while (lo + step < nb && b[lo + step] < x) { lo += step; step <<= 1; }
      u32 h = lo + step < nb ? lo + step : nb; while (lo < h) { u32 m = (lo + h) >> 1; if (b[m] < x) lo = m + 1; else h = m; }
      j = lo; if (j >= nb) break; out[o] = hi | x; o += b[j] == x; }
    return o;
  }
  while (i < na && j < nb) { u16 x = a[i], y = b[j]; out[o] = hi | x; o += x == y; i += x <= y; j += y <= x; }
  return o;
}
static u32 andU16Bmp(const u16 *a, u32 na, const u64 *M, u32 hi, u32 *out) { u32 o = 0; for (u32 i = 0; i < na; i++) { u16 x = a[i]; out[o] = hi | x; o += (u32)((M[x >> 6] >> (x & 63)) & 1); } return o; }
u32 bl_and(const u8 *a, const u8 *b, u32 *out, u16 *BUFA) {   // BUFA: scratch of 2 x 65,536 u16 from the caller
  u16 *BUFB = BUFA + 65536;
  u32 na = rd32(a, 8), nb = rd32(b, 8), i = 0, j = 0, o = 0; const u32 *ta = (const u32 *)(a + BHDR), *tb = (const u32 *)(b + BHDR);
  while (i < na && j < nb) {
    u32 ka = ta[4 * i], kb = tb[4 * j];
    if (ka < kb) { i++; continue; } if (kb < ka) { j++; continue; }
    Blk A = blkAt(a, i), B = blkAt(b, j); u32 hi = ka << 16;
    if (A.kind == 1 && B.kind == 1) { const u64 *X = (const u64 *)A.d, *Y = (const u64 *)B.d; for (u32 w = 0; w < 1024; w++) { u64 x = X[w] & Y[w]; while (x) { out[o++] = hi | (w * 64 + CTZ(x)); x &= x - 1; } } }
    else if (A.kind == 1 || B.kind == 1) { Blk S = A.kind == 1 ? B : A, M = A.kind == 1 ? A : B; const u16 *s = S.kind == 2 ? (const u16 *)S.d : BUFA; if (S.kind != 2) blkU16(S, BUFA); o += andU16Bmp(s, S.c, (const u64 *)M.d, hi, out + o); }
    else {
      const u16 *x = A.kind == 2 ? (const u16 *)A.d : BUFA, *y = B.kind == 2 ? (const u16 *)B.d : BUFB;
      if (A.kind != 2) blkU16(A, BUFA); if (B.kind != 2) blkU16(B, BUFB);
      o += A.c <= B.c ? andU16(x, A.c, y, B.c, hi, out + o) : andU16(y, B.c, x, A.c, hi, out + o);
    }
    i++; j++;
  }
  return o;
}
u32 bl_contains(const u8 *b, u32 x) { u8 r; bl_contains_many(b, &x, &r, 1); return r; }
