/* Copyright (c) 2026 LFC Foundry. MIT License.
 * Raw-deflate decoder for zip-open.js (every in-memory entry since 1.15.0). Its own WebAssembly module, compiled the first time an entry is opened, so pages that never need it do not pay for it at load.
 * Fast design (1.15.0): 64-bit bit buffer refilled 8 bytes at a time, one-lookup tables (11-bit literals/lengths, 8-bit distances, small second-level tables for long codes), matches copied 8 bytes at a time, and a fast loop with no end checks while input and output have room.
 * inflate(in, inlen, out, outcap) returns the number of bytes written, -1 for damaged data (also cut-off data) or -2 when more than outcap bytes would come out.
 * Build: wasm/build.sh, then wasm/embed.py. */
typedef unsigned char u8; typedef unsigned short u16; typedef unsigned int u32; typedef unsigned long long u64;
void *memset(void *d, int c, unsigned long n) __attribute__((optnone));
void *memset(void *d, int c, unsigned long n) { u8 *p = d; while (n--) *p++ = (u8)c; return d; }
void *memcpy(void *d, const void *s, unsigned long n) __attribute__((optnone));
void *memcpy(void *d, const void *s, unsigned long n) { u8 *p = d; const u8 *q = s; while (n--) *p++ = *q++; return d; }

/* table entry: [31:16] value, [15:13] kind, [12:8] extra bits (or second-level table bits), [7:0] code bits to drop */
#define K_LIT 1u
#define K_LEN 2u
#define K_SUB 3u
#define K_END 4u
#define ENT(v, k, x, l) (((u32)(v) << 16) | ((u32)(k) << 13) | ((u32)(x) << 8) | (u32)(l))
#define KIND(e) (((e) >> 13) & 7)
#define XB(e) (((e) >> 8) & 31)
#define CL(e) ((e) & 255)
#define VAL(e) ((e) >> 16)
#define LB 11
#define DB 8
static u32 LT[(1 << LB) + 288 * 16], DT[(1 << DB) + 32 * 128];
static const u16 LBASE[29] = {3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258};
static const u8 LEXT[29] = {0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0};
static const u16 DBASE[30] = {1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577};
static const u8 DEXT[30] = {0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13};
static const u8 CLORDER[19] = {16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15};

/* which: 0 = code lengths (7-bit table in DT's place is not needed: uses LT with plain symbols), 1 = literal/length, 2 = distance */
static int build(u32 *tab, int tb, const u8 *len, int n, int which) {
  u16 count[16], offs[16], sym[320]; int i, l, left = 1, max = 0; u32 code = 0, next = 1u << tb;
  for (i = 0; i < 16; i++) count[i] = 0;
  for (i = 0; i < n; i++) count[len[i]]++;
  count[0] = 0;
  for (i = 1; i < 16; i++) { left <<= 1; left -= count[i]; if (left < 0) return -1; if (count[i]) max = i; }
  if (left > 0 && (which == 0 || max != 1)) return -1;   /* an incomplete set is only allowed for one code of length 1 (as zlib does) */
  offs[1] = 0; for (i = 1; i < 15; i++) offs[i + 1] = offs[i] + count[i];
  for (i = 0; i < n; i++) if (len[i]) sym[offs[len[i]]++] = (u16)i;
  for (i = 0; i < (1 << tb); i++) tab[i] = 0;
  int sb = max > tb ? max - tb : 0, idx = 0;
  for (l = 1; l <= max; l++) {
    for (int k = 0; k < count[l]; k++) {
      u32 s = sym[idx++], r = 0, e; int b;
      for (b = 0; b < l; b++) if ((code >> b) & 1) r |= 1u << (l - 1 - b);
      if (which == 1) e = s < 256 ? ENT(s, K_LIT, 0, 0) : s == 256 ? ENT(0, K_END, 0, 0) : s < 286 ? ENT(LBASE[s - 257], K_LEN, LEXT[s - 257], 0) : 0;
      else if (which == 2) e = s < 30 ? ENT(DBASE[s], K_LEN, DEXT[s], 0) : 0;
      else e = ENT(s, K_LIT, 0, 0);
      if (l <= tb) { if (e) e |= (u32)l; for (u32 j = r; j < (1u << tb); j += 1u << l) tab[j] = e; }
      else {
        u32 p = r & ((1u << tb) - 1), q = r >> tb, sub;
        if (KIND(tab[p]) != K_SUB) { sub = next; next += 1u << sb; for (u32 j = 0; j < (1u << sb); j++) tab[sub + j] = 0; tab[p] = ENT(sub, K_SUB, sb, tb); }
        else sub = VAL(tab[p]);
        if (e) e |= (u32)(l - tb);
        for (u32 j = q; j < (1u << sb); j += 1u << (l - tb)) tab[sub + j] = e;
      }
      code++;
    }
    code <<= 1;
  }
  return 0;
}

