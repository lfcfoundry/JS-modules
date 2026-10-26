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
