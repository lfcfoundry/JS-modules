/* Copyright (c) 2026 LFC Foundry. MIT License.
 * Fast kernels for memory-compression.js, written in plain C and compiled to WebAssembly (SIMD). The JavaScript in memory-compression.js has an
 * identical, slower version of every function here and uses it whenever WebAssembly is missing or blocked, so the results never differ.
 * Build: sh build.sh   (clang with the wasm32 target and wasm-ld; no libraries) */
#include <wasm_simd128.h>

typedef unsigned char u8;
typedef unsigned int u32;
typedef unsigned long long u64;
typedef unsigned long usize;
#define EXPORT __attribute__((visibility("default")))

static inline v128_t ld(const u8 *p) { return wasm_v128_load(p); }
static inline void st(u8 *p, v128_t v) { wasm_v128_store(p, v); }
static inline u32 ld32(const u8 *p) { u32 v; __builtin_memcpy(&v, p, 4); return v; }
static inline u64 ld64(const u8 *p) { u64 v; __builtin_memcpy(&v, p, 8); return v; }

/* ---------------------------------------------------------------- LZ4 block decoder (every access checked)
 * Returns 0, or a negative number: -1 data cut off, -2 literal run too long, -3 bad offset, -4 match too long, -5 size is wrong. */
EXPORT int lz4_decode(const u8 *src, int sn, u8 *dst, int dn) {
  const u8 *ip = src, *iend = src + sn;
  u8 *op = dst, *oend = dst + dn;
  while (ip < iend) {
    u32 tok = *ip++;
    usize lit = tok >> 4;
    if (lit == 15) {
      u32 e;
      do { if (ip >= iend) return -1; e = *ip++; lit += e; if (lit > 0x7fffffff) return -2; } while (e == 255);
    }
    if (lit > (usize)(oend - op) || lit > (usize)(iend - ip)) return -2;
    if ((usize)(oend - op) >= lit + 16 && (usize)(iend - ip) >= lit + 16) {
      const u8 *s = ip; u8 *d = op, *e = op + lit;
      do { st(d, ld(s)); d += 16; s += 16; } while (d < e);
    } else {
      for (usize i = 0; i < lit; i++) op[i] = ip[i];
    }
    ip += lit; op += lit;
    if (ip >= iend) break;
    if (iend - ip < 2) return -1;
    usize off = ip[0] | (ip[1] << 8); ip += 2;
    usize ml = tok & 15;
    if (ml == 15) {
      u32 e;
      do { if (ip >= iend) return -1; e = *ip++; ml += e; if (ml > 0x7fffffff) return -4; } while (e == 255);
    }
    ml += 4;
    if (off == 0 || off > (usize)(op - dst)) return -3;
    if (ml > (usize)(oend - op)) return -4;
    const u8 *m = op - off;
    if (off >= 16 && (usize)(oend - op) >= ml + 16) {
      u8 *d = op, *e = op + ml;
      do { st(d, ld(m)); d += 16; m += 16; } while (d < e);
    } else if (off == 1) {
      __builtin_memset(op, m[0], ml);
    } else {
      for (usize i = 0; i < ml; i++) op[i] = m[i];
    }
    op += ml;
  }
  return op == oend ? 0 : -5;
}

/* ---------------------------------------------------------------- LZ4 block encoder
 * ht: zeroed table of 1 << hbits u32. dst must hold n + n/255 + 16 bytes. Returns the number of bytes written. */
static inline u32 hash4(u32 v, int shift) { return (v * 2654435761u) >> shift; }
static inline u8 *put_len(u8 *d, usize v) { while (v >= 255) { *d++ = 255; v -= 255; } *d++ = (u8)v; return d; }