static u32 FIXL, FIXD;   /* 1 when LT/DT hold the fixed tables */

int inflate(const u8 *in, u32 inlen, u8 *out, u32 outcap) {
  const u8 *ip = in, *iend = in + inlen; u64 bb = 0; u32 bc = 0, padded = 0, o = 0; int last;
  #define REFILL_SLOW() do { while (bc <= 56) { if (ip < iend) bb |= (u64)*ip++ << bc; else padded += 8; bc += 8; } } while (0)
  #define NEED(n) do { if (bc < (u32)(n)) REFILL_SLOW(); } while (0)
  #define TAKE(n) (bb & ((1ull << (n)) - 1))
  #define DROP(n) do { bb >>= (n); bc -= (n); } while (0)
  do {
    NEED(3); last = (int)TAKE(1); DROP(1); u32 type = (u32)TAKE(2); DROP(2);
    if (type == 0) {
      u32 len, nlen; int back = (int)(bc >> 3), realBack = back - (int)(padded >> 3);
      if (realBack < 0) return -1;
      ip -= realBack; bb = 0; bc = 0; padded = 0;
      if (iend - ip < 4) return -1;
      len = ip[0] | (ip[1] << 8); nlen = ip[2] | (ip[3] << 8); ip += 4;
      if ((len ^ 0xffff) != nlen) return -1;
      if ((u32)(iend - ip) < len) return -1;
      if (o + len > outcap) return -2;
      while (len--) out[o++] = *ip++;
      continue;
    }
    if (type == 1) {
      if (!FIXL) { u8 l[288]; int i; for (i = 0; i < 144; i++) l[i] = 8; for (; i < 256; i++) l[i] = 9; for (; i < 280; i++) l[i] = 7; for (; i < 288; i++) l[i] = 8; build(LT, LB, l, 288, 1);
        for (i = 0; i < 32; i++) l[i] = 5; build(DT, DB, l, 32, 2); FIXL = 1; }
    } else if (type == 2) {
      u8 lens[320], cl[320]; int nl, nd, nc, i, n = 0; FIXL = 0;
      NEED(14); nl = (int)TAKE(5) + 257; DROP(5); nd = (int)TAKE(5) + 1; DROP(5); nc = (int)TAKE(4) + 4; DROP(4);
      if (nl > 286 || nd > 30) return -1;
      for (i = 0; i < 19; i++) lens[i] = 0;
      for (i = 0; i < nc; i++) { NEED(3); lens[CLORDER[i]] = (u8)TAKE(3); DROP(3); }
      if (build(LT, 7, lens, 19, 0)) return -1;
      while (n < nl + nd) {
        NEED(16); u32 e = LT[TAKE(7)]; if (!e) return -1; DROP(CL(e)); int s = (int)VAL(e), rep, v = 0;
        if (s < 16) cl[n++] = (u8)s;
        else {
          if (s == 16) { if (n == 0) return -1; v = cl[n - 1]; rep = 3 + (int)TAKE(2); DROP(2); }
          else if (s == 17) { rep = 3 + (int)TAKE(3); DROP(3); } else { rep = 11 + (int)TAKE(7); DROP(7); }
          if (n + rep > nl + nd) return -1;
          while (rep--) cl[n++] = (u8)v;
        }
        if (padded > bc) return -1;
      }
      if (cl[256] == 0) return -1;
      if (build(LT, LB, cl, nl, 1)) return -1;
      if (build(DT, DB, cl + nl, nd, 2)) return -1;
    } else return -1;
    /* the codes of this block */
    for (;;) {
      u32 e, len, dist;
      if (iend - ip >= 8 && outcap - o >= 258 + 16 && !padded) {
        /* fast: refill 8 bytes at once, no end checks (each symbol needs at most 15 + 5 + 15 + 13 = 48 bits) */
        u64 w; __builtin_memcpy(&w, ip, 8); bb |= w << bc; ip += (63 - bc) >> 3; bc |= 56;
        e = LT[bb & ((1u << LB) - 1)];
        if (KIND(e) == K_SUB) { DROP(LB); e = LT[VAL(e) + (u32)TAKE(XB(e))]; }
        if (!e) return -1;
        DROP(CL(e));
        if (KIND(e) == K_LIT) {
          out[o++] = (u8)VAL(e);
          e = LT[bb & ((1u << LB) - 1)];   /* a second literal often follows: take it while the bits are here (at most 15 more) */
          if (KIND(e) == K_LIT) { DROP(CL(e)); out[o++] = (u8)VAL(e); }
          continue;
        }
        if (KIND(e) == K_END) break;
        len = VAL(e) + (u32)TAKE(XB(e)); DROP(XB(e));
        e = DT[bb & ((1u << DB) - 1)];
        if (KIND(e) == K_SUB) { DROP(DB); e = DT[VAL(e) + (u32)TAKE(XB(e))]; }
        if (!e) return -1;
        DROP(CL(e));
        dist = VAL(e) + (u32)TAKE(XB(e)); DROP(XB(e));
        if (dist > o) return -1;
        {
          u8 *d = out + o, *s = d - dist, *end = d + len; o += len;
          if (dist >= 8) { do { u64 v; __builtin_memcpy(&v, s, 8); __builtin_memcpy(d, &v, 8); d += 8; s += 8; } while (d < end); }
          else if (dist == 1) { u64 v = (u64)s[0] * 0x0101010101010101ull; do { __builtin_memcpy(d, &v, 8); d += 8; } while (d < end); }
          else { do { *d++ = *s++; } while (d < end); }
        }
        continue;
      }
      /* careful: near the end of the input or the output */
      NEED(15);
      e = LT[bb & ((1u << LB) - 1)];
      if (KIND(e) == K_SUB) { DROP(LB); e = LT[VAL(e) + (u32)TAKE(XB(e))]; }
      if (!e) return -1;
      DROP(CL(e));
      if (KIND(e) == K_LIT) { if (o >= outcap) return -2; out[o++] = (u8)VAL(e); if (padded > bc) return -1; continue; }
      if (KIND(e) == K_END) { if (padded > bc) return -1; break; }
      NEED(5); len = VAL(e) + (u32)TAKE(XB(e)); DROP(XB(e));
      NEED(15); e = DT[bb & ((1u << DB) - 1)];
      if (KIND(e) == K_SUB) { DROP(DB); e = DT[VAL(e) + (u32)TAKE(XB(e))]; }
      if (!e) return -1;
      DROP(CL(e));
      NEED(13); dist = VAL(e) + (u32)TAKE(XB(e)); DROP(XB(e));
      if (dist > o) return -1;
      if (o + len > outcap) return -2;
      { u32 from = o - dist; while (len--) out[o++] = out[from++]; }
      if (padded > bc) return -1;
    }
    if (padded > bc) return -1;
  } while (!last);
  return (int)o;
}
