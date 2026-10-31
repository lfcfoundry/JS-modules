/* Copyright (c) 2026 LFC Foundry. MIT License.
 * Experimental gpu-blur kernel: same picture as blur.c (three box passes along each axis, out = floor(sum / n + 0.5), n = 2b + 1, b <= 50),
 * but the running sums live in 16-bit lanes (a sum is at most 101 * 255 = 25,755), so one 128-bit register carries two pixels instead of one,
 * and the rounding is exact integer math: q = ((2 * sum + n) * M) >> k, with M and k picked per n so it equals floor((2 * sum + n) / (2 * n)).
 *   hrows(A, B, rowA, rowB, w, y0, y1, b): rows two at a time; rowA and rowB are scratch of w * 8 bytes (two rows interleaved pixel by pixel)
 *   vcols(B, A, stA, stB, col, w, h, x0, x1, b): as blur.c (strips of at most 16 columns); col is 16 * 16 bytes
 * Built with -DTHREADS (blurmt.wasm, the opt-in threads route) it keeps no static data, so many workers can run it on one shared memory:
 *   km(n) returns pick's answer (k << 24 | M); hrows and vcols take it as a last argument, and vcols walks any number of columns in strips of 16.
 */
#include <wasm_simd128.h>
typedef unsigned char u8;
typedef unsigned short u16;

#ifdef THREADS
__attribute__((export_name("km"))) unsigned km(int n) {
  for (int k = 16; k < 32; k++) {
    unsigned M = (unsigned)(((1ull << k) + 2 * n - 1) / (2 * n));
    if ((unsigned long long)(2 * 255 * n + n) * M >= (1ull << 32)) break;
    int ok = 1;
    for (int s = 0; s <= 255 * n && ok; s++) if ((((unsigned long long)(2 * s + n)) * M) >> k != (unsigned)((2 * s + n) / (2 * n))) ok = 0;
    if (ok) return ((unsigned)k << 24) | M;
  }
  return 0;
}
#define KM_ARG , unsigned km
#define SETUP(n) unsigned M_MUL = km & 0xffffff; int K_SH = (int)(km >> 24)
#else
static int K_SH; static unsigned M_MUL;
static void pick(int n) {   /* smallest k with M = ceil(2^k / 2n) exact for every sum 0..255n (checked offline for all n = 3..101) */
  for (int k = 16; k < 32; k++) {
    unsigned M = (unsigned)(((1ull << k) + 2 * n - 1) / (2 * n));
    if ((unsigned long long)(2 * 255 * n + n) * M >= (1ull << 32)) break;
    int ok = 1;
    for (int s = 0; s <= 255 * n && ok; s++) if ((((unsigned long long)(2 * s + n)) * M) >> k != (unsigned)((2 * s + n) / (2 * n))) ok = 0;
    if (ok) { K_SH = k; M_MUL = M; return; }
  }
}
static int last_n = -1;
static inline void setup(int n) { if (n != last_n) { pick(n); last_n = n; } }
#define KM_ARG
#define SETUP(n) setup(n)
#endif

/* 8 x u16 sums -> 8 bytes rounded (two pixels), result in the low 8 bytes */
static inline v128_t round8(v128_t sum, v128_t nv, v128_t mv, int k) {
  v128_t t = wasm_i16x8_add(wasm_i16x8_shl(sum, 1), nv);
  v128_t lo = wasm_u32x4_shr(wasm_u32x4_extmul_low_u16x8(t, mv), k);
  v128_t hi = wasm_u32x4_shr(wasm_u32x4_extmul_high_u16x8(t, mv), k);
  v128_t r = wasm_u16x8_narrow_i32x4(lo, hi);
  return wasm_u8x16_narrow_i16x8(r, r);
}
static inline v128_t ld2(const u8 *p) { return wasm_u16x8_extend_low_u8x16(wasm_v128_load64_zero(p)); }   /* 8 bytes -> u16x8 */
static inline v128_t ldpair(const u8 *p, const u8 *q) {   /* pixel at p and pixel at q -> u16x8 */
  v128_t v = wasm_v128_load32_zero(p); v = wasm_v128_load32_lane(q, v, 1); return wasm_u16x8_extend_low_u8x16(v);
}

