/* Copyright (c) 2026 LFC Foundry. MIT License.
 * jso-kernels.c: small WebAssembly helpers for memory-compression (built by build.sh into jso-kernels.wasm, embedded by embed.py).
 * Every function does exactly what the JavaScript fallback in src/jso-layer.js does, with the same results.
 * No library, no heap of its own: JavaScript puts the inputs into the module's memory and passes the addresses. */
typedef unsigned char u8; typedef unsigned int u32; typedef unsigned long long u64; typedef short i16; typedef signed char i8; typedef int i32;
#define EXPORT __attribute__((visibility("default")))

/* Reads the rows of a string column through the pattern tree (see Trie in jso-layer.js) once.
 *   b: the joined ASCII bytes of all rows; lens: byte length of each row; the walk starts at row `start`, whose first byte is at `p`.
 *   next: tree edges (node * 257 + byte, 256 = "a run of 1 to 15 digits"; 0 = no edge); term: pattern number of a node, -1 if none.
 *   slots: R arrays of n doubles one after another (the numbers); tid: pattern number of each row.
 *   minL, maxL (R ints) and lead (R bytes): shortest and longest digit run and whether any run had a leading zero, per slot.
 *   out[0] = the row where it stopped (n when finished), out[1] = that row's first byte.
 * It stops at the first row that does not fit a known pattern so that JavaScript can add one. */
/* A row is first tried against the pattern of the first row this call read successfully (its literal pieces are compared as they are, the numbers are read as runs of digits): no walk through the tree.
 * A row that does not fit goes through the tree as before, so the results are the same. */
static inline int tpl_lit_eq(const u8 *a, const u8 *c, u32 len) {
  while (len >= 8) { u64 x, y; __builtin_memcpy(&x, a, 8); __builtin_memcpy(&y, c, 8); if (x != y) return 0; a += 8; c += 8; len -= 8; }
  while (len) { if (*a != *c) return 0; a++; c++; len--; }
  return 1;
}
EXPORT int tpl_scan(const u8 *b, const u32 *lens, int start, int n, u32 p, const i16 *next, const i8 *term,
                    double *slots, int R, u8 *tid, i32 *minL, i32 *maxL, u8 *lead, u32 *out) {
  int i, have = 0, ek = 0, et = 0;
  u32 ep = 0, ls[17], ll[17];                                 /* the first good row: where it starts and where its literal pieces are inside it */
  for (i = start; i < n; i++) {
    u32 end = p + lens[i], q = p;
    int node = 0, k = 0, t;
    if (have) {                                               /* same pattern as that row? */
      int j, ok = 1; u64 vv[17]; u8 lk[17]; int lw[17];
      for (j = 0; j <= ek; j++) {
        if (q + ll[j] > end || !tpl_lit_eq(b + q, b + ep + ls[j], ll[j])) { ok = 0; break; }
        q += ll[j];
        if (j < ek) {
          u32 e = q, ch; u64 v = 0; int len;
          while (e < end && (ch = b[e]) - 48u < 10u) { v = v * 10 + (ch - 48u); e++; }
          len = (int)(e - q);
          if (len == 0 || len > 15) { ok = 0; break; }
          vv[j] = v; lw[j] = len; lk[j] = (u8)(len > 1 && b[q] == 48);
          q = e;
        }
      }
      if (ok && q == end) {                                   /* it fits: now the numbers and the statistics are written */
        for (j = 0; j < ek; j++) {
          slots[(u64)j * (u64)n + (u64)i] = (double)vv[j];
          if (lw[j] < minL[j]) minL[j] = lw[j];
          if (lw[j] > maxL[j]) maxL[j] = lw[j];
          if (lk[j]) lead[j] = 1;
        }
        tid[i] = (u8)et; p = end; continue;
      }
      q = p;                                                  /* not this pattern: the tree decides  */
    }
    while (q < end) {
      u32 ch = b[q];
      if (ch - 48u < 10u) {
        u32 e = q; u64 v = 0; int len;
        do { v = v * 10 + (ch - 48u); e++; } while (e < end && (ch = b[e]) - 48u < 10u);
        len = (int)(e - q);
        if (len > 15 || k >= R) goto fail;
        node = next[node * 257 + 256];
        if (node == 0) goto fail;
        slots[(u64)k * (u64)n + (u64)i] = (double)v;
        if (len < minL[k]) minL[k] = len;
        if (len > maxL[k]) maxL[k] = len;
        if (len > 1 && b[q] == 48) lead[k] = 1;
        k++; q = e;
      } else {
        node = next[node * 257 + ch];
        if (node == 0) goto fail;
        q++;
      }
    }
    t = term[node];
    if (t < 0) goto fail;
    tid[i] = (u8)t;
    if (!have && k <= 16) {                                   /* remember this row's pattern */
      u32 r = p, lit0 = p; int m = 0;
      while (r < end) {
        if (b[r] - 48u < 10u) { ls[m] = lit0 - p; ll[m] = r - lit0; m++; while (r < end && b[r] - 48u < 10u) r++; lit0 = r; }
        else r++;
      }
      ls[m] = lit0 - p; ll[m] = end - lit0;
      if (m == k) { have = 1; ek = k; et = t; ep = p; }
    }
    p = end;
    continue;
  fail:
    out[0] = (u32)i; out[1] = p; return i;
  }
  out[0] = (u32)n; out[1] = p; return n;
}

/* ---- FSST (Fast Static Symbol Table, Boncz/Neumann/Leis, VLDB 2020): encode and decode one column with a table made by the JavaScript trainer ----
 * JavaScript writes the table (n entries of {length, 8 bytes}) at fsst_tbl() and calls fsst_init(n); then fsst_encode_col / fsst_decode_col work on a whole column.
 * Same codes and same bytes as the JavaScript in src/jso-layer.js (longest symbol first, code 255 = "the next byte is literal"). One table at a time. */
static u64 fs_symw[256]; static u8 fs_syml[256]; static unsigned short fs_shortc[65536]; static u8 fs_byte1ok[256]; static u8 fs_byte1[256];
static unsigned short fs_head[2048]; static u8 fs_nxt[256];
static u8 fs_heap[256 * 9];
EXPORT void *fsst_tbl(void) { return fs_heap; }
static inline u64 fs_load8(const u8 *p) { u64 v; __builtin_memcpy(&v, p, 8); return v; }
static inline u32 fs_slot(u64 w) { return (u32)(((w & 0xFFFFFF) * 2971215073ULL) >> 8) & 2047; }
EXPORT void fsst_init(int n) {
  int i, l, b0, b1;
  for (i = 0; i < 65536; i++) fs_shortc[i] = 0xFFFF;
  for (i = 0; i < 256; i++) { fs_byte1ok[i] = 0; fs_nxt[i] = 0; fs_symw[i] = 0; fs_syml[i] = 0; }
  for (i = 0; i < 2048; i++) fs_head[i] = 0xFFFF;
  for (i = 0; i < n; i++) {
    u8 len = fs_heap[i * 9]; u64 w = 0; int j;
    for (j = 0; j < len; j++) w |= (u64)fs_heap[i * 9 + 1 + j] << (8 * j);
    fs_symw[i] = w; fs_syml[i] = len;
    if (len == 1) { fs_byte1ok[w & 255] = 1; fs_byte1[w & 255] = (u8)i; }
  }
  for (i = 0; i < n; i++) if (fs_syml[i] == 2) fs_shortc[fs_symw[i] & 0xFFFF] = (unsigned short)i;
  for (l = 8; l >= 3; l--) for (i = 0; i < n; i++) if (fs_syml[i] == l) {          /* append at the tail so longer symbols stay first */
    u32 s = fs_slot(fs_symw[i]);
    fs_nxt[i] = 0;
    if (fs_head[s] == 0xFFFF) fs_head[s] = (unsigned short)i; else { int k = fs_head[s]; while (fs_nxt[k] != 0) k = fs_nxt[k] - 1; fs_nxt[k] = (u8)(i + 1); }
  }
  for (b0 = 0; b0 < 256; b0++) if (fs_byte1ok[b0]) for (b1 = 0; b1 < 256; b1++) if (fs_shortc[b0 | b1 << 8] == 0xFFFF) fs_shortc[b0 | b1 << 8] = fs_byte1[b0];
}
/* one string src[0..len) (8 readable bytes after it are fine, their value is masked); returns the bytes written to dst */
static inline u32 fs_enc1(const u8 *src, u32 len, u8 *dst) {
  u32 pos = 0, o = 0;
  while (pos < len) {
    u32 rem = len - pos, got = 0, c; u64 w = fs_load8(src + pos); unsigned short h;
    if (rem < 8) w &= (1ULL << (8 * rem)) - 1;
    h = fs_head[fs_slot(w)];
    while (h != 0xFFFF) {
      u32 l = fs_syml[h];
      if (l <= rem && (w & (l == 8 ? ~0ULL : ((1ULL << (8 * l)) - 1))) == fs_symw[h]) { dst[o++] = (u8)h; pos += l; got = 1; break; }
      h = fs_nxt[h] ? (unsigned short)(fs_nxt[h] - 1) : 0xFFFF;
    }
    if (got) continue;
    c = fs_shortc[w & 0xFFFF];
    if (c != 0xFFFF && fs_syml[c] <= rem) { dst[o++] = (u8)c; pos += fs_syml[c]; continue; }
    if (fs_byte1ok[w & 255]) { dst[o++] = fs_byte1[w & 255]; pos += 1; continue; }
    dst[o++] = 255; dst[o++] = (u8)w; pos++;
  }
  return o;
}
/* src: all strings back to back (+8 spare bytes); offs: n + 1 byte offsets; dst: room for twice the input; outoffs: n + 1 code offsets. Returns the code bytes. */
EXPORT u32 fsst_encode_col(const u8 *src, const u32 *offs, u32 n, u8 *dst, u32 *outoffs) {
  u32 o = 0, i; outoffs[0] = 0;
  for (i = 0; i < n; i++) { o += fs_enc1(src + offs[i], offs[i + 1] - offs[i], dst + o); outoffs[i + 1] = o; }
  return o;
}
/* codes: all codes back to back; coff: n + 1 code offsets (already checked by JavaScript: every code below the table size or 255 with a byte after it);
 * out: room for the decoded bytes plus 8; ooffs: n + 1 decoded offsets. Returns the decoded bytes. */
EXPORT u32 fsst_decode_col(const u8 *codes, const u32 *coff, u32 n, u8 *out, u32 *ooffs) {
  u32 o = 0, i, k, end; ooffs[0] = 0;
  for (i = 0; i < n; i++) {
    end = coff[i + 1];
    for (k = coff[i]; k < end; k++) {
      u32 c = codes[k];
      if (c == 255) { out[o++] = codes[++k]; continue; }
      { u64 w = fs_symw[c]; __builtin_memcpy(out + o, &w, 8); o += fs_syml[c]; }
    }
    ooffs[i + 1] = o;
  }
  return o;
}

/* ---- the number picker's loops (src/picker.js): rANS, byte planes, bit packing. Same bytes and same numbers as the JavaScript there. ----
 * Every function works on memory the caller filled; none keeps anything between calls except the two rANS tables (one stream at a time). */