EXPORT int lz4_encode(const u8 *src, int n, u8 *dst, u32 *ht, int hbits) {
  const u8 *ip = src, *anchor = src, *iend = src + n;
  u8 *op = dst;
  int shift = 32 - hbits;
  if (n >= 13) {
    const u8 *mflimit = iend - 12, *mlimit = iend - 5;
    u32 skip = 64;
    ht[hash4(ld32(ip), shift)] = 0;
    ip++;
    while (ip <= mflimit) {
      u32 seq = ld32(ip), h = hash4(seq, shift);
      u32 refpos = ht[h];
      ht[h] = (u32)(ip - src);
      const u8 *ref = src + refpos;
      if (ref < ip && (usize)(ip - ref) < 65536 && ld32(ref) == seq) {
        while (ip > anchor && ref > src && ip[-1] == ref[-1]) { ip--; ref--; }
        const u8 *a = ip + 4, *b = ref + 4;
        while (a + 8 <= mlimit) {
          u64 x = ld64(a) ^ ld64(b);
          if (x) { a += __builtin_ctzll(x) >> 3; goto matched; }
          a += 8; b += 8;
        }
        while (a < mlimit && *a == *b) { a++; b++; }
      matched:
        if (a > mlimit) a = mlimit;
        usize ml = (usize)(a - ip) - 4, lit = (usize)(ip - anchor);
        u8 *token = op++;
        if (lit >= 15) { *token = 0xF0; op = put_len(op, lit - 15); } else *token = (u8)(lit << 4);
        { const u8 *s = anchor; u8 *d = op, *e = op + lit;
          if (lit >= 16) { do { st(d, ld(s)); d += 16; s += 16; } while (d < e); op = e; }
          else { while (d < e) *d++ = *s++; op = e; } }
        usize off = (usize)(ip - ref);
        *op++ = (u8)off; *op++ = (u8)(off >> 8);
        if (ml >= 15) { *token |= 15; op = put_len(op, ml - 15); } else *token |= (u8)ml;
        ip = anchor = a; skip = 64;
        if (ip - 2 <= mflimit) { const u8 *q = ip - 2; ht[hash4(ld32(q), shift)] = (u32)(q - src); }
        continue;
      }
      ip += skip++ >> 6;
    }
  }
  usize l = (usize)(iend - anchor);
  if (l >= 15) { *op++ = 0xF0; op = put_len(op, l - 15); } else *op++ = (u8)(l << 4);
  for (usize i = 0; i < l; i++) op[i] = anchor[i];
  op += l;
  return (int)(op - dst);
}

/* ---------------------------------------------------------------- shuffle: plane b holds byte b of every element
 * Layout of dst: plane 0 (N bytes), plane 1, ..., then the left-over tail bytes. */
#define SH(a, b, ...) wasm_i8x16_shuffle(a, b, __VA_ARGS__)

EXPORT void shuffle(const u8 *src, int len, int w, u8 *dst) {
  int N = len / w, i = 0;
  if (w == 4) {
    u8 *p0 = dst, *p1 = dst + N, *p2 = p1 + N, *p3 = p2 + N;
    for (; i + 16 <= N; i += 16) {
      v128_t a = ld(src + 4 * i), b = ld(src + 4 * i + 16), c = ld(src + 4 * i + 32), d = ld(src + 4 * i + 48);
      v128_t x0 = SH(a, b, 0, 4, 8, 12, 16, 20, 24, 28, 1, 5, 9, 13, 17, 21, 25, 29);
      v128_t x1 = SH(a, b, 2, 6, 10, 14, 18, 22, 26, 30, 3, 7, 11, 15, 19, 23, 27, 31);
      v128_t y0 = SH(c, d, 0, 4, 8, 12, 16, 20, 24, 28, 1, 5, 9, 13, 17, 21, 25, 29);
      v128_t y1 = SH(c, d, 2, 6, 10, 14, 18, 22, 26, 30, 3, 7, 11, 15, 19, 23, 27, 31);
      st(p0 + i, SH(x0, y0, 0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23));
      st(p1 + i, SH(x0, y0, 8, 9, 10, 11, 12, 13, 14, 15, 24, 25, 26, 27, 28, 29, 30, 31));
      st(p2 + i, SH(x1, y1, 0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23));
      st(p3 + i, SH(x1, y1, 8, 9, 10, 11, 12, 13, 14, 15, 24, 25, 26, 27, 28, 29, 30, 31));
    }
  } else if ((w & 3) == 0) {
    int lanes = w >> 2;
    for (; i + 16 <= N; i += 16) {
      for (int L = 0; L < lanes; L++) {
        const u8 *s = src + (usize)i * w + 4 * L;
        v128_t v[4];
        for (int k = 0; k < 4; k++) v[k] = wasm_u32x4_make(ld32(s + (usize)(4 * k) * w), ld32(s + (usize)(4 * k + 1) * w), ld32(s + (usize)(4 * k + 2) * w), ld32(s + (usize)(4 * k + 3) * w));
        v128_t x0 = SH(v[0], v[1], 0, 4, 8, 12, 16, 20, 24, 28, 1, 5, 9, 13, 17, 21, 25, 29);
        v128_t x1 = SH(v[0], v[1], 2, 6, 10, 14, 18, 22, 26, 30, 3, 7, 11, 15, 19, 23, 27, 31);
        v128_t y0 = SH(v[2], v[3], 0, 4, 8, 12, 16, 20, 24, 28, 1, 5, 9, 13, 17, 21, 25, 29);
        v128_t y1 = SH(v[2], v[3], 2, 6, 10, 14, 18, 22, 26, 30, 3, 7, 11, 15, 19, 23, 27, 31);
        u8 *p = dst + (usize)(4 * L) * N + i;
        st(p, SH(x0, y0, 0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23));
        st(p + N, SH(x0, y0, 8, 9, 10, 11, 12, 13, 14, 15, 24, 25, 26, 27, 28, 29, 30, 31));
        st(p + 2 * (usize)N, SH(x1, y1, 0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23));
        st(p + 3 * (usize)N, SH(x1, y1, 8, 9, 10, 11, 12, 13, 14, 15, 24, 25, 26, 27, 28, 29, 30, 31));
      }
    }
  }
  for (; i < N; i++) for (int b = 0; b < w; b++) dst[(usize)b * N + i] = src[(usize)i * w + b];
  for (int t = N * w; t < len; t++) dst[t] = src[t];
}

