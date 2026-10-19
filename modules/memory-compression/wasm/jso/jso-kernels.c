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
EXPORT int tpl_scan(const u8 *b, const u32 *lens, int start, int n, u32 p, const i16 *next, const i8 *term,
                    double *slots, int R, u8 *tid, i32 *minL, i32 *maxL, u8 *lead, u32 *out) {
  int i;
  for (i = start; i < n; i++) {
    u32 end = p + lens[i], q = p;
    int node = 0, k = 0, t;
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
