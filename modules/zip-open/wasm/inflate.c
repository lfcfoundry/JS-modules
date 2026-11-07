/* Copyright (c) 2026 LFC Foundry. MIT License.
 * Raw-deflate decoder for zip-open.js (every in-memory entry since 1.15.0). Its own WebAssembly module, compiled the first time an entry is opened, so pages that never need it do not pay for it at load.
 * Fast design (1.15.0): 64-bit bit buffer refilled 8 bytes at a time, one-lookup tables (11-bit literals/lengths, 8-bit distances, small second-level tables for long codes), matches copied 8 bytes at a time, and a fast loop with no end checks while input and output have room.
 * inflate(in, inlen, out, outcap) returns the number of bytes written, -1 for damaged data (also cut-off data) or -2 when more than outcap bytes would come out.
 * Build: wasm/build.sh, then wasm/embed.py. */
typedef unsigned char u8; typedef unsigned short u16; typedef unsigned int u32; typedef unsigned long long u64;
#ifndef NO_MEMFNS   /* defined when linked into xlsx.wasm, which has its own */
void *memset(void *d, int c, unsigned long n) __attribute__((optnone));
void *memset(void *d, int c, unsigned long n) { u8 *p = d; while (n--) *p++ = (u8)c; return d; }
void *memcpy(void *d, const void *s, unsigned long n) __attribute__((optnone));
void *memcpy(void *d, const void *s, unsigned long n) { u8 *p = d; const u8 *q = s; while (n--) *p++ = *q++; return d; }
#endif

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

static __attribute__((address_space(1))) u32 FIXL, FIXD;   /* 1 when LT/DT hold the fixed tables */

/* CRC-32 of the output, worked out on each 32 KB while it is still in the cache (since 1.16.0): slicing by 16, the same tables as crc32.c. crc() after inflate() gives the checksum of everything written. */
static u32 CT[16][256]; static __attribute__((address_space(1))) u32 ctReady, CRC;
static void crcInit(void) {
  u32 i, c, k;
  for (i = 0; i < 256; i++) { c = i; for (k = 0; k < 8; k++) c = (c & 1) ? (c >> 1) ^ 0xedb88320u : c >> 1; CT[0][i] = c; }
  for (i = 0; i < 256; i++) { c = CT[0][i]; for (k = 1; k < 16; k++) { c = CT[0][c & 255] ^ (c >> 8); CT[k][i] = c; } }
  ctReady = 1;
}
static u32 crcRun(const u8 *p, u32 n, u32 s) {
  while (n >= 16) {
    u32 a, b, c, d; __builtin_memcpy(&a, p, 4); __builtin_memcpy(&b, p + 4, 4); __builtin_memcpy(&c, p + 8, 4); __builtin_memcpy(&d, p + 12, 4); a ^= s;
    s = CT[15][a & 255] ^ CT[14][(a >> 8) & 255] ^ CT[13][(a >> 16) & 255] ^ CT[12][a >> 24] ^ CT[11][b & 255] ^ CT[10][(b >> 8) & 255] ^ CT[9][(b >> 16) & 255] ^ CT[8][b >> 24]
      ^ CT[7][c & 255] ^ CT[6][(c >> 8) & 255] ^ CT[5][(c >> 16) & 255] ^ CT[4][c >> 24] ^ CT[3][d & 255] ^ CT[2][(d >> 8) & 255] ^ CT[1][(d >> 16) & 255] ^ CT[0][d >> 24];
    p += 16; n -= 16;
  }
  while (n--) s = CT[0][(s ^ *p++) & 255] ^ (s >> 8);
  return s;
}
u32 crc(void) { return CRC; }
/* a running checksum over pieces handed in (start with s = 0xffffffff, finish with ~s), for a thread that checks what another unpacked */
u32 crcAdd(const u8 *p, u32 n, u32 s) { if (!ctReady) crcInit(); return crcRun(p, n, s); }
static u32 NOCRC;   /* 1: inflateStep() skips the checksum (another thread does it) */
void inflateCrc(u32 on) { NOCRC = !on; }