EXPORT void unshuffle(const u8 *src, int len, int w, u8 *dst) {
  int N = len / w, i = 0;
  if (w == 4) {
    const u8 *p0 = src, *p1 = src + N, *p2 = p1 + N, *p3 = p2 + N;
    for (; i + 16 <= N; i += 16) {
      v128_t a = ld(p0 + i), b = ld(p1 + i), c = ld(p2 + i), d = ld(p3 + i);
      v128_t u0 = SH(a, b, 0, 16, 1, 17, 2, 18, 3, 19, 4, 20, 5, 21, 6, 22, 7, 23);
      v128_t u1 = SH(a, b, 8, 24, 9, 25, 10, 26, 11, 27, 12, 28, 13, 29, 14, 30, 15, 31);
      v128_t v0 = SH(c, d, 0, 16, 1, 17, 2, 18, 3, 19, 4, 20, 5, 21, 6, 22, 7, 23);
      v128_t v1 = SH(c, d, 8, 24, 9, 25, 10, 26, 11, 27, 12, 28, 13, 29, 14, 30, 15, 31);
      u8 *o = dst + 4 * i;
      st(o, SH(u0, v0, 0, 1, 16, 17, 2, 3, 18, 19, 4, 5, 20, 21, 6, 7, 22, 23));
      st(o + 16, SH(u0, v0, 8, 9, 24, 25, 10, 11, 26, 27, 12, 13, 28, 29, 14, 15, 30, 31));
      st(o + 32, SH(u1, v1, 0, 1, 16, 17, 2, 3, 18, 19, 4, 5, 20, 21, 6, 7, 22, 23));
      st(o + 48, SH(u1, v1, 8, 9, 24, 25, 10, 11, 26, 27, 12, 13, 28, 29, 14, 15, 30, 31));
    }
  } else if ((w & 3) == 0) {
    int lanes = w >> 2;
    for (; i + 16 <= N; i += 16) {
      for (int L = 0; L < lanes; L++) {
        const u8 *p = src + (usize)(4 * L) * N + i;
        v128_t a = ld(p), b = ld(p + N), c = ld(p + 2 * (usize)N), d = ld(p + 3 * (usize)N);
        v128_t u0 = SH(a, b, 0, 16, 1, 17, 2, 18, 3, 19, 4, 20, 5, 21, 6, 22, 7, 23);
        v128_t u1 = SH(a, b, 8, 24, 9, 25, 10, 26, 11, 27, 12, 28, 13, 29, 14, 30, 15, 31);
        v128_t v0 = SH(c, d, 0, 16, 1, 17, 2, 18, 3, 19, 4, 20, 5, 21, 6, 22, 7, 23);
        v128_t v1 = SH(c, d, 8, 24, 9, 25, 10, 26, 11, 27, 12, 28, 13, 29, 14, 30, 15, 31);
        v128_t e[4];
        e[0] = SH(u0, v0, 0, 1, 16, 17, 2, 3, 18, 19, 4, 5, 20, 21, 6, 7, 22, 23);
        e[1] = SH(u0, v0, 8, 9, 24, 25, 10, 11, 26, 27, 12, 13, 28, 29, 14, 15, 30, 31);
        e[2] = SH(u1, v1, 0, 1, 16, 17, 2, 3, 18, 19, 4, 5, 20, 21, 6, 7, 22, 23);
        e[3] = SH(u1, v1, 8, 9, 24, 25, 10, 11, 26, 27, 12, 13, 28, 29, 14, 15, 30, 31);
        u8 *o = dst + (usize)i * w + 4 * L;
        for (int k = 0; k < 4; k++) {
          u32 q0 = wasm_u32x4_extract_lane(e[k], 0), q1 = wasm_u32x4_extract_lane(e[k], 1), q2 = wasm_u32x4_extract_lane(e[k], 2), q3 = wasm_u32x4_extract_lane(e[k], 3);
          __builtin_memcpy(o + (usize)(4 * k) * w, &q0, 4);
          __builtin_memcpy(o + (usize)(4 * k + 1) * w, &q1, 4);
          __builtin_memcpy(o + (usize)(4 * k + 2) * w, &q2, 4);
          __builtin_memcpy(o + (usize)(4 * k + 3) * w, &q3, 4);
        }
      }
    }
  }
  for (; i < N; i++) for (int b = 0; b < w; b++) dst[(usize)i * w + b] = src[(usize)b * N + i];
  for (int t = N * w; t < len; t++) dst[t] = src[t];
}

