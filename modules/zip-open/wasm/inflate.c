/* Copyright (c) 2026 LFC Foundry. MIT License.
 * Raw-deflate decoder for zip-open.js (small entries). Its own WebAssembly module, compiled the first time a small entry is opened, so pages that never need it do not pay for it at load.
 * Build: wasm/build.sh, then wasm/embed.py. */
typedef unsigned char u8; typedef unsigned int u32;

/* ---- inflate (since 1.5.0): raw deflate for small entries, so a few hundred small files do not each pay for a browser stream. Table-driven: 10-bit lookup for short codes, bit-by-bit for the rare long ones.
 * inflate(in, inlen, out, outcap) returns the number of bytes written, -1 for damaged data (also cut-off data) or -2 when more than outcap bytes would come out. ---- */
#define FB 10
void *memset(void *d, int c, unsigned long n) __attribute__((optnone));
void *memset(void *d, int c, unsigned long n) { u8 *p = d; while (n--) *p++ = (u8)c; return d; }
void *memcpy(void *d, const void *s, unsigned long n) __attribute__((optnone));
void *memcpy(void *d, const void *s, unsigned long n) { u8 *p = d; const u8 *q = s; while (n--) *p++ = *q++; return d; }
typedef unsigned short u16; typedef unsigned long long u64;
typedef struct { u16 fast[1 << FB]; u16 count[16]; u16 sym[288]; } Huff;
static Huff LL, DD, CL;
static int fixedBuilt;
static const u16 LBASE[29] = {3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258};
static const u8 LEXT[29] = {0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0};
static const u16 DBASE[30] = {1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577};
static const u8 DEXT[30] = {0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13};
static const u8 CLORDER[19] = {16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15};

static const u8 *ip, *iend; static u64 bb; static int bc, padded;
static inline void refill(void) {
  while (bc <= 56) { if (ip < iend) bb |= (u64)*ip++ << bc; else padded += 8; bc += 8; }
}
static inline u32 bits(int n) { u32 v; if (bc < n) refill(); v = (u32)(bb & ((1ull << n) - 1)); bb >>= n; bc -= n; return v; }