/* The codes of one block. A function of its own, called once per block, so that a browser that first runs the
   quick-to-compile version of this code (Chromium and Firefox do) switches to the optimized one at the next block,
   not only at the next entry: browsers swap in optimized code only when a function is called again. */
typedef struct { const u8 *ip, *iend; u64 bb; u32 bc, padded, o, cp, cs; } St;
__attribute__((noinline)) static int codes(St *st, u8 *out, u32 outcap) {
  const u8 *ip = st->ip, *iend = st->iend; u64 bb = st->bb; u32 bc = st->bc, padded = st->padded, o = st->o, cp = st->cp, cs = st->cs;
  #define CRC_STEP() do { if (o - cp >= 32768) { if (!NOCRC) cs = crcRun(out + cp, o - cp, cs); cp = o; } } while (0)
  #define REFILL_SLOW() do { while (bc <= 56) { if (ip < iend) bb |= (u64)*ip++ << bc; else padded += 8; bc += 8; } } while (0)
  #define NEED(n) do { if (bc < (u32)(n)) REFILL_SLOW(); } while (0)
  #define TAKE(n) (bb & ((1ull << (n)) - 1))
  #define DROP(n) do { bb >>= (n); bc -= (n); } while (0)
  for (;;) {
    u32 e, len, dist;
    CRC_STEP();
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
  st->ip = ip; st->bb = bb; st->bc = bc; st->padded = padded; st->o = o; st->cp = cp; st->cs = cs;
  return 0;
  #undef CRC_STEP
  #undef REFILL_SLOW
  #undef NEED
  #undef TAKE
  #undef DROP
}

/* Unpacking a piece at a time: inflateBegin() then inflateStep(target) until inflateDone(), so another thread can
   hand the pieces to the reader while it unpacks the next ones. inflate() does it in one go. */
static struct { const u8 *ip, *iend, *in0; u64 bb; u32 bc, padded, o, cp, cs, done, stop; u8 *out; u32 outcap; } IS;
void inflateBegin(const u8 *in, u32 inlen, u8 *out, u32 outcap) {
  if (!ctReady) crcInit();
  IS.in0 = in; IS.stop = 0; IS.ip = in; IS.iend = in + inlen; IS.bb = 0; IS.bc = 0; IS.padded = 0; IS.o = 0; IS.cp = 0; IS.cs = 0xffffffffu; IS.done = 0; IS.out = out; IS.outcap = outcap;
}
u32 inflateDone(void) { return IS.done; }
/* two threads on one stream: this one stops at the block that starts at bit `stop` (another thread unpacks from there) */
void inflateStopAt(u32 stop) { IS.stop = stop; }
u32 inflateBits(void) { return (u32)(IS.ip - IS.in0) * 8 + IS.padded - IS.bc; }   /* bits read so far */
u32 inflateState(void) { if (!NOCRC && IS.o > IS.cp) { IS.cs = crcRun(IS.out + IS.cp, IS.o - IS.cp, IS.cs); IS.cp = IS.o; } return IS.cs; }   /* the running checksum of all bytes out (before its final flip) */
/* unpacks whole blocks until at least target bytes are out (or the end): the bytes out so far, or -1 damaged, -2 more than outcap */
int inflateStep(u32 target) {
  const u8 *ip = IS.ip, *iend = IS.iend; u64 bb = IS.bb; u32 bc = IS.bc, padded = IS.padded, o = IS.o, cp = IS.cp, cs = IS.cs; u8 *out = IS.out; u32 outcap = IS.outcap; int last = 0;
  if (IS.done) return (int)o;
  #define CRC_STEP() do { if (o - cp >= 32768) { if (!NOCRC) cs = crcRun(out + cp, o - cp, cs); cp = o; } } while (0)
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
    { St st = { ip, iend, bb, bc, padded, o, cp, cs }; int r = codes(&st, out, outcap); if (r) return r;
      ip = st.ip; bb = st.bb; bc = st.bc; padded = st.padded; o = st.o; cp = st.cp; cs = st.cs; }
    if (padded > bc) return -1;
    CRC_STEP();
  } while (!last && o < target && (!IS.stop || (u32)(ip - IS.in0) * 8 + padded - bc < IS.stop));
  IS.ip = ip; IS.bb = bb; IS.bc = bc; IS.padded = padded; IS.o = o; IS.cp = cp; IS.cs = cs;
  if (last) { IS.done = 1; CRC = NOCRC ? 0 : ~crcRun(out + cp, o - cp, cs); }
  return (int)o;
}
/* keeps only the last keep bytes (the window later matches can reach) at the start of out, so a thread that hands
   each piece on can unpack a big part in a small room: the bytes dropped, or 0 when there is too little to drop */
