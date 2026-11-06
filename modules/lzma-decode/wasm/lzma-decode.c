/* Copyright (c) 2026 LFC Foundry. MIT License. */
/* LZMA1 raw-stream decoder for WebAssembly: a line-for-line port of modules/lzma-decode/lzma-decode.js (same model, same checks).
   Supports lc+lp <= 4 (what lzma-pack uses: lc 4, lp 0, pb 0). lzma_decode returns the number of bytes written, or -1 on bad or cut-short input. */
typedef unsigned char u8; typedef unsigned short u16; typedef unsigned int u32;
#define AI static inline __attribute__((always_inline))
typedef struct { const u8 *src; u32 ip, len, range, code; int bad; } R;
static u16 P[12*16 + 12*3 + 12*16 + 4*64 + 115 + 16 + 514*2 + (0x300 << 4) + 12];
AI u32 bit(R *r, u16 *a) {
  u32 p = *a, bound = (r->range >> 11) * p, b;
  if (r->code < bound) { r->range = bound; *a = p + ((2048 - p) >> 5); b = 0; }
  else { r->range -= bound; r->code -= bound; *a = p - (p >> 5); b = 1; }
  if (r->range < 0x1000000) { r->range <<= 8; r->code = (r->code << 8) | (r->ip < r->len ? r->src[r->ip] : (r->bad = 1, 0)); r->ip++; }
  return b;
}
static __attribute__((noinline)) u32 tree(R *r, u16 *a, u32 bits) { u32 m = 1, c = bits; while (c--) m = (m << 1) | bit(r, a + m); return m - (1u << bits); }
static __attribute__((noinline)) u32 rtree(R *r, u16 *a, u32 bits) { u32 m = 1, v = 0, c, b; for (c = 0; c < bits; c++) { b = bit(r, a + m); m = (m << 1) | b; v |= b << c; } return v; }
static __attribute__((noinline)) u32 length(R *r, u16 *a, u32 ps) {
  if (!bit(r, a)) return tree(r, a + 2 + (ps << 3), 3);
  if (!bit(r, a + 1)) return 8 + tree(r, a + 130 + (ps << 3), 3);
  return 16 + tree(r, a + 258, 8);
}
u8 heap_base_marker;
/* Decoder state between calls. lzma_begin sets it up; lzma_more(upTo) decodes until at least upTo bytes are out and returns how many are out (-1 on bad
   or cut-short input). Short calls let the engine move run() to its optimized code between them; one long call stays on the first, slower code the whole time.
   lzma_decode does both in one call, as before. */