static int build(Huff *h, const u8 *len, int n, int isCodeLen) {
  u16 offs[16]; int i, l, k, left = 1; u32 code = 0; int idx = 0;
  for (i = 0; i < 16; i++) h->count[i] = 0;
  for (i = 0; i < n; i++) h->count[len[i]]++;
  h->count[0] = 0;
  { int max = 0; for (i = 1; i < 16; i++) { left <<= 1; left -= h->count[i]; if (left < 0) return -1; if (h->count[i]) max = i; }
    if (left > 0 && (isCodeLen || max != 1)) return -1; }   // an incomplete set is only allowed for one code of length 1 (as zlib does)
  offs[1] = 0; for (i = 1; i < 15; i++) offs[i + 1] = offs[i] + h->count[i];
  for (i = 0; i < n; i++) if (len[i]) h->sym[offs[len[i]]++] = i;
  for (i = 0; i < (1 << FB); i++) h->fast[i] = 0;
  for (l = 1; l <= FB; l++) {
    for (k = 0; k < h->count[l]; k++) {
      u32 r = 0, s = h->sym[idx++]; int b, j;
      for (b = 0; b < l; b++) if ((code >> b) & 1) r |= 1u << (l - 1 - b);
      for (j = r; j < (1 << FB); j += 1 << l) h->fast[j] = (u16)((s << 4) | l);
      code++;
    }
    code <<= 1;
  }
  return 0;
}
static inline int decode(Huff *h) {
  u32 e; int code = 0, first = 0, index = 0, len;
  if (bc < 16) refill();
  e = h->fast[bb & ((1 << FB) - 1)];
  if (e) { bb >>= e & 15; bc -= e & 15; return e >> 4; }
  for (len = 1; len <= 15; len++) {
    int cnt = h->count[len];
    code |= (int)(bb & 1); bb >>= 1; bc--;
    if (code - cnt < first) return h->sym[index + (code - first)];
    index += cnt; first += cnt; first <<= 1; code <<= 1;
  }
  return -1;
}
static void fixedTables(void) {
  u8 l[288]; int i;
  if (fixedBuilt) return;
  for (i = 0; i < 144; i++) l[i] = 8; for (; i < 256; i++) l[i] = 9; for (; i < 280; i++) l[i] = 7; for (; i < 288; i++) l[i] = 8;
  build(&LL, l, 288, 0);
  for (i = 0; i < 32; i++) l[i] = 5;
  build(&DD, l, 32, 0);
  fixedBuilt = 2;
}
static int codes(u8 *out, u32 outcap, u32 *op) {
  u32 o = *op;
  for (;;) {
    int s = decode(&LL);
    if (s < 0) return -1;
    if (s < 256) { if (o >= outcap) return -2; out[o++] = (u8)s; }
    else if (s == 256) break;
    else {
      int d; u32 len, dist, from;
      s -= 257; if (s >= 29) return -1;
      len = LBASE[s] + bits(LEXT[s]);
      d = decode(&DD); if (d < 0 || d >= 30) return -1;
      dist = DBASE[d] + bits(DEXT[d]);
      if (dist > o) return -1;
      if (o + len > outcap) return -2;
      from = o - dist;
      while (len--) out[o++] = out[from++];
    }
    if (padded > bc) return -1;
  }
  *op = o; return 0;
}
int inflate(const u8 *in, u32 inlen, u8 *out, u32 outcap) {
  u32 o = 0; int last, type, r;
  ip = in; iend = in + inlen; bb = 0; bc = 0; padded = 0;
  do {
    last = bits(1); type = bits(2);
    if (type == 0) {
      u32 len, nlen; int back = bc >> 3, realBack = back - (padded >> 3);
      if (realBack < 0) return -1;
      ip -= realBack; bb = 0; bc = 0; padded = 0;
      if (iend - ip < 4) return -1;
      len = ip[0] | (ip[1] << 8); nlen = ip[2] | (ip[3] << 8); ip += 4;
      if ((len ^ 0xffff) != nlen) return -1;
      if ((u32)(iend - ip) < len) return -1;
      if (o + len > outcap) return -2;
      while (len--) out[o++] = *ip++;
    } else if (type == 1) {
      fixedTables();
      r = codes(out, outcap, &o); if (r) return r;
    } else if (type == 2) {
      u8 lens[320]; int nlen, ndist, ncode, i; fixedBuilt = 0; nlen = bits(5) + 257; ndist = bits(5) + 1; ncode = bits(4) + 4;
      if (nlen > 286 || ndist > 30) return -1;
      for (i = 0; i < 19; i++) lens[i] = 0;
      for (i = 0; i < ncode; i++) lens[CLORDER[i]] = bits(3);
      if (build(&CL, lens, 19, 1)) return -1;
      { u8 cl[320]; int n = 0; while (n < nlen + ndist) {
          int s = decode(&CL), rep, v = 0;
          if (s < 0) return -1;
          if (s < 16) cl[n++] = s;
          else {
            if (s == 16) { if (n == 0) return -1; v = cl[n - 1]; rep = 3 + bits(2); }
            else if (s == 17) rep = 3 + bits(3); else rep = 11 + bits(7);
            if (n + rep > nlen + ndist) return -1;
            while (rep--) cl[n++] = v;
          }
          if (padded > bc) return -1;
        }
        if (cl[256] == 0) return -1;
        if (build(&LL, cl, nlen, 0)) return -1;
        if (build(&DD, cl + nlen, ndist, 0)) return -1;
        }
      r = codes(out, outcap, &o); if (r) return r;
    } else return -1;
    if (padded > bc) return -1;
  } while (!last);
  return (int)o;
}