/* ---------------------------------------------------------------- per-plane delta (mask bit b set = plane b is delta coded) */
EXPORT void delta_planes(u8 *buf, int len, int w, const u8 *mask) {
  int N = len / w;
  for (int b = 0; b < w; b++) if ((mask[b >> 3] >> (b & 7)) & 1) {
    u8 *p = buf + (usize)b * N;
    for (int i = N - 1; i > 0; i--) p[i] = (u8)(p[i] - p[i - 1]);
  }
}
EXPORT void undelta_planes(u8 *buf, int len, int w, const u8 *mask) {
  int N = len / w;
  for (int b = 0; b < w; b++) if ((mask[b >> 3] >> (b & 7)) & 1) {
    u8 *p = buf + (usize)b * N;
    u8 acc = p[0];
    for (int i = 1; i < N; i++) { acc = (u8)(acc + p[i]); p[i] = acc; }
  }
}

/* ---------------------------------------------------------------- inflate (raw deflate), exact output size
 * src must be followed by at least 32 zero bytes. Returns the number of input bytes used, or a negative number:
 * -1 cut off, -2 bad block, -3 bad code, -4 bad distance, -5 result is not dn bytes long. */
static const unsigned short LBASE[29] = {3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258};
static const u8 LEXT[29] = {0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0};
static const unsigned short DBASE[30] = {1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577};
static const u8 DEXT[30] = {0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13};
static const u8 CLORDER[19] = {16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15};
#define LROOT 10
#define DROOT 8
#define BADE 0x100u
static u32 LT[1 << 15], DT[1 << 14], FLT[1 << 15], FDT[1 << 14], CLT[128];
static int fixed_ready = 0;
static unsigned short cnt[16], nxt[17], order_[320];
static u8 gMax[1 << 10]; static int gBase[1 << 10];
static u8 lens_[320], cllens_[19];