#define RS_RL (1u << 23)
#define RI_MIN 2048u   /* streams of this many symbols or more use 4 states (12 bytes more, decodes about 2x faster) */
static unsigned short rs_cum[257]; static u8 rs_slot[4096] __attribute__((aligned(8))); static u32 rs_f[256];
/* Decodes n bytes from a rANS stream. freq: 256 frequencies that add up to 4096 (JavaScript checked). delta: 1 when the bytes are differences (running sum is applied). Returns 0, or -1 for a cut stream. */
EXPORT int rans_dec(const u8 *src, u32 len, u32 n, const unsigned short *freq, u8 *out, int delta) {
  u32 i, s, c = 0, q, x, p = 4, m;
  if (len < 4) return -1;
  for (s = 0; s < 256; s++) {             /* the slot table, filled 8 bytes at a time where a symbol's run allows it */
    u32 f = freq[s], e; rs_f[s] = f; rs_cum[s] = (unsigned short)c; e = c + f > 4096 ? 4096 : c + f; q = c;
    if (e - q >= 16) { u64 rep = 0x0101010101010101ULL * s; for (; q & 7; q++) rs_slot[q] = (u8)s; for (; q + 8 <= e; q += 8) *(u64 *)(rs_slot + q) = rep; }
    for (; q < e; q++) rs_slot[q] = (u8)s;
    c += f;
  }
  rs_cum[256] = (unsigned short)c;
  if (src[3] & 0x80) {                    /* since 2.22.0: 4 states take turns (value i uses state i % 4), so 4 values decode side by side; a 1-state stream never sets this bit */
    u32 xs[4], j; if (len < 16) return -1;
    for (j = 0; j < 4; j++) xs[j] = (u32)src[4 * j] | ((u32)src[4 * j + 1] << 8) | ((u32)src[4 * j + 2] << 16) | ((u32)src[4 * j + 3] << 24);
    xs[0] &= 0x7FFFFFFFu; p = 16;
    /* no branches in the loop: a state needs at most 2 new bytes (it is at least 2^11 after a step), each taken by a select; reads past the end see a 0 and are caught after the loop */
#define RI_STEP(J, I) { u32 xx = xs[J], b; m = xx & 4095; s = rs_slot[m]; out[I] = (u8)s; xx = (u32)rs_f[s] * (xx >> 12) + m - rs_cum[s]; \
      b = xx < RS_RL; xx = b ? (xx << 8) | src[p < len ? p : len - 1] : xx; p += b; \
      b = xx < RS_RL; xx = b ? (xx << 8) | src[p < len ? p : len - 1] : xx; p += b; xs[J] = xx; }
    for (i = 0; i + 4 <= n; i += 4) { RI_STEP(0, i) RI_STEP(1, i + 1) RI_STEP(2, i + 2) RI_STEP(3, i + 3) }
    for (; i < n; i++) RI_STEP(i & 3, i)
#undef RI_STEP
    if (p > len) return -1;
    if (delta) for (i = 1; i < n; i++) out[i] = (u8)(out[i - 1] + out[i]);
    return 0;
  }
  x = (u32)src[0] | ((u32)src[1] << 8) | ((u32)src[2] << 16) | ((u32)src[3] << 24);
  for (i = 0; i < n; i++) {
    u64 t;
    m = x & 4095; s = rs_slot[m]; out[i] = (u8)s;
    t = (u64)freq[s] * (u64)(x >> 12) + m - rs_cum[s];
    x = (u32)t;
    if (t < RS_RL) { do { if (p >= len) return -1; x = (x << 8) | src[p++]; } while (x < RS_RL); }
  }
  if (delta) for (i = 1; i < n; i++) out[i] = (u8)(out[i - 1] + out[i]);
  return 0;
}
/* Encodes syms (n bytes) with the same table; writes backwards from out + cap and returns the number of bytes written (they start at out + cap - result). */
/* x / f by a multiply (since 2.23.0; the reciprocal method of ryg_rans, exact for the states here, which stay under 2^31): the new state is x + bias + q * (4096 - f). */
typedef struct { u32 rcp, sh, bias, cmpl; } RSYM;
static void rs_syms(const unsigned short *freq, RSYM *t) {
  u32 s, c = 0;
  for (s = 0; s < 256; s++) {
    u32 f = freq[s];
    if (f < 2) { t[s].rcp = 0xFFFFFFFFu; t[s].sh = 0; t[s].bias = c + 4096 - 1; }
    else { u32 sh = 0; while (f > (1u << sh)) sh++; t[s].rcp = (u32)(((1ull << (sh + 31)) + f - 1) / f); t[s].sh = sh - 1; t[s].bias = c; }
    t[s].cmpl = 4096 - f; c += f;
  }
}
static inline u32 rs_put(u32 x, const RSYM *y) { u32 q = (u32)(((u64)x * y->rcp) >> 32) >> y->sh; return x + y->bias + q * y->cmpl; }
EXPORT u32 rans_enc(const u8 *src, u32 n, const unsigned short *freq, u8 *out, u32 cap) {
  RSYM t[256]; u32 s, p = cap, x = RS_RL, i, k;
  rs_syms(freq, t);
  if (n >= RI_MIN) {                      /* 4 states taking turns, written so the decoder reads them first (state 0 carries the 4-state mark in its top bit) */
    u32 xs[4] = { RS_RL, RS_RL, RS_RL, RS_RL }, j;
    for (i = n; i-- > 0;) {
      u32 xm, xx; j = i & 3; xx = xs[j];
      s = src[i]; xm = (2048u << 8) * freq[s];
      while (xx >= xm) { out[--p] = (u8)xx; xx >>= 8; }
      xs[j] = rs_put(xx, &t[s]);
    }
    for (j = 4; j-- > 0;) { u32 v = xs[j] | (j ? 0u : 0x80000000u); for (k = 4; k-- > 0;) out[--p] = (u8)(v >> (8 * k)); }
    return cap - p;
  }
  for (i = n; i-- > 0;) {
    u32 xm;
    s = src[i]; xm = (2048u << 8) * freq[s];
    while (x >= xm) { out[--p] = (u8)x; x >>= 8; }
    x = rs_put(x, &t[s]);
  }
  for (k = 4; k-- > 0;) out[--p] = (u8)(x >> (8 * k));
  return cap - p;
}
/* The 8 byte planes of n doubles (plane b of value i at out[b * n + i]); variant 1 first XORs every value's two halves with the raw halves of the value before. */
EXPORT void planes_split(const double *a, u32 n, int variant, u8 *out) {
  const u32 *w = (const u32 *)a; u32 i, pl = 0, ph = 0;
  for (i = 0; i < n; i++) {
    u32 lo = w[2 * i], hi = w[2 * i + 1];
    if (variant) { u32 l2 = lo, h2 = hi; lo ^= pl; hi ^= ph; pl = l2; ph = h2; }
    out[i] = (u8)lo; out[n + i] = (u8)(lo >> 8); out[2 * n + i] = (u8)(lo >> 16); out[3 * n + i] = (u8)(lo >> 24);
    out[4 * n + i] = (u8)hi; out[5 * n + i] = (u8)(hi >> 8); out[6 * n + i] = (u8)(hi >> 16); out[7 * n + i] = (u8)(hi >> 24);
  }
}
EXPORT void planes_join(const u8 *p, u32 n, int variant, double *out) {
  u32 *o = (u32 *)out, i, pl = 0, ph = 0;
  for (i = 0; i < n; i++) {
    u32 lo = (u32)p[i] | ((u32)p[n + i] << 8) | ((u32)p[2 * n + i] << 16) | ((u32)p[3 * n + i] << 24);
    u32 hi = (u32)p[4 * n + i] | ((u32)p[5 * n + i] << 8) | ((u32)p[6 * n + i] << 16) | ((u32)p[7 * n + i] << 24);
    if (variant) { lo ^= pl; hi ^= ph; pl = lo; ph = hi; }
    o[2 * i] = lo; o[2 * i + 1] = hi;
  }
}
/* Counts of the bytes of one plane (cnt) and of their differences (cd); d receives the differences (d[0] = p[0]). The count arrays are 256 u32 each and are set to zero first. */
EXPORT void plane_stats(const u8 *p, u32 n, u32 *cnt, u32 *cd, u8 *d) {
  u32 i; u8 prev;
  for (i = 0; i < 256; i++) { cnt[i] = 0; cd[i] = 0; }
  if (!n) return;
  for (i = 0; i < n; i++) cnt[p[i]]++;
  prev = p[0]; d[0] = prev; cd[prev]++;
  for (i = 1; i < n; i++) { u8 v = p[i]; u8 e = (u8)(v - prev); d[i] = e; cd[e]++; prev = v; }
}
/* n values of bw bits (1 to 32) read from src (padded with 8 zero bytes) into doubles, each plus base. */
EXPORT void bp_unpack(const u8 *src, u32 n, u32 bw, double base, double *out) {
  const u32 *w = (const u32 *)src; u32 i, mask = bw == 32 ? 0xFFFFFFFFu : ((1u << bw) - 1u); u64 pos = 0;
  for (i = 0; i < n; i++) {
    u32 idx = (u32)(pos >> 5), off = (u32)(pos & 31), v = w[idx] >> off;
    if (off + bw > 32) v |= w[idx + 1] << (32 - off);
    out[i] = (double)(v & mask) + base;
    pos += bw;
  }
}
/* The reverse: values a[i] - base (whole numbers from 0 to 4294967295) written bw bits each into o, which holds ceil(n * bw / 32) + 1 words (set to zero here). */
EXPORT void bp_pack(const double *a, u32 n, double base, u32 bw, u32 *o) {
  u32 words = (u32)(((u64)n * bw + 31) / 32) + 1, i; u64 pos = 0;
  for (i = 0; i < words; i++) o[i] = 0;
  for (i = 0; i < n; i++) {
    u32 v = (u32)(long long)(a[i] - base), idx = (u32)(pos >> 5), off = (u32)(pos & 31);
    o[idx] |= v << off; if (off + bw > 32) o[idx + 1] |= v >> (32 - off);
    pos += bw;
  }
}
/* Whole-number differences, zigzag coded: d[i - 1] = zigzag(a[i] - a[i - 1]) for i = 1 .. n - 1. Returns the largest of them (0 when n < 2). */
EXPORT double delta_enc(const double *a, u32 n, double *d) {
  u32 i; double y = 0;
  for (i = 1; i < n; i++) { double x = a[i] - a[i - 1]; x = x < 0 ? -2 * x - 1 : 2 * x; d[i - 1] = x; if (x > y) y = x; }
  return y;
}
/* Second differences (signed): d[i - 2] = (a[i] - a[i - 1]) - (a[i - 1] - a[i - 2]) for i = 2 .. n - 1 (n >= 3). Returns the summed bit lengths of the second differences minus those of the first differences from i = 2 on. */
static u32 bl64(double x) { u64 u; u32 e; __builtin_memcpy(&u, &x, 8); e = (u32)(u >> 52) & 0x7FF; return e >= 1023 ? e - 1022 : 0; }      /* bit length of |x| for whole x (read from the exponent; 2.23.0) */
EXPORT double delta2_enc(const double *a, u32 n, double *d) {
  u32 i; double x = a[1] - a[0], y, j, s = 0;
  for (i = 2; i < n; i++) { y = a[i] - a[i - 1]; j = y - x; x = y; d[i - 2] = j; s += (double)bl64(j) - (double)bl64(x); }
  return s;
}
/* The reverse: out[0] = c0 and out[i + 1] = out[i] + unzigzag(d[i]) for i = 0 .. m - 1 (z % 2 is true for odd and for fractions, like the JavaScript). */
EXPORT void delta_dec(const double *d, u32 m, double c0, double *out) {
  u32 i; double c = c0; out[0] = c;
  for (i = 0; i < m; i++) {
    double z = d[i]; int odd;
    if (z >= 9.2e18 || z <= -9.2e18) odd = 0; else { long long t = (long long)z; odd = (z != (double)t) || (t & 1); }
    c += odd ? -(z + 1) / 2 : z / 2;
    out[i + 1] = c;
  }
}
/* One look at a block of doubles for the picker: mm[0] = smallest, mm[1] = largest (NaN never wins, like the JavaScript compare); returns 1 when every value is a whole number
 * below 2^51 in size that is not -0 (the test isIntegral in picker.js makes), else 0. */
EXPORT int block_stats(const double *a, u32 n, double *mm) {
  u32 i; double mn = __builtin_inf(), mx = -__builtin_inf(); int ok = 1;
  for (i = 0; i < n; i++) {
    double v = a[i], av = v < 0 ? -v : v;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
    if (!(av < 2251799813685248.0) || __builtin_floor(v) != v || (v == 0 && 1 / v < 0)) ok = 0;
  }
  mm[0] = mn; mm[1] = mx; return ok;
}
/* Math.round as the JavaScript defines it (halves go up). */
static inline double js_round(double y) {
  double t, diff;
  if (y >= 4503599627370496.0 || y <= -4503599627370496.0) return y;
  t = (double)(long long)y; if (t > y) t -= 1;
  diff = y - t; return diff >= 0.5 ? t + 1 : t;
}
/* ALP, the exact part: for every value, the whole number d with d * Ff / Fe == a[i] (Fe, Ff: the powers of ten for the two exponents) goes to ints[i];
 * a value that is not exactly such a decimal (or is NaN, infinite or too big) gets ints[i] = 0 and its row is added to pos. Returns how many rows are in pos. */
EXPORT u32 alp_enc(const double *a, u32 n, double Fe, double Ff, double *ints, u32 *pos) {
  u32 i, k = 0;
  for (i = 0; i < n; i++) {
    double x = a[i], y = x * Fe / Ff, d;
    if (!(y - y == 0)) { ints[i] = 0; pos[k++] = i; continue; }
    d = js_round(y);
    if (d > 2251799813685248.0 || d < -2251799813685248.0) { ints[i] = 0; pos[k++] = i; continue; }
    if (d * Ff / Fe == x && !(x == 0 && 1 / x < 0)) ints[i] = d; else { ints[i] = 0; pos[k++] = i; }
  }
  return k;
}