u32 inflateSlide(u32 keep) {
  u32 o = IS.o, d;
  if (IS.done || o < keep * 2) return 0;
  if (!NOCRC) IS.cs = crcRun(IS.out + IS.cp, o - IS.cp, IS.cs);
  d = o - keep; __builtin_memcpy(IS.out, IS.out + d, keep);
  IS.o = keep; IS.cp = keep;
  return d;
}
/* Two threads on one stream (the idea of pugz: Kerbiriou and Chikhi, 2019). A second thread finds a block start
   near a chosen place (a dynamic header, then 2,000 codes that decode cleanly with the earlier 32 KB unknown), and
   reads the codes from there on into a list (letters and copies) without knowing those bytes. When the first thread
   has stopped exactly at that block (checked), the list is replayed on top of the last 32 KB it put out. Any doubt:
   the first thread just goes on, so the bytes are always the ones one thread would have made. */
typedef unsigned short u16t;
/* a bit reader from any bit position */
typedef struct { const u8 *ip, *iend; u64 bb; u32 bc, padded; } BR;
static void brAt(BR *b, const u8 *in, u32 inlen, u64 bit) { b->ip = in + (bit >> 3); b->iend = in + inlen; b->bb = 0; b->bc = 0; b->padded = 0;
  while (b->bc <= 56) { if (b->ip < b->iend) b->bb |= (u64)*b->ip++ << b->bc; else b->padded += 8; b->bc += 8; }
  b->bb >>= (bit & 7); b->bc -= (u32)(bit & 7); }