static u32 rev_(u32 code, int len) { u32 r = 0; while (len--) { r = (r << 1) | (code & 1); code >>= 1; } return r; }
static u32 mk(int kind, int sym) {
  if (kind == 2) return (u32)sym << 4;
  if (kind == 0) {
    if (sym < 256) return (u32)sym << 10;
    if (sym == 256) return 0x200;
    if (sym > 285) return BADE;
    return 0x100u | ((u32)LEXT[sym - 257] << 4) | ((u32)LBASE[sym - 257] << 10);
  }
  return sym > 29 ? BADE : 0x100u | ((u32)DEXT[sym] << 4) | ((u32)DBASE[sym] << 10);
}
static int build_table(const u8 *cl, int n, int root, u32 *tab, int kind, int allow_incomplete) {
  int i, len, left = 1, total = 0, maxLen = 0, k = 0, rsize = 1 << root;
  u32 code = 0;
  for (i = 0; i < 16; i++) cnt[i] = 0;
  for (i = 0; i < n; i++) cnt[cl[i]]++;
  cnt[0] = 0;
  for (len = 1; len <= 15; len++) { left = (left << 1) - cnt[len]; if (left < 0) return 0; if (cnt[len]) maxLen = len; total += cnt[len]; }
  if (left > 0 && !(allow_incomplete && total <= 1)) return 0;
  nxt[1] = 0; for (len = 1; len < 15; len++) nxt[len + 1] = nxt[len] + cnt[len];
  for (i = 0; i < n; i++) { len = cl[i]; if (len) order_[nxt[len]++] = (unsigned short)i; }
  for (i = 0; i < rsize; i++) tab[i] = BADE;
  if (maxLen > root) {
    for (i = 0; i < rsize; i++) gMax[i] = 0;
    code = 0;
    for (len = 1; len <= maxLen; len++) {
      for (i = cnt[len]; i > 0; i--) { if (len > root) { u32 pfx = rev_(code >> (len - root), root); if (len > gMax[pfx]) gMax[pfx] = (u8)len; } code++; }
      code <<= 1;
    }
    int next = rsize;
    for (int pfx = 0; pfx < rsize; pfx++) if (gMax[pfx]) {
      int sb = gMax[pfx] - root; gBase[pfx] = next;
      tab[pfx] = 0x300u | ((u32)next << 10) | ((u32)sb << 4) | (u32)root;
      for (int idx = 0; idx < (1 << sb); idx++) tab[next + idx] = BADE;
      next += 1 << sb;
    }
  }
  code = 0; k = 0;
  for (len = 1; len <= maxLen; len++) {
    for (i = cnt[len]; i > 0; i--) {
      int sym = order_[k++]; u32 r = rev_(code, len), e = mk(kind, sym) | (u32)len;
      if (len <= root) { for (u32 idx = r; idx < (u32)rsize; idx += 1u << len) tab[idx] = e; }
      else {
        u32 pfx = r & (u32)(rsize - 1); int base = gBase[pfx], sb = gMax[pfx] - root;
        for (u32 idx = r >> root; idx < (1u << sb); idx += 1u << (len - root)) tab[base + idx] = e;
      }
      code++;
    }
    code <<= 1;
  }
  return 1;
}
static void fixed_tables(void) {
  if (fixed_ready) return;
  u8 l[288], d[32]; int i;
  for (i = 0; i < 144; i++) l[i] = 8; for (; i < 256; i++) l[i] = 9; for (; i < 280; i++) l[i] = 7; for (; i < 288; i++) l[i] = 8;
  for (i = 0; i < 32; i++) d[i] = 5;
  build_table(l, 288, LROOT, FLT, 0, 0); build_table(d, 32, DROOT, FDT, 1, 1);
  fixed_ready = 1;
}