static R G; static u8 *gOut; static u32 gOutSize, gOp, gState, gRep0, gRep1, gRep2, gRep3, gPb, gLp, gLc; static int gErr;
int lzma_begin(const u8 *src, u32 srclen, u8 *out, u32 outSize, u32 lc, u32 lp, u32 pb) {
  if (lc + lp > 4 || pb > 4) return -2;
  u32 n = (u32)(P + 192 + 12 * 4 + 192 + 256 + 115 + 16 + 514 * 2 + (0x300 << (lc + lp)) - P), i;
  for (i = 0; i < n; i++) P[i] = 1024;
  R r = { src, 0, srclen, 0, 0, 0 }; r.range = 0xFFFFFFFFu;
  for (i = 0; i < 4; i++) { r.code = (r.code << 8) | (r.ip < r.len ? r.src[r.ip] : 0); r.ip++; }
  G = r; gOut = out; gOutSize = outSize; gOp = 0; gState = 0; gRep0 = gRep1 = gRep2 = gRep3 = 0; gPb = (1u << pb) - 1; gLp = (1u << lp) - 1; gLc = lc; gErr = 0;
  return 0;
}
static __attribute__((noinline)) int run(u32 upTo) {
  u16 *isMatch = P, *isRep = isMatch + 192, *isRepG0 = isRep + 12, *isRepG1 = isRepG0 + 12, *isRepG2 = isRepG1 + 12, *isRep0Long = isRepG2 + 12,
      *posSlot = isRep0Long + 192, *posSpecial = posSlot + 256, *align = posSpecial + 115, *lenCoder = align + 16, *repLenCoder = lenCoder + 514, *literal = repLenCoder + 514;
  R r = G; u8 *out = gOut; u32 outSize = gOutSize, lc = gLc;
  u32 op = gOp, state = gState, rep0 = gRep0, rep1 = gRep1, rep2 = gRep2, rep3 = gRep3, pbMask = gPb, lpMask = gLp;
  if (upTo > outSize) upTo = outSize;
#define return_bad { gErr = 1; return -1; }     /* bad input: remembered, so later calls fail too */
  while (op < upTo) {
    if (r.ip > r.len) return_bad
    u32 ps = op & pbMask;
    if (!bit(&r, isMatch + (state << 4) + ps)) {
      u32 prev = op ? out[op - 1] : 0, base = 0x300 * (((op & lpMask) << lc) + (prev >> (8 - lc))), sym = 1;
      u16 *lit = literal + base;
      if (state >= 7) {
        u32 mb = out[op - rep0 - 1], mbit, b;
        do { mbit = (mb >> 7) & 1; mb <<= 1; b = bit(&r, lit + ((1 + mbit) << 8) + sym); sym = (sym << 1) | b; if (mbit != b) break; } while (sym < 256);
      }
      while (sym < 256) sym = (sym << 1) | bit(&r, lit + sym);
      out[op++] = (u8)sym;
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
    } else {
      u32 len, dist;
      if (bit(&r, isRep + state)) {
        if (!bit(&r, isRepG0 + state)) {
          if (!bit(&r, isRep0Long + (state << 4) + ps)) {
            if (rep0 >= op) return_bad
            state = state < 7 ? 9 : 11; out[op] = out[op - rep0 - 1]; op++; continue;
          }
        } else {
          if (!bit(&r, isRepG1 + state)) dist = rep1;
          else { if (!bit(&r, isRepG2 + state)) dist = rep2; else { dist = rep3; rep3 = rep2; } rep2 = rep1; }
          rep1 = rep0; rep0 = dist;
        }
        len = length(&r, repLenCoder, ps); state = state < 7 ? 8 : 11;
      } else {
        rep3 = rep2; rep2 = rep1; rep1 = rep0;
        len = length(&r, lenCoder, ps); state = state < 7 ? 7 : 10;
        u32 slot = tree(&r, posSlot + ((len < 4 ? len : 3) << 6), 6);
        if (slot < 4) rep0 = slot;
        else {
          u32 nb = (slot >> 1) - 1; dist = (2 | (slot & 1)) << nb;
          if (slot < 14) dist += rtree(&r, posSpecial + dist - slot, nb);
          else {
            u32 x = 0, k = nb - 4, b;
            while (k--) { r.range >>= 1; b = r.code >= r.range ? 1 : 0; if (b) r.code -= r.range;
              if (r.range < 0x1000000) { r.range <<= 8; r.code = (r.code << 8) | (r.ip < r.len ? r.src[r.ip] : (r.bad = 1, 0)); r.ip++; }
              x = (x << 1) | b; }
            dist += (x << 4) + rtree(&r, align, 4);
          }
          rep0 = dist;
        }
      }
      if (rep0 == 0xFFFFFFFFu || rep0 >= op) return_bad
      for (len += 2; len--; op++) { if (op >= outSize) break; out[op] = out[op - rep0 - 1]; }
    }
  }
  G = r; gOp = op; gState = state; gRep0 = rep0; gRep1 = rep1; gRep2 = rep2; gRep3 = rep3;
  return 0;
}
int lzma_more(u32 upTo) {
  if (gErr || run(upTo)) return -1;
  if (gOp >= gOutSize && (G.ip > G.len || G.bad)) { gErr = 1; return -1; }
  return (int)gOp;
}
int lzma_decode(const u8 *src, u32 srclen, u8 *out, u32 outSize, u32 lc, u32 lp, u32 pb) {
  int b = lzma_begin(src, srclen, out, outSize, lc, lp, pb);
  return b ? b : lzma_more(outSize);
}