#define BNEED(b, n) do { if ((b)->bc < (u32)(n)) { while ((b)->bc <= 56) { if ((b)->ip < (b)->iend) (b)->bb |= (u64)*(b)->ip++ << (b)->bc; else (b)->padded += 8; (b)->bc += 8; } } } while (0)
#define BTAKE(b, n) ((b)->bb & ((1ull << (n)) - 1))
#define BDROP(b, n) do { (b)->bb >>= (n); (b)->bc -= (n); } while (0)
/* reads a dynamic block header into LT/DT; 0 ok. Only dynamic, non-final blocks are taken as a starting point. */
static int dynHeader(BR *b, int needNotLast) {
  u8 lens[320], cl[320]; int nl, nd, nc, i, n = 0;
  BNEED(b, 17); int last = (int)BTAKE(b, 1); BDROP(b, 1); u32 type = (u32)BTAKE(b, 2); BDROP(b, 2);
  if (type != 2 || (needNotLast && last)) return -1;
  nl = (int)BTAKE(b, 5) + 257; BDROP(b, 5); nd = (int)BTAKE(b, 5) + 1; BDROP(b, 5); nc = (int)BTAKE(b, 4) + 4; BDROP(b, 4);
  if (nl > 286 || nd > 30) return -1;
  for (i = 0; i < 19; i++) lens[i] = 0;
  for (i = 0; i < nc; i++) { BNEED(b, 3); lens[CLORDER[i]] = (u8)BTAKE(b, 3); BDROP(b, 3); }
  if (build(LT, 7, lens, 19, 0)) return -1;
  while (n < nl + nd) {
    BNEED(b, 16); u32 e = LT[BTAKE(b, 7)]; if (!e) return -1; BDROP(b, CL(e)); int s = (int)VAL(e), rep, v = 0;
    if (s < 16) cl[n++] = (u8)s;
    else { if (s == 16) { if (n == 0) return -1; v = cl[n - 1]; rep = 3 + (int)BTAKE(b, 2); BDROP(b, 2); }
      else if (s == 17) { rep = 3 + (int)BTAKE(b, 3); BDROP(b, 3); } else { rep = 11 + (int)BTAKE(b, 7); BDROP(b, 7); }
      if (n + rep > nl + nd) return -1; while (rep--) cl[n++] = (u8)v; }
    if (b->padded > b->bc) return -1;
  }
  if (cl[256] == 0) return -1;
  if (build(LT, LB, cl, nl, 1)) return -1;
  if (build(DT, DB, cl + nl, nd, 2)) return -1;
  FIXL = 0; return 0;
}
/* the codes of one block into u16 out (values >= 256 stand for unknown bytes of the window); returns 0 at the block end, -1 damaged, -2 room */
static int codes16(BR *b, u16t *out, u32 *po, u32 cap, u32 maxSyms) {
  u32 o = *po, e, len, dist, syms = 0;
  for (;;) {
    if (maxSyms && ++syms > maxSyms) { *po = o; return 1; }
    BNEED(b, 48);
    e = LT[b->bb & ((1u << LB) - 1)];
    if (KIND(e) == K_SUB) { BDROP(b, LB); e = LT[VAL(e) + (u32)BTAKE(b, XB(e))]; }
    if (!e) return -1;
    BDROP(b, CL(e));
    if (KIND(e) == K_LIT) { if (o >= cap) return -2; out[o++] = (u16t)VAL(e); continue; }
    if (KIND(e) == K_END) break;
    len = VAL(e) + (u32)BTAKE(b, XB(e)); BDROP(b, XB(e));
    e = DT[b->bb & ((1u << DB) - 1)];
    if (KIND(e) == K_SUB) { BDROP(b, DB); e = DT[VAL(e) + (u32)BTAKE(b, XB(e))]; }
    if (!e) return -1;
    BDROP(b, CL(e));
    dist = VAL(e) + (u32)BTAKE(b, XB(e)); BDROP(b, XB(e));
    if (dist > o) return -1;
    if (o + len + 8 > cap) return -2;
    { u16t *d = out + o, *s = d - dist; o += len;
      if (dist >= 4) { u16t *end = d + len; do { u64 v; __builtin_memcpy(&v, s, 8); __builtin_memcpy(d, &v, 8); d += 4; s += 4; } while (d < end); }
      else while (len--) *d++ = *s++; }
    if (b->padded > b->bc) return -1;
  }
  *po = o; return 0;
}
/* does a block start at this bit? a dynamic header, then some symbols decode without error */
static int probe(const u8 *in, u32 inlen, u64 bit, u16t *scratch, u32 scap) {
  BR b; brAt(&b, in, inlen, bit);
  if (dynHeader(&b, 1)) return 0;
  u32 o = 32768; for (u32 i = 0; i < 32768; i++) scratch[i] = (u16t)(256 + i);
  int r = codes16(&b, scratch, &o, scap, 2000);
  return r >= 0;
}
/* finds the first block start at or after bit `from` (up to `to`): the bit, or -1 */
int parFind(const u8 *in, u32 inlen, u32 from, u32 to, u16t *scratch, u32 scap) {
  for (u32 bit = from; bit < to; bit++) if (probe(in, inlen, bit, scratch, scap)) return (int)bit;
  return -1;
}
static int codesTok(BR *b, u32 *tok, u32 *pn, u32 cap, u32 *pout) {
  u32 n = *pn, e, len, dist, outn = *pout;
  for (;;) {
    BNEED(b, 48);
    e = LT[b->bb & ((1u << LB) - 1)];
    if (KIND(e) == K_SUB) { BDROP(b, LB); e = LT[VAL(e) + (u32)BTAKE(b, XB(e))]; }
    if (!e) return -1;
    BDROP(b, CL(e));
    if (n + 2 > cap) return -2;
    if (KIND(e) == K_LIT) { tok[n++] = VAL(e); outn++; continue; }
    if (KIND(e) == K_END) break;
    len = VAL(e) + (u32)BTAKE(b, XB(e)); BDROP(b, XB(e));
    e = DT[b->bb & ((1u << DB) - 1)];
    if (KIND(e) == K_SUB) { BDROP(b, DB); e = DT[VAL(e) + (u32)BTAKE(b, XB(e))]; }
    if (!e) return -1;
    BDROP(b, CL(e));
    dist = VAL(e) + (u32)BTAKE(b, XB(e)); BDROP(b, XB(e));
    if (dist > outn + 32768) return -1;
    tok[n++] = (len << 16) | (dist - 1); outn += len;   /* a copy: len >= 3, so never below 256 like a letter */
    if (b->padded > b->bc) return -1;
  }
  *pn = n; *pout = outn; return 0;
}
static u32 PAROUT;
u32 parOut(void) { return PAROUT; }   /* the bytes the list makes */
/* the list from the block at `bit` to the stream's end: its length, or -1 (not a real start, or damaged), -2 (room), -3 (a stored block: not handled) */
int parTok(const u8 *in, u32 inlen, u32 bit, u32 *tok, u32 cap) {
  BR b; brAt(&b, in, inlen, bit); u32 n = 0, i, on = 0; u32 *outn = &on; PAROUT = 0;
  for (;;) {
    BNEED(&b, 3); int last = (int)BTAKE(&b, 1);
    u32 type = (u32)((b.bb >> 1) & 3);
    if (type == 2) { if (dynHeader(&b, 0)) return -1; }
    else if (type == 1) { BDROP(&b, 3); u8 l[288]; for (i = 0; i < 144; i++) l[i] = 8; for (; i < 256; i++) l[i] = 9; for (; i < 280; i++) l[i] = 7; for (; i < 288; i++) l[i] = 8; build(LT, LB, l, 288, 1); for (i = 0; i < 32; i++) l[i] = 5; build(DT, DB, l, 32, 2); FIXL = 1; }
    else return -3;
    int r = codesTok(&b, tok, &n, cap, outn); if (r) return r;
    if (last) break;
  }
  PAROUT = on; return (int)n;
}
/* replays the list a piece at a time into out, where the 32 KB before out already hold the bytes before the block */
static struct { const u32 *tok; u32 n, i; u8 *out, *d; } RP;
void parReplayBegin(const u32 *tok, u32 n, u8 *out) { RP.tok = tok; RP.n = n; RP.i = 0; RP.out = RP.d = out; }
/* until at least target bytes are in out: the bytes in out so far */
u32 parReplay(u32 target) {
  const u32 *tok = RP.tok; u32 n = RP.n, i = RP.i; u8 *d = RP.d, *stop = RP.out + target;
  for (; i < n && d < stop; i++) { u32 t = tok[i];
    if (t < 256) { *d++ = (u8)t; continue; }
    u32 len = t >> 16, dist = (t & 0xffff) + 1; u8 *s = d - dist, *end = d + len;
    if (dist >= 8) { do { u64 v; __builtin_memcpy(&v, s, 8); __builtin_memcpy(d, &v, 8); d += 8; s += 8; } while (d < end); }
    else if (dist == 1) { u64 v = (u64)s[0] * 0x0101010101010101ull; do { __builtin_memcpy(d, &v, 8); d += 8; } while (d < end); }
    else { do { *d++ = *s++; } while (d < end); }
    d = end; }
  RP.i = i; RP.d = d; return (u32)(d - RP.out);
}
u32 parReplayDone(void) { return RP.i >= RP.n; }
/* keeps the last 32 KB at the start of the room (out - 32768): the bytes dropped */
u32 parReplaySlide(void) { u32 have = (u32)(RP.d - RP.out), drop; if (have < 32768) return 0; drop = have; __builtin_memcpy(RP.out - 32768, RP.d - 32768, 32768); RP.d = RP.out; return drop; }
int inflate(const u8 *in, u32 inlen, u8 *out, u32 outcap) { inflateBegin(in, inlen, out, outcap); return inflateStep(0xffffffffu); }