/* The numbers of a date-time column (see tsPack in jso-layer.js) as one number per row, with the checks and the sampled ranges and steps that JavaScript prices.
 *   f: g arrays of n doubles one after another (year, month, day, then hour, minute, second, millisecond); g is 3, 5, 6 or 7.
 *   out: n doubles (days, minutes, seconds or milliseconds since 1970-01-01).
 *   st: 3 * g + 3 doubles: per number the smallest, the biggest and the biggest step between sampled rows; then the same three for the result.
 * Returns 0 when a row is not a real date and time (out and st are then not meant to be used), 1 otherwise. */
static const unsigned char TS_DIM[12] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
static inline double ts_abs(double x) { return x < 0 ? -x : x; }
EXPORT int ts_pack(const double *f, u32 n, u32 g, double *out, double *st) {
  u32 i, j, mask = 0;
  double inf = __builtin_inf(), tmin = inf, tmax = -inf, tdm = 0;
  while ((n >> (mask + 1)) > 1024) mask++;
  mask = (1u << mask) - 1;
  for (j = 0; j < g; j++) { st[j] = inf; st[g + j] = -inf; st[2 * g + j] = 0; }
  for (i = 0; i < n; i++) {
    double y = f[i], mo = f[n + i], d = f[2 * n + i], v, x;
    long long yi = (long long)y, era, yoe, doy, days; int moi = (int)mo, di = (int)d;
    int leap = (yi % 4 == 0) && (yi % 100 != 0 || yi % 400 == 0);
    if (mo < 1 || mo > 12 || d < 1 || d > (moi == 2 && leap ? 29 : TS_DIM[moi - 1])) return 0;
    { long long yy = yi; if (moi <= 2) yy--; era = yy >= 0 ? yy / 400 : -((399 - yy) / 400); yoe = yy - era * 400;
      doy = (153 * (moi + (moi > 2 ? -3 : 9)) + 2) / 5 + di - 1;
      days = era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719468; }
    if (g == 3) v = (double)days;
    else {
      double h = f[3 * n + i], mi = f[4 * n + i];
      if (h > 23 || mi > 59) return 0;
      if (g == 5) v = (double)days * 1440 + h * 60 + mi;
      else {
        double sec = f[5 * n + i];
        if (sec > 59) return 0;
        v = (double)days * 86400 + h * 3600 + mi * 60 + sec;
        if (g == 7) v = v * 1000 + f[6 * n + i];
      }
    }
    out[i] = v;
    if ((i & mask) != 0) continue;
    if (v < tmin) tmin = v;
    if (v > tmax) tmax = v;
    if (i > 0) { x = ts_abs(v - out[i - 1]); if (x > tdm) tdm = x; }
    for (j = 0; j < g; j++) {
      x = f[j * n + i]; if (x < st[j]) st[j] = x; if (x > st[g + j]) st[g + j] = x;
      if (i > 0) { x = ts_abs(x - f[j * n + i - 1]); if (x > st[2 * g + j]) st[2 * g + j] = x; }
    }
  }
  st[3 * g] = tmin; st[3 * g + 1] = tmax; st[3 * g + 2] = tdm;
  return 1;
}

/* DEC (picker): v = m * 10^k with k the zeros at the end of a whole number. m[i] = v with its trailing zeros taken off, k[i] = how many (0 for 0).
 * Returns how many values had at least one zero to take off. The caller checked every |v| < 2^52. */
EXPORT u32 dec_split(const double *a, u32 n, double *m, double *k) {      /* since 2.23.0 in doubles: q = round(x * 10^-j) divides x exactly when q * 10^j == x (|x| < 2^52, so both steps are exact enough) */
  u32 i, cnt = 0;
  for (i = 0; i < n; i++) {
    double x = a[i], ax = x < 0 ? -x : x, q; u32 z = 0;
    if (ax != 0) {
      q = __builtin_rint(ax * 1e-8); if (q * 1e8 == ax) { ax = q; z += 8; }      /* at most 15 zeros: 8, 4, 2 and 1 cover them */
      q = __builtin_rint(ax * 1e-4); if (q * 1e4 == ax) { ax = q; z += 4; }
      q = __builtin_rint(ax * 1e-2); if (q * 1e2 == ax) { ax = q; z += 2; }
      q = __builtin_rint(ax * 1e-1); if (q * 1e1 == ax) { ax = q; z += 1; }
    } else ax = 0;
    m[i] = x < 0 ? -ax : ax; k[i] = (double)z; cnt += z != 0;
  }
  return cnt;
}
/* ENT (picker): the top bits of (a[i] - mn) go to syms (a byte), the low sh bits to low, cnt (256 words) counts the symbols. Whole numbers, 0 <= a[i] - mn < 2^39, sh <= 31. */
EXPORT void ent_split(const double *a, u32 n, double mn, u32 sh, u8 *syms, u32 *low, u32 *cnt) {
  u32 i, mask = sh ? (0xFFFFFFFFu >> (32 - sh)) : 0;
  for (i = 0; i < 256; i++) cnt[i] = 0;
  for (i = 0; i < n; i++) { u64 x = (u64)(a[i] - mn); u32 y = (u32)(x >> sh); syms[i] = (u8)y; low[i] = (u32)x & mask; cnt[y & 255]++; }
}
/* EG (picker): size class of each zigzag number in syms (0 to 53), the counts of each class in cnt (256 words), and the bits below the leading one packed into o (zeroed here;
 * the caller leaves n * 2 + 2 words). Returns the number of bits written. The same bytes as egEncode in picker.js. */
EXPORT u32 eg_enc(const double *a, u32 n, u8 *syms, u32 *cnt, u32 *o) {
  u32 i, w, pos = 0, top = 1;          /* top: words below it are cleared (since 2.23.0 only the words written, not n * 2 + 2) */
  for (i = 0; i < 256; i++) cnt[i] = 0;
  o[0] = 0; o[1] = 0;
  for (i = 0; i < n; i++) {
    long long x = (long long)a[i]; u64 u = x >= 0 ? ((u64)x << 1) : (((u64)(-x)) << 1) - 1; u32 c = u ? 64 - (u32)__builtin_clzll(u) : 0;
    syms[i] = (u8)c; cnt[c]++;
    if (c > 1) {
      u64 low = u - (1ULL << (c - 1)); u32 nb = c - 1, nb1 = nb < 32 ? nb : 32, idx, off; u64 t;
      idx = pos >> 5; off = pos & 31; if (idx + 1 >= top) { o[idx + 1] = 0; top = idx + 2; } t = (u64)(u32)low << off; o[idx] |= (u32)t; o[idx + 1] |= (u32)(t >> 32); pos += nb1;
      if (nb > 32) { idx = pos >> 5; off = pos & 31; if (idx + 1 >= top) { o[idx + 1] = 0; top = idx + 2; } t = (low >> 32) << off; o[idx] |= (u32)t; o[idx + 1] |= (u32)(t >> 32); pos += nb - 32; }
    }
  }
  (void)w;
  return pos;
}

/* Reading the ways back (since 2.20.2). eg_bits: the number of bits the size classes in syms ask for, or -1 when a class is above 53 (the JavaScript fails the same way). */
EXPORT int eg_bits(const u8 *syms, u32 n) {
  u64 bits = 0; u32 i;
  for (i = 0; i < n; i++) { u32 c = syms[i]; if (c > 53) return -1; if (c > 1) bits += c - 1; }
  return bits > 0x7FFFFFFFull ? -1 : (int)bits;
}
/* eg_dec: out[i] = the number whose size class is syms[i] and whose low bits are the next c - 1 bits of src (src needs 8 spare bytes after its data). Same values as egDecode in picker.js. */
EXPORT void eg_dec(const u8 *syms, u32 n, const u8 *src, double *out) {
  u64 pos = 0; u32 i;
  for (i = 0; i < n; i++) {
    u32 c = syms[i]; u64 u;
    if (c < 2) u = c;
    else {
      u32 nb = c - 1, by = (u32)(pos >> 3), sh = (u32)(pos & 7); u64 w = 0, lo; u32 k;
      for (k = 0; k < 8; k++) w |= (u64)src[by + k] << (8 * k);
      lo = (w >> sh) & (((u64)1 << nb) - 1);
      u = ((u64)1 << nb) + lo; pos += nb;
    }
    out[i] = (u & 1) == 0 ? (double)(u >> 1) : -(double)((u + 1) >> 1);
  }
}
/* ent_dec: out[i] = syms[i] * 2^sh + the next sh bits of src + mn (src needs 8 spare bytes; sh at most 32). */
EXPORT void ent_dec(const u8 *syms, u32 n, u32 sh, double mn, const u8 *src, double *out) {
  u64 pos = 0, mask = sh ? (((u64)1 << sh) - 1) : 0; u32 i; double d = (double)((u64)1 << sh);
  for (i = 0; i < n; i++) {
    u64 lo = 0;
    if (sh) {
      u32 by = (u32)(pos >> 3), sb = (u32)(pos & 7), k; u64 w = 0;
      for (k = 0; k < 8; k++) w |= (u64)src[by + k] << (8 * k);
      lo = (w >> sb) & mask; pos += sh;
    }
    out[i] = (double)syms[i] * d + (double)lo + mn;
  }
}

/* rle_dec: out = vals[k] repeated runs[k] + 1 times, for k = 0 .. m - 1. Returns 0, or 1 when a run is not a whole number of at least 1 or the runs do not add up to n (the JavaScript fails the same way). */
EXPORT int rle_dec(const double *vals, const double *runs, u32 m, u32 n, double *out) {
  u32 k, o = 0;
  for (k = 0; k < m; k++) {
    double c = runs[k] + 1; u32 ci, j;
    if (!(c >= 1) || c != __builtin_floor(c) || (double)o + c > (double)n) return 1;
    ci = (u32)c; { double v = vals[k]; for (j = 0; j < ci; j++) out[o + j] = v; } o += ci;
  }
  return o == n ? 0 : 1;
}
/* dec_join: out[i] = d[i] * 10^g[i]. Returns 0, 1 when a power is outside 0 .. 22 and 2 when one is not a whole number (the JavaScript then does the sum itself). */
static const double P10[23] = {1e0,1e1,1e2,1e3,1e4,1e5,1e6,1e7,1e8,1e9,1e10,1e11,1e12,1e13,1e14,1e15,1e16,1e17,1e18,1e19,1e20,1e21,1e22};
EXPORT int dec_join(const double *d, const double *g, u32 n, double *out) {
  u32 i;
  for (i = 0; i < n; i++) { double k = g[i]; if (!(k >= 0 && k <= 22)) return 1; if (k != __builtin_floor(k)) return 2; out[i] = d[i] * P10[(u32)k]; }
  return 0;
}

/* ---- enc_tree (picker, since 2.19.2): the bytes of one whole-number block for a recorded tree of ways, in one call. Same bytes as encIntWith in src/picker.js for the ways it knows:
 * CONST 1, FOR 2, DELTA 3, RLE 4, DICT 5, PFOR 6, DIV 7, ENT 8, EG 9, DEC 10, DELTA2 11, LB 12, and ALT 13 (two trees, see below). tree = for each way: its number, its number of parts, then the parts' trees one after another.
 * Returns the number of bytes written, or 0 when a way does not apply (JavaScript then goes its own way). */