/* one box pass along a pair of rows held interleaved (8 bytes per x) */
static void box_pair(const u8 *s, u8 *d, int n, int b, v128_t nv, v128_t mv, int k) {
  v128_t sum = wasm_i16x8_mul(ld2(s), wasm_i16x8_splat(b + 1));
  for (int t = 1; t <= b; t++) sum = wasm_i16x8_add(sum, ld2(s + (long)(t < n ? t : n - 1) * 8));
  for (int x = 0; x < n; x++) {
    wasm_v128_store64_lane(d + (long)x * 8, round8(sum, nv, mv, k), 0);
    int a = x + b + 1; if (a > n - 1) a = n - 1;
    int c = x - b; if (c < 0) c = 0;
    sum = wasm_i16x8_add(sum, wasm_i16x8_sub(ld2(s + (long)a * 8), ld2(s + (long)c * 8)));
  }
}
/* first pass reads two separate rows (not interleaved) */
static void box_pair_in(const u8 *r0, const u8 *r1, u8 *d, int n, int b, v128_t nv, v128_t mv, int k) {
  v128_t sum = wasm_i16x8_mul(ldpair(r0, r1), wasm_i16x8_splat(b + 1));
  for (int t = 1; t <= b; t++) { long o = (long)(t < n ? t : n - 1) * 4; sum = wasm_i16x8_add(sum, ldpair(r0 + o, r1 + o)); }
  for (int x = 0; x < n; x++) {
    wasm_v128_store64_lane(d + (long)x * 8, round8(sum, nv, mv, k), 0);
    int a = x + b + 1; if (a > n - 1) a = n - 1;
    int c = x - b; if (c < 0) c = 0;
    sum = wasm_i16x8_add(sum, wasm_i16x8_sub(ldpair(r0 + (long)a * 4, r1 + (long)a * 4), ldpair(r0 + (long)c * 4, r1 + (long)c * 4)));
  }
}
/* last pass writes two separate rows */
static void box_pair_out(const u8 *s, u8 *o0, u8 *o1, int n, int b, v128_t nv, v128_t mv, int k) {
  v128_t sum = wasm_i16x8_mul(ld2(s), wasm_i16x8_splat(b + 1));
  for (int t = 1; t <= b; t++) sum = wasm_i16x8_add(sum, ld2(s + (long)(t < n ? t : n - 1) * 8));
  for (int x = 0; x < n; x++) {
    v128_t r = round8(sum, nv, mv, k);
    wasm_v128_store32_lane(o0 + (long)x * 4, r, 0);
    if (o1) wasm_v128_store32_lane(o1 + (long)x * 4, r, 1);
    int a = x + b + 1; if (a > n - 1) a = n - 1;
    int c = x - b; if (c < 0) c = 0;
    sum = wasm_i16x8_add(sum, wasm_i16x8_sub(ld2(s + (long)a * 8), ld2(s + (long)c * 8)));
  }
}

__attribute__((export_name("hrows"))) void hrows(const u8 *A, u8 *B, u8 *rowA, u8 *rowB, int w, int y0, int y1, int b KM_ARG) {
  int n = 2 * b + 1; SETUP(n); v128_t nv = wasm_i16x8_splat(n), mv = wasm_i16x8_splat((short)M_MUL); int k = K_SH;
  long rs = (long)w * 4;
  for (int y = y0; y < y1; y += 2) {
    int two = y + 1 < y1;
    const u8 *r0 = A + y * rs, *r1 = two ? r0 + rs : r0;
    box_pair_in(r0, r1, rowA, w, b, nv, mv, k);
    box_pair(rowA, rowB, w, b, nv, mv, k);
    box_pair_out(rowB, B + y * rs, two ? B + (y + 1) * rs : 0, w, b, nv, mv, k);
  }
}

/* one box pass down a strip of sw columns, two pixels per register */
static void box_strip(const u8 *s, long ss, u8 *d, long ds, int sw, int n, int b, v128_t nv, v128_t mv, int k, v128_t *col) {
  int np = (sw + 1) >> 1;   /* pixel pairs; an odd last column is paired with itself */
  for (int p = 0; p < np; p++) {
    long xo = (long)p * 8; int single = 2 * p + 1 >= sw;
    #define LD(base) (single ? ldpair((base) + xo, (base) + xo) : ld2((base) + xo))
    v128_t sum = wasm_i16x8_mul(LD(s), wasm_i16x8_splat(b + 1));
    for (int t = 1; t <= b; t++) sum = wasm_i16x8_add(sum, LD(s + (long)(t < n ? t : n - 1) * ss));
    col[p] = sum;
  }
  for (int y = 0; y < n; y++) {
    int a = y + b + 1; if (a > n - 1) a = n - 1;
    int c = y - b; if (c < 0) c = 0;
    const u8 *ra = s + (long)a * ss, *rc = s + (long)c * ss; u8 *rd = d + (long)y * ds;
    for (int p = 0; p < np; p++) {
      long xo = (long)p * 8; int single = 2 * p + 1 >= sw;
      v128_t v = col[p], r = round8(v, nv, mv, k);
      if (single) wasm_v128_store32_lane(rd + xo, r, 0); else wasm_v128_store64_lane(rd + xo, r, 0);
      col[p] = wasm_i16x8_add(v, wasm_i16x8_sub(LD(ra), LD(rc)));
    }
  }
}

static inline void strip3(const u8 *B, u8 *A, u8 *stA, u8 *stB, v128_t *col, int w, int h, int x0, int sw, int b, v128_t nv, v128_t mv, int k) {
  long sb = (long)sw * 4;
  box_strip(B + (long)x0 * 4, (long)w * 4, stA, sb, sw, h, b, nv, mv, k, col);
  box_strip(stA, sb, stB, sb, sw, h, b, nv, mv, k, col);
  box_strip(stB, sb, A + (long)x0 * 4, (long)w * 4, sw, h, b, nv, mv, k, col);
}
__attribute__((export_name("vcols"))) void vcols(const u8 *B, u8 *A, u8 *stA, u8 *stB, v128_t *col, int w, int h, int x0, int x1, int b KM_ARG) {
  int n = 2 * b + 1; SETUP(n); v128_t nv = wasm_i16x8_splat(n), mv = wasm_i16x8_splat((short)M_MUL); int k = K_SH;
#ifdef THREADS
  for (; x0 < x1; x0 += 16) strip3(B, A, stA, stB, col, w, h, x0, x1 - x0 < 16 ? x1 - x0 : 16, b, nv, mv, k);
#else
  strip3(B, A, stA, stB, col, w, h, x0, x1 - x0, b, nv, mv, k);
#endif
}
