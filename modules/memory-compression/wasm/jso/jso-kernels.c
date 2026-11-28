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
static unsigned short rs_cum[257]; static u8 rs_slot[4096];
/* Decodes n bytes from a rANS stream. freq: 256 frequencies that add up to 4096 (JavaScript checked). delta: 1 when the bytes are differences (running sum is applied). Returns 0, or -1 for a cut stream. */
EXPORT int rans_dec(const u8 *src, u32 len, u32 n, const unsigned short *freq, u8 *out, int delta) {
  u32 i, s, c = 0, q, x, p = 4, m;
  if (len < 4) return -1;
  for (s = 0; s < 256; s++) { u32 f = freq[s]; rs_cum[s] = (unsigned short)c; for (q = 0; q < f && c + q < 4096; q++) rs_slot[c + q] = (u8)s; c += f; }
  rs_cum[256] = (unsigned short)c;
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
EXPORT u32 rans_enc(const u8 *src, u32 n, const unsigned short *freq, u8 *out, u32 cap) {
  unsigned short cum[257]; u32 s, c = 0, p = cap, x = RS_RL, i, k;
  for (s = 0; s < 256; s++) { cum[s] = (unsigned short)c; c += freq[s]; }
  for (i = n; i-- > 0;) {
    u32 f, xm, q;
    s = src[i]; f = freq[s]; xm = (2048u << 8) * f;
    while (x >= xm) { out[--p] = (u8)x; x >>= 8; }
    q = x / f; k = x - q * f;
    x = (q << 12) + k + cum[s];
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
    if (!(av < 2251799813685248.0) || (double)(long long)v != v || (v == 0 && 1 / v < 0)) ok = 0;
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
EXPORT u32 dec_split(const double *a, u32 n, double *m, double *k) {
  u32 i, cnt = 0;
  for (i = 0; i < n; i++) {
    long long x = (long long)a[i]; int neg = x < 0, z = 0; u64 u = neg ? (u64)(-x) : (u64)x;
    if (u) {
      if (u % 100000000ULL == 0) { u /= 100000000ULL; z += 8; }
      if (u % 10000ULL == 0) { u /= 10000ULL; z += 4; }
      if (u % 100ULL == 0) { u /= 100ULL; z += 2; }
      if (u % 10ULL == 0) { u /= 10ULL; z += 1; }
      if (u % 10ULL == 0) { u /= 10ULL; z += 1; if (u % 10ULL == 0) { u /= 10ULL; z += 1; } }   /* at most 15 zeros in all (|v| < 2^52 < 10^16) */
      while (u % 10ULL == 0) { u /= 10ULL; z++; }
    }
    m[i] = neg ? -(double)u : (double)u; k[i] = (double)z; cnt += z != 0;
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
  u32 i, w, pos = 0, words = n * 2 + 2;
  for (i = 0; i < 256; i++) cnt[i] = 0;
  for (i = 0; i < words; i++) o[i] = 0;
  for (i = 0; i < n; i++) {
    long long x = (long long)a[i]; u64 u = x >= 0 ? ((u64)x << 1) : (((u64)(-x)) << 1) - 1; u32 c = u ? 64 - (u32)__builtin_clzll(u) : 0;
    syms[i] = (u8)c; cnt[c]++;
    if (c > 1) {
      u64 low = u - (1ULL << (c - 1)); u32 nb = c - 1, nb1 = nb < 32 ? nb : 32, idx, off; u64 t;
      idx = pos >> 5; off = pos & 31; t = (u64)(u32)low << off; o[idx] |= (u32)t; o[idx + 1] |= (u32)(t >> 32); pos += nb1;
      if (nb > 32) { idx = pos >> 5; off = pos & 31; t = (low >> 32) << off; o[idx] |= (u32)t; o[idx + 1] |= (u32)(t >> 32); pos += nb - 32; }
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
 * CONST 1, FOR 2, RLE 4, ENT 8, EG 9, DEC 10. tree = for each way: its number, its number of parts, then the parts' trees one after another.
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
static int tw_node(TW *w, const double *a, u32 n, const u8 **tp, int depth) {
  u32 sch = (*tp)[0], nk = (*tp)[1], i; double mn, mx; const u8 *t0 = *tp; u8 *sp0 = w->sp; int ok = 0;
  *tp += 2;
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
    if (!tw_node(w, g, n, tp, depth - 1)) return 0;
    if (!tw_node(w, d, n, tp, depth - 1)) return 0;
    return w->bad ? 0 : (w->sp = sp0, 1);
  }
  if (!ok) return 0;
  w->sp = sp0; return w->bad ? 0 : 1;
}
EXPORT u32 enc_tree(const double *a, u32 n, const u8 *tree, u8 *out, u32 cap, u8 *scratch, u32 scap, u32 depth) {
  TW w; const u8 *tp = tree;
  w.p = out; w.end = out + cap; w.sp = scratch; w.send = scratch + scap; w.bad = 0;
  if (!tw_node(&w, a, n, &tp, (int)depth) || w.bad) return 0;
  return (u32)(w.p - out);
}