typedef struct { u8 *p; u8 *end; u8 *sp; u8 *send; int bad; } TW;
static void tw_b(TW *w, u32 v) { if (w->p < w->end) *w->p++ = (u8)v; else w->bad = 1; }
static void tw_vi(TW *w, u64 x) { while (x >= 128) { tw_b(w, (u32)(x & 127) | 128); x >>= 7; } tw_b(w, (u32)x); }
static void tw_zi(TW *w, double x) { u64 z = x < 0 ? (((u64)(-x)) << 1) - 1 : ((u64)x) << 1; tw_vi(w, z); }
static void *tw_alloc(TW *w, u32 bytes) { u8 *r = w->sp; bytes = (bytes + 15) & ~15u; if (w->sp + bytes > w->send) { w->bad = 1; return 0; } w->sp += bytes; return r; }
static u32 tw_bw(double rng) { return rng <= 0 ? 0 : 64 - (u32)__builtin_clzll((u64)rng); }
/* bits: the low nb bits of each value, packed one after another from the lowest bit, as many bytes as ceil(n * nb / 8) */
static void tw_bits(TW *w, const u32 *v, u32 n, u32 nb) {
  u64 acc = 0; u32 cnt = 0, i;
  if (!nb) return;
  for (i = 0; i < n; i++) { acc |= (u64)v[i] << cnt; cnt += nb; while (cnt >= 8) { tw_b(w, (u32)acc); acc >>= 8; cnt -= 8; } }
  if (cnt) tw_b(w, (u32)acc);
}
/* the frequency table of 4096 and the rANS bytes of syms, written the way picker.js writes them (bitmap, frequencies minus one, length, bytes) */
static int tw_ans(TW *w, const u8 *syms, u32 n, const u32 *cnt) {
  unsigned short f[256]; u32 tot = 0, big = 0, i, len; u8 bm[32]; u8 *tmp; u32 cap = n * 2 + 64;
  for (i = 0; i < 256; i++) f[i] = 0;
  for (i = 0; i < 32; i++) bm[i] = 0;
  for (i = 0; i < 256; i++) if (cnt[i]) { u64 q = ((u64)cnt[i] * 4096u) / n; f[i] = (unsigned short)(q < 1 ? 1 : q); tot += f[i]; if (cnt[i] > cnt[big]) big = i; }
  { i32 fb = (i32)f[big] + 4096 - (i32)tot; if (fb < 1) return 0; f[big] = (unsigned short)fb; }
  for (i = 0; i < 256; i++) if (f[i]) bm[i >> 3] |= (u8)(1u << (i & 7));
  for (i = 0; i < 32; i++) tw_b(w, bm[i]);
  for (i = 0; i < 256; i++) if (f[i]) tw_vi(w, (u32)f[i] - 1);
  tmp = tw_alloc(w, cap); if (!tmp) return 0;
  len = rans_enc(syms, n, f, tmp, cap);
  tw_vi(w, len); for (i = 0; i < len; i++) tw_b(w, tmp[cap - len + i]);
  return 1;
}
static int TWG;                 /* 1 inside the streams of DEC, where DICT has its gate (opt.dictGate in picker.js) */
static void tw_sort(double *t, u32 n) {      /* ascending; insertion sort for short runs, else quicksort on the middle of three */
  while (n > 24) {
    double p, x; u32 i = 0, j = n - 1, m = n >> 1;
    if (t[m] < t[0]) { x = t[m]; t[m] = t[0]; t[0] = x; }
    if (t[j] < t[0]) { x = t[j]; t[j] = t[0]; t[0] = x; }
    if (t[j] < t[m]) { x = t[j]; t[j] = t[m]; t[m] = x; }
    p = t[m];
    for (;;) { while (t[i] < p) i++; while (p < t[j]) j--; if (i >= j) break; x = t[i]; t[i] = t[j]; t[j] = x; i++; j--; }
    if (j + 1 < n - j - 1) { tw_sort(t, j + 1); t += j + 1; n -= j + 1; } else { tw_sort(t + j + 1, n - j - 1); n = j + 1; }
  }
  { u32 i, k; for (i = 1; i < n; i++) { double x = t[i]; k = i; while (k && t[k - 1] > x) { t[k] = t[k - 1]; k--; } t[k] = x; } }
}
static void tw_skip(const u8 **tp) { u32 k = (*tp)[1], i; *tp += 2; for (i = 0; i < k; i++) tw_skip(tp); }
static int tw_node(TW *w, const double *a, u32 n, const u8 **tp, int depth);
/* the ways of enc_tree that are rarer in replays, out of tw_node so its common loop stays small (2.23.0) */
static __attribute__((noinline)) int tw_more(TW *w, const double *a, u32 n, const u8 **tp, int depth, u32 sch, u32 nk, double mn, double mx, u8 *sp0) {
  u32 i;
  if (sch == 3) {       /* DELTA: the first value, then the zigzag differences as one part */
    double *d, y, big = 4294967295.0; double dv[65]; u32 nd = 0, lim, found, k, bwy, bwr; double rg = mx - mn;
    if (depth <= 0 || nk != 1 || n < 4) return 0;
    d = tw_alloc(w, (n - 1) * 8); if (!d) return 0;
    y = delta_enc(a, n, d);
    if (depth < 2) {
      bwy = y <= 0 ? 0 : 32 - (((u32)(u64)y) ? (u32)__builtin_clz((u32)(u64)y) : 32) + (y > big ? 99 : 0);
      bwr = rg <= 0 ? 0 : 32 - (((u32)(u64)rg) ? (u32)__builtin_clz((u32)(u64)rg) : 32) + (rg > big ? 99 : 0);
      if (bwy > bwr) {         /* wider than the values and never repeating: differences cannot help (first 256 differences hold more than 64 different ones) */
        lim = n - 1 < 256 ? n - 1 : 256; found = 0;
        for (i = 0; i < lim && !found; i++) { for (k = 0; k < nd; k++) if (dv[k] == d[i]) break; if (k == nd) { dv[nd++] = d[i]; if (nd > 64) found = 1; } }
        if (found) return 0;
      }
    }
    tw_b(w, 3); tw_zi(w, a[0]);
    if (!tw_node(w, d, n - 1, tp, depth - 1)) return 0;
    return w->bad ? 0 : (w->sp = sp0, 1);
  } else if (sch == 6) {       /* PFOR: the low bits of every value packed, the few that do not fit as positions and high parts */
    u32 hist[34], q, x, bw, cum, np = 0; double *g, *hi; u32 *low; double lim1, pv;
    if (depth <= 0 || nk != 2 || n < 16) return 0;
    for (i = 0; i < 34; i++) hist[i] = 0;
    for (i = 0; i < n; i++) { double xx = a[i] - mn; hist[xx > 4294967295.0 ? 33 : xx <= 0 ? 0 : 32 - (u32)__builtin_clz((u32)xx)]++; }
    q = (u32)(n * 0.92) + 1; cum = 0; for (bw = 0; bw < 33; bw++) { cum += hist[bw]; if (cum >= q) break; }
    if (bw >= 32) return 0;
    x = 0; for (i = bw + 1; i < 34; i++) x += hist[i];
    if (!x) return 0;
    lim1 = (double)((u64)1 << bw);
    low = tw_alloc(w, n * 4); g = tw_alloc(w, x * 8); hi = tw_alloc(w, x * 8); if (!low || !g || !hi) return 0;
    pv = -1;
    for (i = 0; i < n; i++) {
      double xx = a[i] - mn;
      if (xx > lim1 - 1) { double hq = __builtin_floor(xx / lim1); if (np >= x) return 0; g[np] = (double)i - pv - 1; pv = (double)i; hi[np] = hq; np++; low[i] = (u32)(xx - hq * lim1); }
      else low[i] = (u32)xx;
    }
    tw_b(w, 6); tw_zi(w, mn); tw_b(w, bw); tw_vi(w, np); tw_bits(w, low, n, bw);
    if (!tw_node(w, g, np, tp, depth - 1)) return 0;
    if (!tw_node(w, hi, np, tp, depth - 1)) return 0;
    return w->bad ? 0 : (w->sp = sp0, 1);
  } else if (sch == 5) {       /* DICT (since 2.23.0 here): the sorted different values, then each value's place among them, as in picker.js */
    double lim = (double)n / 2, *keys, *codes; u32 m = 0, k;
    if (lim > 65536) lim = 65536;
    if (depth <= 0 || nk != 2) return 0;
    if (TWG && n > 512) {        /* the gate of the DEC streams: more than 160 different values in the first 256 */
      double sv[161]; u32 c = 0, z;
      for (i = 0; i < 256; i++) { for (z = 0; z < c; z++) if (sv[z] == a[i]) break; if (z == c) { if (c == 160) return 0; sv[c++] = a[i]; } }
    }
    if (mx - mn < (65536.0 > n * 16.0 ? 65536.0 : n * 16.0) && mx - mn <= 4.0 * n + 4096) {      /* a table by value only when it is small next to n (clearing it costs); the sorted path gives the same keys and codes */
      u32 rn = (u32)(mx - mn) + 1, *seen = tw_alloc(w, rn * 4);
      if (!seen) return 0;
      for (i = 0; i < rn; i++) seen[i] = 0;
      for (i = 0; i < n; i++) { u32 x = (u32)(a[i] - mn); if (!seen[x]) { seen[x] = 1; if ((double)++m > lim) return 0; } }
      keys = tw_alloc(w, m * 8); codes = tw_alloc(w, n * 8); if (!keys || !codes) return 0;
      for (i = 0, k = 0; i < rn; i++) if (seen[i]) { keys[k] = (double)i + mn; seen[i] = ++k; }
      for (i = 0; i < n; i++) codes[i] = (double)(seen[(u32)(a[i] - mn)] - 1);
    } else {
      double *t = tw_alloc(w, n * 8); u32 lo, hi2, md;
      if (!t) return 0;
      for (i = 0; i < n; i++) t[i] = a[i];
      tw_sort(t, n);
      for (i = 0; i < n; i++) if (!i || t[i] != t[m - 1]) { t[m++] = t[i]; if ((double)m > lim) return 0; }
      keys = t; codes = tw_alloc(w, n * 8); if (!codes) return 0;
      for (i = 0; i < n; i++) { double x = a[i]; lo = 0; hi2 = m; while (lo < hi2) { md = (lo + hi2) >> 1; if (keys[md] < x) lo = md + 1; else hi2 = md; } codes[i] = (double)lo; }
    }
    tw_b(w, 5); tw_vi(w, m);
    if (!tw_node(w, keys, m, tp, depth - 1)) return 0;
    if (!tw_node(w, codes, n, tp, depth - 1)) return 0;
    return w->bad ? 0 : (w->sp = sp0, 1);
  } else if (sch == 7) {       /* DIV: the first value, the common factor of the distances to it, then the distances over it */
    u64 g = 0, x, y, t; double *d, a0 = a[0];
    if (depth <= 0 || nk != 1) return 0;
    for (i = 1; i < n && g != 1; i++) { double dx = a[i] - a0; x = (u64)(dx < 0 ? -dx : dx); y = g; while (y) { t = x % y; x = y; y = t; } g = x; }
    if (g < 2) return 0;
    d = tw_alloc(w, n * 8); if (!d) return 0;
    for (i = 0; i < n; i++) d[i] = (a[i] - a0) / (double)g;
    tw_b(w, 7); tw_zi(w, a0); tw_vi(w, g);
    if (!tw_node(w, d, n, tp, depth - 1)) return 0;
    return w->bad ? 0 : (w->sp = sp0, 1);
  } else if (sch == 12) {      /* LB: each value's place in the list of different values by latest use (0: new), then the new values, as in picker.js */
    u32 sh, sz, msk, q, j = 0, m, nv = 0, tt, lim2; i32 *last, *fw; double *key, *d, *vals; u64 bits;
    if (depth <= 0 || nk != 2 || n < 256 || mx - mn < 65536) return 0;
    m = n < 1024 ? n : 1024;
    last = tw_alloc(w, 2048 * 4); key = tw_alloc(w, 2048 * 8); if (!last || !key) return 0;
    for (i = 0; i < 2048; i++) last[i] = -1;
    for (i = 0; i < m; i++) {
      double x = a[i]; __builtin_memcpy(&bits, &x, 8); q = (u32)((bits * 0x9E3779B97F4A7C15ull) >> 53);
      while (last[q] >= 0 && key[q] != x) q = (q + 1) & 2047;
      if (last[q] >= 0) { if (x != a[i - 1]) j++; } else { last[q] = 1; key[q] = x; }
    }
    if (j * 3 < m) return 0;
    sh = 32 - (u32)__builtin_clz(n * 2 - 1); sz = 1u << sh; msk = sz - 1;
    last = tw_alloc(w, sz * 4); key = tw_alloc(w, sz * 8); fw = tw_alloc(w, (n + 1) * 4); d = tw_alloc(w, n * 8); vals = tw_alloc(w, n * 8);
    if (!last || !key || !fw || !d || !vals) return 0;
    for (i = 0; i < sz; i++) last[i] = -1;
    for (i = 0; i <= n; i++) fw[i] = 0;
    for (i = 0; i < n; i++) {
      double x = a[i]; i32 yy; __builtin_memcpy(&bits, &x, 8); q = (u32)((bits * 0x9E3779B97F4A7C15ull) >> (64 - sh)) & msk;
      while ((yy = last[q]) >= 0 && key[q] != x) q = (q + 1) & msk;
      if (yy < 0) { vals[nv++] = x; key[q] = x; d[i] = 0; }
      else {
        i32 cnt = 0; tt = (u32)yy + 1; lim2 = i;
        while (tt != lim2) { if (lim2 > tt) { cnt += fw[lim2]; lim2 -= lim2 & (0u - lim2); } else { cnt -= fw[tt]; tt -= tt & (0u - tt); } }
        d[i] = (double)(cnt + 1);
        for (tt = (u32)yy + 1; tt <= n; tt += tt & (0u - tt)) fw[tt]--;
      }
      for (tt = i + 1; tt <= n; tt += tt & (0u - tt)) fw[tt]++;
      last[q] = (i32)i;
    }
    if ((u64)nv * 5 > (u64)n * 3) return 0;
    tw_b(w, 12); tw_vi(w, nv);
    if (!tw_node(w, d, n, tp, depth - 1)) return 0;
    if (!tw_node(w, vals, nv, tp, depth - 1)) return 0;
    return w->bad ? 0 : (w->sp = sp0, 1);
  }
  return 0;
}
static int tw_node(TW *w, const double *a, u32 n, const u8 **tp, int depth) {
  u32 sch = (*tp)[0], nk = (*tp)[1], i; double mn, mx; const u8 *t0 = *tp; u8 *sp0 = w->sp; int ok = 0;
  *tp += 2;
  if (sch == 13) {             /* ALT (since 2.23.0): the first tree if it applies at every level, else the second; picker.js does the same */
    u8 *p0 = w->p; const u8 *t1 = *tp;
    if (nk != 2) return 0;
    if (tw_node(w, a, n, tp, depth) && !w->bad) { tw_skip(tp); return 1; }
    w->p = p0; w->sp = sp0; w->bad = 0; *tp = t1; tw_skip(tp);
    return tw_node(w, a, n, tp, depth);
  }
  if (n == 0) return 0;
  mn = mx = a[0];
  for (i = 1; i < n; i++) { double v = a[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  (void)t0;
  if (sch == 1) { if (mn != mx || nk) return 0; tw_b(w, 1); tw_zi(w, mn); ok = 1; }
  else if (sch == 2) {
    double rng = mx - mn; u32 bw; u32 *v;
    if (rng > 4294967295.0 || nk) return 0;
    bw = tw_bw(rng); tw_b(w, 2); tw_zi(w, mn); tw_b(w, bw);
    if (bw) { v = tw_alloc(w, n * 4); if (!v) return 0; for (i = 0; i < n; i++) v[i] = (u32)(long long)(a[i] - mn); tw_bits(w, v, n, bw); }
    ok = 1;
  } else if (sch == 8) {
    double rng = mx - mn; u32 bw, sh, mask; u8 *syms; u32 *low; u32 cnt[256];
    if (rng >= 549755813888.0 || n < 64 || nk) return 0;
    bw = tw_bw(rng); sh = bw > 8 ? bw - 8 : 0; mask = sh ? (0xFFFFFFFFu >> (32 - sh)) : 0;
    syms = tw_alloc(w, n); low = tw_alloc(w, n * 4); if (!syms || !low) return 0;
    for (i = 0; i < 256; i++) cnt[i] = 0;
    for (i = 0; i < n; i++) { u64 x = (u64)(a[i] - mn); u32 y = (u32)(x >> sh); syms[i] = (u8)y; low[i] = (u32)x & mask; cnt[y & 255]++; }
    tw_b(w, 8); tw_zi(w, mn); tw_b(w, sh);
    if (!tw_ans(w, syms, n, cnt)) return 0;
    tw_bits(w, low, n, sh); ok = 1;
  } else if (sch == 9) {
    u8 *syms; u32 *o; u32 cnt[256], bitsK, k; double m1 = -mn > mx ? -mn : mx;
    if (n < 64 || !(m1 < 2251799813685248.0) || nk) return 0;
    syms = tw_alloc(w, n); o = tw_alloc(w, (n * 2 + 2) * 4); if (!syms || !o) return 0;
    bitsK = eg_enc(a, n, syms, cnt, o);
    tw_b(w, 9);
    if (!tw_ans(w, syms, n, cnt)) return 0;
    k = (bitsK + 7) / 8; for (i = 0; i < k; i++) tw_b(w, ((const u8 *)o)[i]);
    ok = 1;
  } else if (sch == 3 || sch == 5 || sch == 6 || sch == 7 || sch == 12) {
    return tw_more(w, a, n, tp, depth, sch, nk, mn, mx, sp0);
  } else if (sch == 4) {
    double *vals, *runs; u32 j = 1, m = 0, p; 
    if (depth <= 0 || nk != 2) return 0;
    for (i = 1; i < n; i++) if (a[i] != a[i - 1] && ++j * 2 > n) return 0;
    if (j * 2 > n) return 0;
    vals = tw_alloc(w, j * 8); runs = tw_alloc(w, j * 8); if (!vals || !runs) return 0;
    i = 0; while (i < n) { p = i + 1; while (p < n && a[p] == a[i]) p++; vals[m] = a[i]; runs[m] = (double)(p - i - 1); m++; i = p; }
    tw_b(w, 4); tw_vi(w, m);
    if (!tw_node(w, vals, m, tp, depth - 1)) return 0;
    if (!tw_node(w, runs, m, tp, depth - 1)) return 0;
    return w->bad ? 0 : (w->sp = sp0, 1);
  } else if (sch == 11) {      /* DELTA2 (since 2.21.0): the second differences, with the same smoothness check as picker.js */
    double *d, m1 = -mn > mx ? -mn : mx;
    if (depth <= 0 || nk != 1 || n < 16 || !(m1 < 1125899906842624.0)) return 0;
    d = tw_alloc(w, n * 8); if (!d) return 0;
    if (delta2_enc(a, n, d) + (double)(n - 2) * 0.35 > 0) return 0;
    tw_b(w, 11); tw_zi(w, a[0]); tw_zi(w, a[1] - a[0]);
    if (!tw_node(w, d, n - 2, tp, depth - 1)) return 0;
    return w->bad ? 0 : (w->sp = sp0, 1);
  } else if (sch == 10) {
    double *g, *d; u32 j = 0, m = n < 256 ? n : 256, q = 0;
    double m1 = -mn > mx ? -mn : mx;
    if (depth <= 0 || nk != 2 || n < 16 || !(m1 < 2251799813685248.0)) return 0;
    for (i = 0; i < m; i++) { double x = a[i]; if (x != 0 && __builtin_floor(x / 10) * 10 == x) j++; }
    if (j * 16 < m) return 0;
    d = tw_alloc(w, n * 8); g = tw_alloc(w, n * 8); if (!d || !g) return 0;
    q = dec_split(a, n, d, g);
    if (q * 8 < n) return 0;
    tw_b(w, 10);
    { int svg = TWG, ok2; TWG = 1; ok2 = tw_node(w, g, n, tp, depth - 1) && tw_node(w, d, n, tp, depth - 1); TWG = svg; if (!ok2) return 0; }
    return w->bad ? 0 : (w->sp = sp0, 1);
  }
  if (!ok) return 0;
  w->sp = sp0; return w->bad ? 0 : 1;
}
EXPORT u32 enc_tree(const double *a, u32 n, const u8 *tree, u8 *out, u32 cap, u8 *scratch, u32 scap, u32 depth) {
  TW w; const u8 *tp = tree;
  w.p = out; w.end = out + cap; w.sp = scratch; w.send = scratch + scap; w.bad = 0; TWG = (int)(depth >> 8); depth &= 255;
  if (!tw_node(&w, a, n, &tp, (int)depth) || w.bad) return 0;
  return (u32)(w.p - out);
}

/* ---- enc_search (since 2.23.0): the search of encIntsFull in src/picker.js (every way of the order, the smallest wins, the parts of a way searched the same way), in one call,
 * with the same bytes and the same tree of ways. JavaScript keeps the cases this does not do: the top level when it chooses its way on a sample (more than 4,096 numbers with
 * opts.sample; levels below it do that here) and the ways that won before (opts.prefer); the call then answers SE_BAIL and JavaScript does that level itself. */
typedef struct { u8 ord[16]; u32 nord; int has, gate, noent, samp, prefer, rec; } SO;
static const u8 ORD_INT[13] = {1, 2, 11, 3, 4, 5, 12, 6, 7, 8, 9, 10, 0}, ORD_LB[6] = {1, 2, 3, 7, 8, 9}, ORD_D2[1] = {9}, ORD_DEC0[5] = {1, 2, 8, 4, 5}, ORD_DEC1[5] = {2, 6, 5, 8, 9};
#define SE_BAIL 0xFFFFFFFFu
static u8 *GSP, *GEND;            /* the scratch space of one call: taken from the bottom, given back in order */
static i32 SE_DW[2]; static u32 SE_DT;      /* the way each stream of DEC took last (opts.decWon, -1: none yet), and which of the two were written in this call */
static void *g_alloc(u32 bytes) { u8 *r = GSP; bytes = (bytes + 15) & ~15u; if (GSP + bytes > GEND) return 0; GSP += bytes; return r; }
static SO SO_UP;                  /* the options of the level whose DEC is writing its streams (decPick tries the last way with those) */
static void so_set(SO *s, const u8 *o, u32 n) { u32 i; for (i = 0; i < n; i++) s->ord[i] = o[i]; s->nord = n; s->has = 1; }
/* log2 with + - * / only, so JavaScript (lg2d in picker.js) gets the same double: v halved or doubled into [0.707, 1.414), then the atanh series */
static double lg2d(double v) {
  double e, s, s2; u64 b;
  __builtin_memcpy(&b, &v, 8); e = (double)((i32)((b >> 52) & 2047) - 1023); b = (b & 0x800FFFFFFFFFFFFFull) | 0x3FF0000000000000ull; __builtin_memcpy(&v, &b, 8);
  if (v >= 1.4142135623730951) { v /= 2; e += 1; }
  s = (v - 1) / (v + 1); s2 = s * s;
  return e + s * (2 + s2 * (0.6666666666666666 + s2 * (0.4 + s2 * (0.2857142857142857 + s2 * (0.2222222222222222 + s2 * (0.18181818181818182 + s2 * 0.15384615384615385)))))) * 1.4426950408889634;
}
static u32 se_search(const double *a, u32 n, int depth, const SO *so, u8 **ob, u32 *ol, u8 **tb, u32 *tl);
/* one part of a way: searched, then its bytes and tree appended; 1, or 0 when the part cannot be written, or -1 to give the level back to JavaScript */
static int se_way(TW *w, u8 *t, u32 *tn, u32 sch, const double *a, u32 n, int depth, const SO *so, double bound, double mn, double mx);
static u32 se_one(u32 way, const double *a, u32 n, int depth, const SO *so, double bound, u8 **ob, u32 *ol, u8 **tb, u32 *tl) {      /* one way into a buffer of its own: length, 0, or SE_BAIL */
  double mn, mx; TW w; u8 *ct, *cb; u32 capw = n * 8 + 64, i; int r;
  if (!n) return 0;
  mn = mx = a[0]; for (i = 1; i < n; i++) { double v = a[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  ct = g_alloc(128); cb = g_alloc(capw); if (!ct || !cb) return SE_BAIL;
  { u8 *mk = GSP;
  w.p = cb; w.end = cb + capw; w.sp = GSP; w.send = GEND; w.bad = 0;
  r = se_way(&w, ct, tl, way, a, n, depth, so, bound, mn, mx);
  GSP = mk; }
  if (r < 0) return SE_BAIL;
  if (!r || w.bad) return 0;
  *ob = cb; *tb = ct; *ol = (u32)(w.p - cb);
  return *ol;
}
static int se_part(TW *w, u8 *t, u32 *tn, const double *p, u32 m, int depth, const SO *so, i32 *won) {
  u8 *mk = w->sp, *b, *tt; u32 bl, tl, r = 0, i;
  GSP = mk;
  if (won && so->prefer && !so->rec && *won >= 0) {          /* decPick: on a block that uses the ways that won before, the way this stream took last is tried first (with the order of the level above) */
    SO s0 = *so; s0.gate = SO_UP.gate; s0.has = SO_UP.has; s0.nord = SO_UP.nord; for (i = 0; i < SO_UP.nord; i++) s0.ord[i] = SO_UP.ord[i];
    r = se_one((u32)*won, p, m, depth, &s0, 0, &b, &bl, &tt, &tl);
    if (r == SE_BAIL) return -1;
    if (!r) GSP = mk;
  }
  if (!r) r = se_search(p, m, depth, so, &b, &bl, &tt, &tl);
  if (r == SE_BAIL) return -1;
  if (!r) { GSP = mk; return 0; }
  if (won) { *won = b[0]; SE_DT |= won == &SE_DW[0] ? 1 : 2; }
  for (i = 0; i < bl; i++) tw_b(w, b[i]);
  if (*tn + tl > 120) { GSP = mk; return 0; }
  for (i = 0; i < tl; i++) t[(*tn)++] = tt[i];
  GSP = mk; w->sp = mk;
  return w->bad ? 0 : 1;
}
#define PART(p, m, so2, won) do { int q_ = se_part(w, t, tn, p, m, depth - 1, so2, won); if (q_ < 0) return -1; if (!q_) return 0; } while (0)
/* one way, as encIntWith: 1 (bytes in w, tree in t), 0 when it does not apply, -1 to give the level back */
static int se_way(TW *w, u8 *t, u32 *tn, u32 sch, const double *a, u32 n, int depth, const SO *so, double bound, double mn, double mx) {
  u32 i; double m1 = -mn > mx ? -mn : mx;
  *tn = 2; t[0] = (u8)sch; t[1] = 0;
  if (sch == 0) { tw_b(w, 0); for (i = 0; i < n; i++) { u64 u; double v = a[i]; u32 k; __builtin_memcpy(&u, &v, 8); for (k = 0; k < 8; k++) tw_b(w, (u32)(u >> (8 * k)) & 255); } return w->bad ? 0 : 1; }
  if (sch == 1) { if (mn != mx) return 0; tw_b(w, 1); tw_zi(w, mn); return w->bad ? 0 : 1; }
  if (sch == 2) {
    double rng = mx - mn; u32 bw, *v;
    if (rng > 4294967295.0) return 0;
    bw = tw_bw(rng); tw_b(w, 2); tw_zi(w, mn); tw_b(w, bw);
    if (bw) { v = tw_alloc(w, n * 4); if (!v) return 0; for (i = 0; i < n; i++) v[i] = (u32)(long long)(a[i] - mn); tw_bits(w, v, n, bw); }
    return w->bad ? 0 : 1;
  }
  if (sch == 8) {
    double rng = mx - mn; u32 bw, sh, mask, cnt[256]; u8 *syms; u32 *low;
    if (rng >= 549755813888.0 || n < 64) return 0;
    bw = tw_bw(rng); sh = bw > 8 ? bw - 8 : 0; mask = sh ? (0xFFFFFFFFu >> (32 - sh)) : 0;
    if (bound != 0 && (double)n * sh / 8 > bound) return 0;
    syms = tw_alloc(w, n); low = tw_alloc(w, n * 4); if (!syms || !low) return 0;
    for (i = 0; i < 256; i++) cnt[i] = 0;
    for (i = 0; i < n; i++) { u64 x = (u64)(a[i] - mn); u32 y = (u32)(x >> sh); syms[i] = (u8)y; low[i] = (u32)x & mask; cnt[y & 255]++; }
    if (bound != 0) {
      double x = 0, y = 0;
      for (i = 0; i < 256; i++) if (cnt[i]) { y++; x -= cnt[i] * lg2d((double)cnt[i] / n); }
      if (x / 8 + y * 0.5 + (double)n * sh / 8 > bound) return 0;
    }
    tw_b(w, 8); tw_zi(w, mn); tw_b(w, sh);
    if (!tw_ans(w, syms, n, cnt)) return 0;
    tw_bits(w, low, n, sh); return w->bad ? 0 : 1;
  }
  if (sch == 9) {
    u8 *syms; u32 *o, cnt[256], bitsK, k;
    if (n < 64 || !(m1 < 2251799813685248.0)) return 0;
    syms = tw_alloc(w, n); o = tw_alloc(w, (n * 2 + 2) * 4); if (!syms || !o) return 0;
    bitsK = eg_enc(a, n, syms, cnt, o);
    tw_b(w, 9);
    if (!tw_ans(w, syms, n, cnt)) return 0;
    k = (bitsK + 7) / 8; for (i = 0; i < k; i++) tw_b(w, ((const u8 *)o)[i]);
    return w->bad ? 0 : 1;
  }
  if (depth <= 0) return 0;
  if (sch == 10) {             /* DEC: zeros and the rest, each stream searched with its own short order (decPick) */
    double *g, *d; u32 j = 0, m = n < 256 ? n : 256, q; SO s2;
    if (n < 16 || !(m1 < 2251799813685248.0)) return 0;
    for (i = 0; i < m; i++) { double x = a[i]; if (x != 0 && __builtin_floor(x / 10) * 10 == x) j++; }
    if (j * 16 < m) return 0;
    d = tw_alloc(w, n * 8); g = tw_alloc(w, n * 8); if (!d || !g) return 0;
    q = dec_split(a, n, d, g);
    if (q * 8 < n) return 0;
    tw_b(w, 10); t[1] = 2;
    SO_UP = *so; s2 = *so; s2.gate = 1; so_set(&s2, ORD_DEC0, 5); PART(g, n, &s2, &SE_DW[0]);
    SO_UP = *so; s2 = *so; s2.gate = 1; so_set(&s2, ORD_DEC1, 5); PART(d, n, &s2, &SE_DW[1]);
    return 1;
  }
  if (sch == 12) {             /* LB, as picker.js (its table is only for finding values; any hash gives the same places) */
    u32 sh, sz, msk, q, j = 0, m, nv = 0, tt, lim2; i32 *last, *fw; double *key, *d, *vals; u64 bits; SO s2;
    if (n < 256 || mx - mn < 65536) return 0;
    m = n < 1024 ? n : 1024;
    last = tw_alloc(w, 2048 * 4); key = tw_alloc(w, 2048 * 8); if (!last || !key) return 0;
    for (i = 0; i < 2048; i++) last[i] = -1;
    for (i = 0; i < m; i++) {
      double x = a[i]; __builtin_memcpy(&bits, &x, 8); q = (u32)((bits * 0x9E3779B97F4A7C15ull) >> 53);
      while (last[q] >= 0 && key[q] != x) q = (q + 1) & 2047;
      if (last[q] >= 0) { if (x != a[i - 1]) j++; } else { last[q] = 1; key[q] = x; }
    }
    if (j * 3 < m) return 0;
    sh = 32 - (u32)__builtin_clz(n * 2 - 1); sz = 1u << sh; msk = sz - 1;
    last = tw_alloc(w, sz * 4); key = tw_alloc(w, sz * 8); fw = tw_alloc(w, (n + 1) * 4); d = tw_alloc(w, n * 8); vals = tw_alloc(w, n * 8);
    if (!last || !key || !fw || !d || !vals) return 0;
    for (i = 0; i < sz; i++) last[i] = -1;
    for (i = 0; i <= n; i++) fw[i] = 0;
    for (i = 0; i < n; i++) {
      double x = a[i]; i32 yy; __builtin_memcpy(&bits, &x, 8); q = (u32)((bits * 0x9E3779B97F4A7C15ull) >> (64 - sh)) & msk;
      while ((yy = last[q]) >= 0 && key[q] != x) q = (q + 1) & msk;
      if (yy < 0) { vals[nv++] = x; key[q] = x; d[i] = 0; }
      else {
        i32 cnt = 0; tt = (u32)yy + 1; lim2 = i;
        while (tt != lim2) { if (lim2 > tt) { cnt += fw[lim2]; lim2 -= lim2 & (0u - lim2); } else { cnt -= fw[tt]; tt -= tt & (0u - tt); } }
        d[i] = (double)(cnt + 1);
        for (tt = (u32)yy + 1; tt <= n; tt += tt & (0u - tt)) fw[tt]--;
      }
      for (tt = i + 1; tt <= n; tt += tt & (0u - tt)) fw[tt]++;
      last[q] = (i32)i;
    }
    if ((u64)nv * 5 > (u64)n * 3) return 0;
    tw_b(w, 12); tw_vi(w, nv); t[1] = 2;
    s2 = *so; if (!s2.has) so_set(&s2, ORD_LB, 6);
    PART(d, n, &s2, 0); PART(vals, nv, &s2, 0);
    return 1;
  }
  if (sch == 11) {             /* DELTA2: the smoothness check as picker.js does it (the helper's sum from 1,024 numbers, the JavaScript sum below) */
    double *d, x, tt0; SO s2;
    if (n < 16 || !(m1 < 1125899906842624.0)) return 0;
    d = tw_alloc(w, n * 8); if (!d) return 0;
    tt0 = a[1] - a[0];
    if (n >= 1024) { x = delta2_enc(a, n, d); if (x + (double)(n - 2) * 0.35 > 0) return 0; }
    else {
      double hi = 0, lo = 0, y, j; x = tt0;
      for (i = 2; i < n; i++) { y = a[i] - a[i - 1]; j = y - x; x = y; hi += (double)bl64(j); lo += (double)bl64(x); d[i - 2] = j; }
      if (hi + (double)n * 0.35 > lo) return 0;
    }
    tw_b(w, 11); tw_zi(w, a[0]); tw_zi(w, tt0); t[1] = 1;
    s2 = *so; if (!s2.has) so_set(&s2, ORD_D2, 1);
    PART(d, n - 2, &s2, 0);
    return 1;
  }
  if (sch == 3) {
    double *d, y, big = 4294967295.0, dv[65]; u32 nd = 0, lim, found, k, bwy, bwr; double rg = mx - mn;
    if (n < 4) return 0;
    d = tw_alloc(w, (n - 1) * 8); if (!d) return 0;
    y = delta_enc(a, n, d);
    if (depth < 2) {
      bwy = y <= 0 ? 0 : 32 - (((u32)(u64)y) ? (u32)__builtin_clz((u32)(u64)y) : 32) + (y > big ? 99 : 0);
      bwr = rg <= 0 ? 0 : 32 - (((u32)(u64)rg) ? (u32)__builtin_clz((u32)(u64)rg) : 32) + (rg > big ? 99 : 0);
      if (bwy > bwr) {
        lim = n - 1 < 256 ? n - 1 : 256; found = 0;
        for (i = 0; i < lim && !found; i++) { for (k = 0; k < nd; k++) if (dv[k] == d[i]) break; if (k == nd) { dv[nd++] = d[i]; if (nd > 64) found = 1; } }
        if (found) return 0;
      }
    }
    tw_b(w, 3); tw_zi(w, a[0]); t[1] = 1;
    PART(d, n - 1, so, 0);
    return 1;
  }
  if (sch == 7) {
    u64 g = 0, x, y, tq; double *d, a0 = a[0];
    for (i = 1; i < n && g != 1; i++) { double dx = a[i] - a0; x = (u64)(dx < 0 ? -dx : dx); y = g; while (y) { tq = x % y; x = y; y = tq; } g = x; }
    if (g < 2) return 0;
    d = tw_alloc(w, n * 8); if (!d) return 0;
    for (i = 0; i < n; i++) d[i] = (a[i] - a0) / (double)g;
    tw_b(w, 7); tw_zi(w, a0); tw_vi(w, g); t[1] = 1;
    PART(d, n, so, 0);
    return 1;
  }
  if (sch == 4) {
    double *vals, *runs; u32 j = 1, m = 0, p;
    for (i = 1; i < n; i++) if (a[i] != a[i - 1] && ++j * 2 > n) return 0;
    if (n && j * 2 > n) return 0;
    vals = tw_alloc(w, j * 8); runs = tw_alloc(w, j * 8); if (!vals || !runs) return 0;
    i = 0; while (i < n) { p = i + 1; while (p < n && a[p] == a[i]) p++; vals[m] = a[i]; runs[m] = (double)(p - i - 1); m++; i = p; }
    tw_b(w, 4); tw_vi(w, m); t[1] = 2;
    PART(vals, m, so, 0); PART(runs, m, so, 0);
    return 1;
  }
  if (sch == 5) {
    double lim = (double)n / 2, *keys, *codes; u32 m = 0, k;
    if (lim > 65536) lim = 65536;
    if (so->gate && n > 512) {
      double sv[161]; u32 c = 0, z;
      for (i = 0; i < 256; i++) { for (z = 0; z < c; z++) if (sv[z] == a[i]) break; if (z == c) { if (c == 160) return 0; sv[c++] = a[i]; } }
    }
    if (mx - mn < (65536.0 > n * 16.0 ? 65536.0 : n * 16.0) && mx - mn <= 4.0 * n + 4096) {      /* a table by value only when it is small next to n (clearing it costs); the sorted path gives the same keys and codes */
      u32 rn = (u32)(mx - mn) + 1, *seen = tw_alloc(w, rn * 4);
      if (!seen) return 0;
      for (i = 0; i < rn; i++) seen[i] = 0;
      for (i = 0; i < n; i++) { u32 x = (u32)(a[i] - mn); if (!seen[x]) { seen[x] = 1; if ((double)++m > lim) return 0; } }
      keys = tw_alloc(w, m * 8); codes = tw_alloc(w, n * 8); if (!keys || !codes) return 0;
      for (i = 0, k = 0; i < rn; i++) if (seen[i]) { keys[k] = (double)i + mn; seen[i] = ++k; }
      for (i = 0; i < n; i++) codes[i] = (double)(seen[(u32)(a[i] - mn)] - 1);
    } else {
      double *tt = tw_alloc(w, n * 8); u32 lo, hi2, md;
      if (!tt) return 0;
      for (i = 0; i < n; i++) tt[i] = a[i];
      tw_sort(tt, n);
      for (i = 0; i < n; i++) if (!i || tt[i] != tt[m - 1]) { tt[m++] = tt[i]; if ((double)m > lim) return 0; }
      keys = tt; codes = tw_alloc(w, n * 8); if (!codes) return 0;
      for (i = 0; i < n; i++) { double x = a[i]; lo = 0; hi2 = m; while (lo < hi2) { md = (lo + hi2) >> 1; if (keys[md] < x) lo = md + 1; else hi2 = md; } codes[i] = (double)lo; }
    }
    tw_b(w, 5); tw_vi(w, m); t[1] = 2;
    PART(keys, m, so, 0); PART(codes, n, so, 0);
    return 1;
  }
  if (sch == 6) {
    u32 hist[34], q, x, bw, cum, np = 0; double *g, *hi; u32 *low; double lim1, pv;
    if (n < 16) return 0;
    for (i = 0; i < 34; i++) hist[i] = 0;
    for (i = 0; i < n; i++) { double xx = a[i] - mn; hist[xx > 4294967295.0 ? 33 : xx <= 0 ? 0 : 32 - (u32)__builtin_clz((u32)xx)]++; }
    q = (u32)((double)n * 0.92) + 1; cum = 0; for (bw = 0; bw < 33; bw++) { cum += hist[bw]; if (cum >= q) break; }
    if (bound != 0 && (double)(((u64)n * bw + 7) / 8) >= bound) return 0;
    if (bw >= 32) return 0;
    x = 0; for (i = bw + 1; i < 34; i++) x += hist[i];
    if (!x) return 0;
    lim1 = (double)((u64)1 << bw);
    low = tw_alloc(w, n * 4); g = tw_alloc(w, x * 8); hi = tw_alloc(w, x * 8); if (!low || !g || !hi) return 0;
    pv = -1;
    for (i = 0; i < n; i++) {
      double xx = a[i] - mn;
      if (xx > lim1 - 1) { double hq = __builtin_floor(xx / lim1); if (np >= x) return 0; g[np] = (double)i - pv - 1; pv = (double)i; hi[np] = hq; np++; low[i] = (u32)(xx - hq * lim1); }
      else low[i] = (u32)xx;
    }
    tw_b(w, 6); tw_zi(w, mn); tw_b(w, bw); tw_vi(w, np); tw_bits(w, low, n, bw); t[1] = 2;
    PART(g, np, so, 0); PART(hi, np, so, 0);
    return 1;
  }
  return 0;
}
/* the search of one level: every way of the order, the smallest bytes win (the first of equal ones), plain doubles only when nothing is smaller. Answers the length (0: none), or SE_BAIL. */
static u32 se_search(const double *a, u32 n, int depth, const SO *so, u8 **ob, u32 *ol, u8 **tb, u32 *tl) {
  u32 cap = n * 8 + 64, i, bl = 0, btl = 0, ctl, d2 = 0, have = 0; double mn, mx; u8 *bb, *cb, *bt, *ct, *x; TW w; int r;
  if (n == 0) return 0;
  { u32 nf = so->nord; for (i = 0; i < so->nord; i++) if (so->ord[i] == 8 && so->noent) nf--;
  if (so->samp && n > 4096 && nf > 1) {      /* since 2.23.0 here (below the top level): the way is chosen on a sample, as sampleOf and encIntsFull in picker.js */
    u32 sl = (u32)((double)n * 0.25 / 4), k, j, ns, pick = 255, sd2 = 0, hasfs = 0, bl2, tl2, r; double bs = 1e18, fs = 0, *s; u8 *mk0 = GSP, *b, *tt; SO sub; i32 dw0 = SE_DW[0], dw1 = SE_DW[1]; u32 dt = SE_DT;
    if (sl < 64) sl = 64;
    ns = sl * 4; s = g_alloc(ns * 8); if (!s) return SE_BAIL;
    for (k = 0; k < 4; k++) { u32 from = (u32)((double)(n - sl) * (double)k / 3); for (j = 0; j < sl; j++) s[k * sl + j] = a[from + j]; }
    for (j = 0; j < 13; j++) sub.ord[j] = ORD_INT[j];
    sub.nord = 13; sub.has = 0; sub.gate = 0; sub.noent = so->noent; sub.samp = 0; sub.prefer = 0; sub.rec = 0;
    for (i = 0; i < so->nord; i++) {
      u32 sch = so->ord[i]; u8 *mk = GSP;
      if (sch == 0 || (sch == 3 && sd2) || ((sch == 5 || sch == 7 || sch == 12 || sch == 11) && depth < 2 && !so->has) || (sch == 8 && so->noent)) continue;
      r = se_one(sch, s, ns, depth, &sub, bs < 1e18 ? bs : 0, &b, &bl2, &tt, &tl2);
      GSP = mk;
      if (r == SE_BAIL) { SE_DW[0] = dw0; SE_DW[1] = dw1; SE_DT = dt; return SE_BAIL; }
      if (r && sch == 11) sd2 = 1;
      if (r && (double)r < bs) { bs = r; pick = sch; }
      if (sd2 && sch == 11 && hasfs && bs < fs * 0.8) break;
      if (sch == 2 && r) { fs = r; hasfs = 1; }
    }
    SE_DW[0] = dw0; SE_DW[1] = dw1; SE_DT = dt; GSP = mk0;      /* what the sample's DEC streams wrote down is thrown away, as the sub options in picker.js are */
    if (pick != 255) {
      r = se_one(pick, a, n, depth, so, 0, &b, &bl2, &tt, &tl2);
      if (r == SE_BAIL) return SE_BAIL;
      if (r) {
        u32 haslb = 0;
        for (i = 0; i < so->nord; i++) if (so->ord[i] == 12) haslb = 1;
        if (pick != 12 && haslb) {
          u8 *b2, *t2; u32 bl3, tl3, r2 = se_one(12, a, n, depth, so, (double)r * 2, &b2, &bl3, &t2, &tl3);
          if (r2 == SE_BAIL) return SE_BAIL;
          if (r2 && r2 < r) { b = b2; tt = t2; r = r2; tl2 = tl3; }
        }
        *ob = b; *ol = r; *tb = tt; *tl = tl2;
        return r;
      }
      GSP = mk0;
    }
  } }
  mn = mx = a[0]; for (i = 1; i < n; i++) { double v = a[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  bb = g_alloc(cap); cb = g_alloc(cap); bt = g_alloc(128); ct = g_alloc(128);
  if (!bb || !cb || !bt || !ct) return SE_BAIL;
  for (i = 0; i <= so->nord; i++) {
    u32 sch; u8 *mk = GSP;
    if (i == so->nord) { if (have && bl <= (double)n * 8) break; sch = 0; }      /* plain doubles last, only when nothing else is smaller */
    else {
      sch = so->ord[i];
      if (sch == 0 || (sch == 3 && d2) || ((sch == 5 || sch == 7 || sch == 12 || sch == 11) && depth < 2 && !so->has) || (sch == 8 && so->noent)) continue;
    }
    w.p = cb; w.end = cb + cap; w.sp = GSP; w.send = GEND; w.bad = 0;
    r = se_way(&w, ct, &ctl, sch, a, n, depth, so, have ? (double)bl : 0, mn, mx);
    GSP = mk;
    if (r < 0) return SE_BAIL;
    if (r && !w.bad) {
      u32 len = (u32)(w.p - cb);
      if (sch == 11) d2 = 1;
      if (!have || len < bl) { x = bb; bb = cb; cb = x; x = bt; bt = ct; ct = x; bl = len; btl = ctl; have = 1; }
    }
  }
  if (!have) return 0;
  *ob = bb; *ol = bl; *tb = bt; *tl = btl;
  return bl;
}
/* JavaScript entry: way 255 searches every way of ord (encIntsFull), another number runs that one way with its parts searched (runWay; bound as there).
 * flags: 1 opts.order given, 2 dictGate, 4 noEntropy, 8 sample, 16 prefer, 32 the tree is written down (REC). dw: in/out the last way of each DEC stream (opts.decWon, -1 when none), dw[3] out: which were written. Answers the length (bytes in out, tree in tree and its length in dw[2]),
 * 0 when the way does not apply, or SE_BAIL. */
EXPORT u32 enc_search(const double *a, u32 n, u32 depth, const u8 *ord, u32 nord, u32 flags, u32 way, double bound, u8 *out, u32 cap, u8 *tree, u8 *arena, u32 acap, i32 *dw) {
  SO so; u32 i, len, tl = 0; u8 *b = 0, *tt = 0;
  if (nord > 16) return SE_BAIL;
  for (i = 0; i < nord; i++) so.ord[i] = ord[i];
  so.nord = nord; so.has = flags & 1; so.gate = (flags >> 1) & 1; so.noent = (flags >> 2) & 1; so.samp = (flags >> 3) & 1; so.prefer = (flags >> 4) & 1; so.rec = (flags >> 5) & 1;
  GSP = arena; GEND = arena + acap; SE_DW[0] = dw[0]; SE_DW[1] = dw[1]; SE_DT = 0;
  if (way == 255) {
    len = se_search(a, n, (int)depth, &so, &b, &len, &tt, &tl);
    if (len == SE_BAIL || !len) { dw[0] = SE_DW[0]; dw[1] = SE_DW[1]; dw[3] = (i32)SE_DT; return len; }
  } else {
    double mn, mx; TW w; u8 *ct = g_alloc(128); u8 *cb; u32 capw = n * 8 + 64; int r;
    if (!n) return 0;
    mn = mx = a[0]; for (i = 1; i < n; i++) { double v = a[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    cb = g_alloc(capw); if (!ct || !cb) return SE_BAIL;
    w.p = cb; w.end = cb + capw; w.sp = GSP; w.send = GEND; w.bad = 0;
    r = se_way(&w, ct, &tl, way, a, n, (int)depth, &so, bound, mn, mx);
    dw[0] = SE_DW[0]; dw[1] = SE_DW[1]; dw[3] = (i32)SE_DT;
    if (r < 0) return SE_BAIL;
    if (!r || w.bad) return 0;
    b = cb; tt = ct; len = (u32)(w.p - cb);
  }
  if (len > cap) return SE_BAIL;
  for (i = 0; i < len; i++) out[i] = b[i];
  for (i = 0; i < tl; i++) tree[i] = tt[i];
  dw[0] = SE_DW[0]; dw[1] = SE_DW[1]; dw[2] = (i32)tl; dw[3] = (i32)SE_DT;
  return len;
}

/* ---- fdict_map (since 2.23.0): the dictionary of a block of doubles for encFDict in picker.js: keys in first-seen order (by bit pattern, so -0 is its own key) and each value's code.
 * Returns the number of keys; -2 when encFDict gives up (a sample of every step-th value is 95% different, or more than lim keys); -3 when a NaN is in the block (JavaScript then does it).
 * tab: 2 * size words of scratch, size a power of two at least 2 * n. */
EXPORT int fdict_map(const double *a, u32 n, u32 step, double lim, double *keys, double *codes, u64 *tab, u32 size) {
  u32 i, m = 0, msk = size - 1, q, cnt = 0, *code = (u32 *)(tab + size);
  for (i = 0; i < size; i++) code[i] = 0;
  if (step) {                            /* the sampled values first (the table is then cleared) */
    u32 ns = 0;
    for (i = 0; i < n; i += step) {
      u64 b; double v = a[i]; if (v != v) return -3; __builtin_memcpy(&b, &v, 8);
      q = (u32)((b * 0x9E3779B97F4A7C15ull) >> 40) & msk; ns++;
      while (code[q] && tab[q] != b) q = (q + 1) & msk;
      if (!code[q]) { code[q] = 1; tab[q] = b; cnt++; }
    }
    if ((double)cnt > 0.95 * (double)ns) return -2;
    for (i = 0; i < size; i++) code[i] = 0;
  }
  for (i = 0; i < n; i++) {
    u64 b; double v = a[i]; if (v != v) return -3; __builtin_memcpy(&b, &v, 8);
    q = (u32)((b * 0x9E3779B97F4A7C15ull) >> 40) & msk;
    while (code[q] && tab[q] != b) q = (q + 1) & msk;
    if (!code[q]) { if ((double)(m + 1) > lim) return -2; tab[q] = b; keys[m++] = v; code[q] = m; }
    codes[i] = (double)(code[q] - 1);
  }
  return (int)m;
}

/* ---- dec_block (since 2.22.0): one whole block of the picker (whole numbers, or decimals as ALP) decoded in one call, the reverse of enc_tree, for the ways
 * RAW 0, CONST 1, FOR 2, DELTA 3, RLE 4, DICT 5, PFOR 6, DIV 7, ENT 8, EG 9, DEC 10 and DELTA2 11. The same numbers as decChunk in src/picker.js. Returns 1, or 0 for anything
 * it does not handle or that looks damaged; the JavaScript then decodes that block itself (and reports damage the usual way). src needs 16 spare bytes after len. */
typedef struct { const u8 *b; u32 p, len; u8 *sp, *send; int bad; } TR;
static void tr_cpy(void *d, const void *s, u32 k) { u8 *o = (u8 *)d; const u8 *q = (const u8 *)s; u32 j; for (j = 0; j < k; j++) o[j] = q[j]; }
static u32 tr_u8(TR *r) { if (r->p >= r->len) { r->bad = 1; return 0; } return r->b[r->p++]; }
static double tr_vi(TR *r) { double x = 0, m = 1; u32 c, k = 0; do { if (r->p >= r->len || k++ >= 8) { r->bad = 1; return 0; } c = r->b[r->p++]; x += (double)(c & 127) * m; m *= 128; } while (c & 128); return x; }
static double tr_zi(TR *r) { double z = tr_vi(r); int odd = z < 9007199254740992.0 ? (int)((u64)z & 1) : 0; return odd ? -(z + 1) / 2 : z / 2; }
static const u8 *tr_bytes(TR *r, double k) { const u8 *o; if (!(k >= 0) || (double)r->p + k > (double)r->len) { r->bad = 1; return 0; } o = r->b + r->p; r->p += (u32)k; return o; }
static void *tr_alloc(TR *r, double bytes) { u8 *o = r->sp; u32 b; if (!(bytes >= 0) || bytes > 268435456.0) { r->bad = 1; return 0; } b = ((u32)bytes + 15) & ~15u; if (r->sp + b > r->send) { r->bad = 1; return 0; } r->sp += b; return o; }
static int tr_table(TR *r, unsigned short *freq) {
  const u8 *bm = tr_bytes(r, 32); u32 i, tot = 0; if (!bm) return -1;
  for (i = 0; i < 256; i++) { freq[i] = 0; if ((bm[i >> 3] >> (i & 7)) & 1) { double v = tr_vi(r) + 1; if (r->bad || v > 4096) return -1; tot += (u32)v; if (tot > 4096) return -1; freq[i] = (unsigned short)v; } }
  return tot == 4096 ? 0 : -1;
}
static u8 *tr_rans(TR *r, u32 n, const unsigned short *freq) {       /* the symbols of one rANS stream (length, then bytes) */
  double rl = tr_vi(r); const u8 *s; u8 *o;
  if (r->bad) return 0; s = tr_bytes(r, rl); o = (u8 *)tr_alloc(r, n + 16); if (!s || !o) return 0;
  if (rans_dec(s, (u32)rl, n, freq, o, 0) < 0) { r->bad = 1; return 0; }
  return o;
}
static int dec_i(TR *r, u32 n, int depth, double *out) {
  u32 sch, i; double mn, m, c, b, g; double *d, *e;
  if (depth > 4 || r->bad) return -1;
  sch = tr_u8(r); if (r->bad) return -1;
  switch (sch) {
    case 0: { const u8 *s = tr_bytes(r, (double)n * 8); if (!s) return -1; tr_cpy(out, s, n * 8); return 0; }
    case 1: mn = tr_zi(r); if (r->bad) return -1; for (i = 0; i < n; i++) out[i] = mn; return 0;
    case 2: case 6: {
      u32 bw; double ne = 0; const u8 *s;
      mn = tr_zi(r); bw = tr_u8(r); if (sch == 6) ne = tr_vi(r);
      if (r->bad || bw > (sch == 6 ? 31u : 32u) || ne > n) return -1;
      if (!bw) { for (i = 0; i < n; i++) out[i] = mn; }
      else { s = tr_bytes(r, __builtin_ceil((double)n * bw / 8)); if (!s) return -1; bp_unpack(s, n, bw, mn, out); }
      if (sch == 6 && ne > 0) {
        u32 k, nn = (u32)ne; double p = -1, lim = (double)((u64)1 << bw);
        d = (double *)tr_alloc(r, ne * 8); e = (double *)tr_alloc(r, ne * 8);
        if (!d || !e || dec_i(r, nn, depth + 1, d) || dec_i(r, nn, depth + 1, e)) return -1;
        for (k = 0; k < nn; k++) { p += d[k] + 1; if (!(p >= 0 && p < n) || p != __builtin_floor(p)) return -1; out[(u32)p] += e[k] * lim; }
      }
      return 0;
    }
    case 3:
      if (n < 1) return -1;
      c = tr_zi(r); d = (double *)tr_alloc(r, (double)n * 8); if (r->bad || !d || dec_i(r, n - 1, depth + 1, d)) return -1;
      delta_dec(d, n - 1, c, out); return 0;
    case 4:
      m = tr_vi(r); if (r->bad || m > n) return -1;
      d = (double *)tr_alloc(r, m * 8); e = (double *)tr_alloc(r, m * 8);
      if (!d || !e || dec_i(r, (u32)m, depth + 1, d) || dec_i(r, (u32)m, depth + 1, e)) return -1;
      return rle_dec(d, e, (u32)m, n, out) ? -1 : 0;
    case 5:
      m = tr_vi(r); if (r->bad || m > n || m > 65536) return -1;
      d = (double *)tr_alloc(r, m * 8); e = (double *)tr_alloc(r, (double)n * 8);
      if (!d || !e || dec_i(r, (u32)m, depth + 1, d) || dec_i(r, n, depth + 1, e)) return -1;
      for (i = 0; i < n; i++) { c = e[i]; if (!(c >= 0 && c < m) || c != __builtin_floor(c)) return -1; out[i] = d[(u32)c]; }
      return 0;
    case 7:
      b = tr_zi(r); g = tr_vi(r); if (r->bad || dec_i(r, n, depth + 1, out)) return -1;
      for (i = 0; i < n; i++) out[i] = out[i] * g + b;
      return 0;
    case 8: case 9: {
      unsigned short freq[256]; u32 sh = 0; const u8 *s; u8 *sy;
      if (sch == 8) { mn = tr_zi(r); sh = tr_u8(r); if (r->bad || sh > 32) return -1; } else if (n < 1) return -1;
      if (tr_table(r, freq)) return -1;
      sy = tr_rans(r, n, freq); if (!sy) return -1;
      if (sch == 8) { s = sh ? tr_bytes(r, __builtin_ceil((double)n * sh / 8)) : r->b + r->p; if (!s) return -1; ent_dec(sy, n, sh, mn, s, out); return 0; }
      { int bits = eg_bits(sy, n); if (bits < 0) return -1; s = tr_bytes(r, __builtin_ceil((double)bits / 8)); if (!s) return -1; eg_dec(sy, n, s, out); return 0; }
    }
    case 10:
      d = (double *)tr_alloc(r, (double)n * 8); e = (double *)tr_alloc(r, (double)n * 8);
      if (!d || !e || dec_i(r, n, depth + 1, e) || dec_i(r, n, depth + 1, d)) return -1;
      return dec_join(d, e, n, out) ? -1 : 0;
    case 12: {                            /* LB: place in the list of different values by latest use (Fenwick counts of the latest places), as in decInts */
      i32 *seen; u32 k = 0, o = 0, lim1 = 1, t, pp, y; int qq; double x = 0, z;
      m = tr_vi(r); if (r->bad || !(m >= 1 && m <= n)) return -1;
      d = (double *)tr_alloc(r, (double)n * 8); e = (double *)tr_alloc(r, m * 8); seen = (i32 *)tr_alloc(r, ((double)n + 1) * 4);
      if (!d || !e || !seen || dec_i(r, n, depth + 1, d) || dec_i(r, (u32)m, depth + 1, e)) return -1;
      for (t = 0; t <= n; t++) seen[t] = 0;
      while (lim1 * 2 <= n) lim1 *= 2;
      for (i = 0; i < n; i++) {
        z = d[i];
        if (z == 0) { if (o >= (u32)m) return -1; x = e[o++]; k++; }
        else {
          if (!(z >= 1 && z <= k) || z != __builtin_floor(z)) return -1;
          for (pp = 0, qq = (int)(k - (u32)z + 1), y = lim1; y > 0; y >>= 1) if (pp + y <= n && seen[pp + y] < qq) { pp += y; qq -= seen[pp]; }
          x = out[pp]; for (t = pp + 1; t <= n; t += t & (0u - t)) seen[t]--;
        }
        for (t = i + 1; t <= n; t += t & (0u - t)) seen[t]++;
        out[i] = x;
      }
      return o == (u32)m ? 0 : -1;
    }
    case 11:
      if (n < 3) return -1;
      c = tr_zi(r); b = tr_zi(r); d = (double *)tr_alloc(r, (double)n * 8); if (r->bad || !d || dec_i(r, n - 2, depth + 1, d)) return -1;
      out[0] = c; c += b; out[1] = c;
      for (i = 2; i < n; i++) { b += d[i - 2]; c += b; out[i] = c; }
      return 0;
  }
  return -1;
}
EXPORT int dec_block(const u8 *src, u32 len, u32 n, double *out, u8 *scratch, u32 scap) {
  TR r; u32 id, i;
  r.b = src; r.p = 0; r.len = len; r.sp = scratch; r.send = scratch + scap; r.bad = 0;
  id = tr_u8(&r);
  if (id == 0) return dec_i(&r, n, 0, out) || r.bad ? 0 : 1;
  if (id == 4) {                          /* FDICT: a table of doubles, then the codes */
    double m = tr_vi(&r), *keys, *codes; u32 mm;
    if (r.bad || m > n || m > 65536) return 0;
    mm = (u32)m; keys = (double *)tr_alloc(&r, m * 8); codes = (double *)tr_alloc(&r, (double)n * 8); if (!keys || !codes) return 0;
    { const u8 *s = tr_bytes(&r, m * 8); if (!s) return 0; tr_cpy(keys, s, mm * 8); }
    if (dec_i(&r, n, 1, codes)) return 0;
    for (i = 0; i < n; i++) { double c = codes[i]; if (!(c >= 0 && c < m) || c != __builtin_floor(c)) return 0; out[i] = keys[(u32)c]; }
    return r.bad ? 0 : 1;
  }
  if (id == 1) {
    u32 e = tr_u8(&r), f = tr_u8(&r); double ne = tr_vi(&r), *ints, *gp, *nr, p = -1; u32 k, nn;
    if (r.bad || e > 22 || f > e || ne > n) return 0;
    ints = out; if (dec_i(&r, n, 1, ints)) return 0;
    for (i = 0; i < n; i++) out[i] = ints[i] * P10[f] / P10[e];
    if (ne > 0) {
      nn = (u32)ne; gp = (double *)tr_alloc(&r, ne * 8); nr = (double *)tr_alloc(&r, ne * 8);
      if (!gp || !nr || dec_i(&r, nn, 1, gp) || dec_i(&r, nn, 1, nr)) return 0;
      for (k = 0; k < nn; k++) { p += gp[k] + 1; if (!(p >= 0 && p < n) || p != __builtin_floor(p)) return 0; gp[k] = p; }
      for (k = 0; k < nn; k++) {
        double cc = nr[k]; u32 q = (u32)gp[k];
        if (cc == 0) { const u8 *s = tr_bytes(&r, 8); if (!s) return 0; tr_cpy(out + q, s, 8); }
        else {
          double z, dist; u64 bits;
          if (!(cc >= 1 && cc <= 2097153) || cc != __builtin_floor(cc)) return 0;
          z = cc - 1; dist = ((u64)z & 1) ? -(z + 1) / 2 : z / 2;
          tr_cpy(&bits, out + q, 8); bits += (u64)(long long)dist; tr_cpy(out + q, &bits, 8);
        }
      }
    }
    return r.bad ? 0 : 1;
  }
  return 0;
}