EXPORT int inflate_raw(const u8 *src, int n, u8 *dst, int dn) {
  const u8 *ip = src; u8 *op = dst, *oend = dst + dn;
  const u8 *nend = src + n + 16;
  u64 bb = 0; int bn = 0, fin;
#define REFILL() do { bb |= ld64(ip) << bn; ip += (63 - bn) >> 3; bn |= 56; } while (0)
  do {
    REFILL();
    fin = (int)(bb & 1); int type = (int)((bb >> 1) & 3); bb >>= 3; bn -= 3;
    if (type == 0) {
      int drop = bn & 7; bb >>= drop; bn -= drop;
      ip -= bn >> 3; bb = 0; bn = 0;
      if (ip + 4 > src + n) return -1;
      u32 len = ip[0] | (ip[1] << 8), nl = ip[2] | (ip[3] << 8); ip += 4;
      if ((len ^ 0xFFFFu) != nl) return -2;
      if (ip + len > src + n) return -1;
      if (len > (u32)(oend - op)) return -5;
      for (u32 i = 0; i < len; i++) op[i] = ip[i];
      ip += len; op += len;
      continue;
    }
    if (type == 3) return -2;
    const u32 *lt, *dt;
    if (type == 1) { fixed_tables(); lt = FLT; dt = FDT; }
    else {
      REFILL();
      int hlit = (int)(bb & 31) + 257, hdist = (int)((bb >> 5) & 31) + 1, hclen = (int)((bb >> 10) & 15) + 4; bb >>= 14; bn -= 14;
      if (hlit > 286 || hdist > 30) return -2;
      for (int i = 0; i < 19; i++) cllens_[i] = 0;
      for (int i = 0; i < hclen; i++) { if (bn < 3) REFILL(); cllens_[CLORDER[i]] = (u8)(bb & 7); bb >>= 3; bn -= 3; }
      if (!build_table(cllens_, 19, 7, CLT, 2, 0)) return -2;
      int nl = hlit + hdist, i = 0, prevLen = 0;
      while (i < nl) {
        if (bn < 14) REFILL();
        u32 e = CLT[bb & 127]; int k = (int)(e & 15); if (!k) return -2;
        bb >>= k; bn -= k; int c = (int)(e >> 4), rep;
        if (c < 16) { lens_[i++] = (u8)(prevLen = c); continue; }
        if (c == 16) { if (i == 0) return -2; rep = 3 + (int)(bb & 3); bb >>= 2; bn -= 2; c = prevLen; }
        else if (c == 17) { rep = 3 + (int)(bb & 7); bb >>= 3; bn -= 3; c = 0; prevLen = 0; }
        else { rep = 11 + (int)(bb & 127); bb >>= 7; bn -= 7; c = 0; prevLen = 0; }
        if (i + rep > nl) return -2;
        while (rep--) lens_[i++] = (u8)c;
      }
      if (lens_[256] == 0) return -2;
      if (!build_table(lens_, hlit, LROOT, LT, 0, 0)) return -2;
      if (!build_table(lens_ + hlit, hdist, DROOT, DT, 1, 1)) return -2;
      lt = LT; dt = DT;
    }
    for (;;) {
      if (bn < 32) REFILL();
      if (ip > nend) return -1;
      u32 e = lt[bb & ((1u << LROOT) - 1)];
      if ((e & 0x300) == 0x300) e = lt[(e >> 10) + ((bb >> LROOT) & ((1u << ((e >> 4) & 15)) - 1))];
      int k = (int)(e & 15); bb >>= k; bn -= k;
      if ((e & 0x300) == 0) {
        if (op >= oend) return -5;
        *op++ = (u8)(e >> 10);
        continue;
      }
      if (e & 0x200) break;
      int x = (int)((e >> 4) & 15);
      u32 len = (e >> 10) + (u32)(bb & ((1u << x) - 1)); bb >>= x; bn -= x;
      if (len < 3) return -3;
      if (bn < 32) REFILL();
      u32 d = dt[bb & ((1u << DROOT) - 1)];
      if ((d & 0x300) == 0x300) d = dt[(d >> 10) + ((bb >> DROOT) & ((1u << ((d >> 4) & 15)) - 1))];
      k = (int)(d & 15); bb >>= k; bn -= k;
      x = (int)((d >> 4) & 15);
      u32 dist = (d >> 10) + (u32)(bb & ((1u << x) - 1)); bb >>= x; bn -= x;
      if (dist == 0 || dist > (u32)(op - dst)) return -4;
      if (len > (u32)(oend - op)) return -5;
      const u8 *m = op - dist;
      if (dist >= 16 && (usize)(oend - op) >= len + 16) { u8 *dd = op, *ee = op + len; do { st(dd, ld(m)); dd += 16; m += 16; } while (dd < ee); }
      else if (dist == 1) { __builtin_memset(op, m[0], len); }
      else { for (u32 i = 0; i < len; i++) op[i] = m[i]; }
      op += len;
    }
    if (ip - (bn >> 3) > src + n) return -1;
  } while (!fin);
  ip -= bn >> 3;
  if (ip > src + n) return -1;
  if (op != oend) return -5;
  return (int)(ip - src);
}

/* ---------------------------------------------------------------- deflate: turn bytes into match/literal tokens
 * The same search the JavaScript deflate does, step for step, so both give the same tokens. A token is a literal byte (0..255) or,
 * for a match, a negative number: (1 << 31) | ((distance - 1) << 8) | (length - 3). The caller counts and writes the bits. */
