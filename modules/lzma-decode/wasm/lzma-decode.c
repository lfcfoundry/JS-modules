/* Copyright (c) 2026 LFC Foundry. MIT License. */
/* LZMA1 raw-stream decoder for WebAssembly: a line-for-line port of modules/lzma-decode/lzma-decode.js (same model, same checks).
   Supports lc+lp <= 4 (what lzma-pack uses: lc 4, lp 0, pb 0). Returns the number of bytes written, or -1 on bad or cut-short input. */
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
int lzma_decode(const u8 *src, u32 srclen, u8 *out, u32 outSize, u32 lc, u32 lp, u32 pb) {
  if (lc + lp > 4 || pb > 4) return -2;
  u16 *isMatch = P, *isRep = isMatch + 192, *isRepG0 = isRep + 12, *isRepG1 = isRepG0 + 12, *isRepG2 = isRepG1 + 12, *isRep0Long = isRepG2 + 12,
      *posSlot = isRep0Long + 192, *posSpecial = posSlot + 256, *align = posSpecial + 115, *lenCoder = align + 16, *repLenCoder = lenCoder + 514, *literal = repLenCoder + 514;
  u32 n = (u32)(literal + (0x300 << (lc + lp)) - P), i;
  for (i = 0; i < n; i++) P[i] = 1024;
  R r = { src, 0, srclen, 0, 0, 0 }; r.range = 0xFFFFFFFFu;
  for (i = 0; i < 4; i++) { r.code = (r.code << 8) | (r.ip < r.len ? r.src[r.ip] : 0); r.ip++; }
  u32 op = 0, state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0, pbMask = (1u << pb) - 1, lpMask = (1u << lp) - 1;
  while (op < outSize) {
    if (r.ip > r.len) return -1;
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
            if (rep0 >= op) return -1;
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
      if (rep0 == 0xFFFFFFFFu || rep0 >= op) return -1;
      for (len += 2; len--; op++) { if (op >= outSize) break; out[op] = out[op - rep0 - 1]; }
    }
  }
  return (r.ip > r.len || r.bad) ? -1 : (int)op;
}