static int dh[1 << 15];
static unsigned short dpv[32768];
static u32 dlf[286], ddf[30];
static int dcov, dextra, dhas, dprevLen, dprevDist, dskip, dip, dmiss, dready = 0;
static u8 LSYMt[259], DSYMLOt[512];
static void df_tables(void) {
  if (dready) return;
  for (int i = 0; i < 29; i++) for (int j = LBASE[i]; j < (i < 28 ? LBASE[i + 1] : 259); j++) LSYMt[j] = (u8)i;
  LSYMt[258] = 28;
  for (int i = 0; i < 30; i++) for (int j = DBASE[i]; j < (i < 29 ? DBASE[i + 1] : 32769); j++) { int di = j <= 256 ? j - 1 : 256 + ((j - 1) >> 7); if (di < 512) DSYMLOt[di] = (u8)i; }
  dready = 1;
}
static inline int dsym(int d) { return d <= 256 ? DSYMLOt[d - 1] : DSYMLOt[256 + ((d - 1) >> 7)]; }
EXPORT u32 *df_lf(void) { return dlf; }
EXPORT u32 *df_df(void) { return ddf; }
EXPORT int df_cov(void) { return dcov; }
EXPORT int df_extra(void) { return dextra; }
EXPORT void df_init(int hbits) {
  df_tables();
  for (int i = 0; i < (1 << hbits); i++) dh[i] = -1;
  for (int i = 0; i < 32768; i++) dpv[i] = 0;
  dip = 0; dcov = 0; dhas = 0; dprevLen = 0; dprevDist = 0; dskip = 0; dmiss = 0;
}
#define TOKMATCH(dist, len) ((int)0x80000000u | (((dist) - 1) << 8) | ((len) - 3))
/* Runs until `limit` tokens are made (checked between steps) or the input ends. Returns the number of tokens; df_cov() is how many
 * input bytes they cover. Counts for the block are left in df_lf(), df_df() and df_extra(). */
EXPORT int df_run(const u8 *src, int n, int level, int *toks, int limit, int hbits) {
  int nt = 0, ip = dip, shift = 32 - hbits, lim = n - 3;
  for (int i = 0; i < 286; i++) dlf[i] = 0;
  for (int i = 0; i < 30; i++) ddf[i] = 0;
  dextra = 0;
  if (level <= 2) {
    int skip = dskip;
    while (ip < lim - 1 && nt < limit) {
      u32 v = ld32(src + ip);
      u32 h = (v * 2654435761u) >> shift;
      int cand = dh[h]; dh[h] = ip;
      if (cand >= 0 && ip - cand <= 32768 && ld32(src + cand) == v) {
        const u8 *a = src + ip + 4, *b = src + cand + 4;
        int maxLen = n - ip; if (maxLen > 258) maxLen = 258;
        const u8 *e = src + ip + maxLen;
        while (a + 8 <= e) { u64 x = ld64(a) ^ ld64(b); if (x) { a += __builtin_ctzll(x) >> 3; goto done1; } a += 8; b += 8; }
        while (a < e && *a == *b) { a++; b++; }
      done1:;
        int len = (int)(a - (src + ip)), dist = ip - cand, ls = LSYMt[len], ds = dsym(dist);
        toks[nt++] = TOKMATCH(dist, len); dlf[257 + ls]++; ddf[ds]++; dextra += LEXT[ls] + DEXT[ds];
        if (len > 4 && ip + 2 < lim) { int k = ip + 2; dh[(ld32(src + k) * 2654435761u) >> shift] = k; }
        ip += len; skip = 0;
      } else {
        int step = 1 + (skip++ >> 5); if (step > 16) step = 16;
        while (step-- > 0 && ip < lim) { toks[nt++] = src[ip]; dlf[src[ip]]++; ip++; }
      }
      dcov = ip;
    }
    dskip = skip; dip = ip;
    if (ip >= lim - 1 || ip >= n) { /* tail: the last bytes are literals */
      while (dcov < n && nt < limit + 400) { toks[nt++] = src[dcov]; dlf[src[dcov]]++; dcov++; }
      ip = dcov; dip = ip;
    }
    return nt;
  }
  int chainMax = level <= 3 ? 6 : level <= 5 ? 16 : level <= 7 ? 48 : 256, nice = level <= 3 ? 24 : level <= 5 ? 48 : level <= 7 ? 128 : 258;
  int lazy = level >= 4, hasPrev = dhas, prevLen = dprevLen, prevDist = dprevDist, miss = dmiss;
  while (ip < n) {
    if (nt >= limit && !hasPrev) break;
    if (miss > 32 && !hasPrev && (ip & 7) != 0 && ip < lim) { toks[nt++] = src[ip]; dlf[src[ip]]++; ip++; dcov = ip; continue; }
    int bestLen = 2, best = 0;
    if (ip < lim) {
      u32 h = ((ld32(src + ip) & 0xFFFFFFu) * 2654435761u) >> shift;
      int cand = dh[h]; dpv[ip & 32767] = (cand >= 0 && ip - cand < 32768) ? (unsigned short)(ip - cand) : 0; dh[h] = ip;
      int maxLen = n - ip; if (maxLen > 258) maxLen = 258;
      int tries = miss > 32 ? 1 : (hasPrev && prevLen >= 32) ? chainMax >> 2 : chainMax;
      if (hasPrev && prevLen >= nice) tries = 0;
      if (hasPrev) bestLen = prevLen;
      while (cand >= 0 && tries-- > 0) {
        int dist = ip - cand;
        if (dist > 32767) break;
        if (src[cand + bestLen] == src[ip + bestLen] && src[cand] == src[ip] && src[cand + 1] == src[ip + 1]) {
          const u8 *a = src + ip + 2, *b = src + cand + 2, *e = src + ip + maxLen;
          while (a + 8 <= e) { u64 x = ld64(a) ^ ld64(b); if (x) { a += __builtin_ctzll(x) >> 3; goto done2; } a += 8; b += 8; }
          while (a < e && *a == *b) { a++; b++; }
        done2:;
          int len = (int)(a - (src + ip));
          if (len > bestLen && (len > 3 || dist < 4096)) { bestLen = len; best = dist; if (len >= nice || len >= maxLen) break; }
        }
        int d = dpv[cand & 32767];
        if (!d) break;
        cand -= d;
      }
      if (hasPrev && best == 0) bestLen = 2;
      if (!hasPrev) { if (best != 0) miss = 0; else miss++; }
    }
    if (lazy) {
      if (hasPrev) {
        if (best != 0 && bestLen > prevLen) {
          toks[nt++] = src[ip - 1]; dlf[src[ip - 1]]++; dcov = ip;
          prevLen = bestLen; prevDist = best; ip++;
          continue;
        }
        int ls = LSYMt[prevLen], ds = dsym(prevDist);
        toks[nt++] = TOKMATCH(prevDist, prevLen); dlf[257 + ls]++; ddf[ds]++; dextra += LEXT[ls] + DEXT[ds];
        int endp = ip - 1 + prevLen; dcov = endp; ip++;
        while (ip < endp) { if (ip < lim) { u32 t3 = ((ld32(src + ip) & 0xFFFFFFu) * 2654435761u) >> shift; int pp = dh[t3]; dpv[ip & 32767] = (pp >= 0 && ip - pp < 32768) ? (unsigned short)(ip - pp) : 0; dh[t3] = ip; } ip++; }
        hasPrev = 0;
        continue;
      }
      if (best != 0) { hasPrev = 1; prevLen = bestLen; prevDist = best; ip++; continue; }
      toks[nt++] = src[ip]; dlf[src[ip]]++; ip++; dcov = ip;
    } else {
      if (best != 0) {
        int ls = LSYMt[bestLen], ds = dsym(best);
        toks[nt++] = TOKMATCH(best, bestLen); dlf[257 + ls]++; ddf[ds]++; dextra += LEXT[ls] + DEXT[ds];
        int endp = ip + bestLen; ip++;
        while (ip < endp) { if (ip < lim) { u32 t3 = ((ld32(src + ip) & 0xFFFFFFu) * 2654435761u) >> shift; int pp = dh[t3]; dpv[ip & 32767] = (pp >= 0 && ip - pp < 32768) ? (unsigned short)(ip - pp) : 0; dh[t3] = ip; } ip++; }
      } else { toks[nt++] = src[ip]; dlf[src[ip]]++; ip++; }
      dcov = ip;
    }
  }
  if (hasPrev && ip >= n) { int ls = LSYMt[prevLen], ds = dsym(prevDist); toks[nt++] = TOKMATCH(prevDist, prevLen); dlf[257 + ls]++; ddf[ds]++; dextra += LEXT[ls] + DEXT[ds]; dcov = ip - 1 + prevLen; hasPrev = 0; }
  while (ip >= n && dcov < n) { toks[nt++] = src[dcov]; dlf[src[dcov]]++; dcov++; }
  dip = ip; dhas = hasPrev; dprevLen = prevLen; dprevDist = prevDist; dmiss = miss;
  return nt;
}
