// Copyright (c) 2026 LFC Foundry. MIT License.
// text-columns: finds the fields of CSV/TSV text 16 bytes at a time (WebAssembly SIMD) and parses plain decimal columns straight from the bytes.
// Exports: count, ascii, scan, numcol. No libc; the caller lays the arrays out in linear memory.
typedef unsigned char u8; typedef unsigned int u32; typedef double f64;
#define EXPORT(n) __attribute__((export_name(n)))
#ifdef __wasm_simd128__
#include <wasm_simd128.h>
#endif

// upper bound of the number of fields: delimiters + line feeds + 1
EXPORT("count") u32 count(const u8*in, u32 len, u32 delim) {
  u32 n = 1, i = 0;
#ifdef __wasm_simd128__
  v128_t d = wasm_i8x16_splat((char)delim), nl = wasm_i8x16_splat(10);
  for (; i + 16 <= len; i += 16) { v128_t v = wasm_v128_load(in + i); n += __builtin_popcount(wasm_i8x16_bitmask(wasm_v128_or(wasm_i8x16_eq(v, d), wasm_i8x16_eq(v, nl)))); }
#endif
  for (; i < len; i++) n += (in[i] == delim) | (in[i] == 10);
  return n;
}

// 1 when every byte is below 128
EXPORT("ascii") u32 ascii(const u8*in, u32 len) {
  u32 i = 0;
#ifdef __wasm_simd128__
  for (; i + 16 <= len; i += 16) if (wasm_i8x16_bitmask(wasm_v128_load(in + i))) return 0;
#endif
  for (; i < len; i++) if (in[i] & 128) return 0;
  return 1;
}

// scan: fields to starts[]/ends[] (end exclusive; quotes stripped), qflag[] = 1 when a quoted field holds doubled quotes. st[0]=fields, st[1]=rows, st[2]=columns.
// returns 0 ok, 1 ragged rows (field count differs between rows), 2 text after a closing quote, 3 unterminated quote
EXPORT("scan") u32 scan(const u8*in, u32 len, u32 delim, u32*starts, u32*ends, u8*qflag, u32*st) {
  u32 f = 0, r = 0, ncols = 0, nrows = 0, fs = 0, qend = 0, skip = 0xffffffffu, p = 0, i = 0, base;
  u32 inq = 0, quoted = 0, esc = 0, rc = 0;
#define FIELD(e) do { starts[f] = fs; ends[f] = (e); qflag[f] = (u8)esc; f++; r++; quoted = 0; esc = 0; } while (0)
#define QCHK(q) do { if (quoted && (q) != qend + 1) { rc = 2; goto done; } } while (0)
#define ROW() do { if (!ncols) ncols = r; else if (r != ncols) { rc = 1; goto done; } nrows++; r = 0; } while (0)
#define STEP(c) do { \
    if (p == skip) { } \
    else if (inq) { \
      if (c == '"') { if (p + 1 < len && in[p + 1] == '"') { skip = p + 1; esc = 1; } else { inq = 0; qend = p; } } \
    } else if (c == '"' && p == fs && !quoted) { inq = 1; quoted = 1; fs = p + 1; } \
    else if (quoted && c != (u8)delim && c != 10 && c != 13) { rc = 2; goto done; } \
    else if (c == (u8)delim) { QCHK(p); FIELD(quoted ? qend : p); fs = p + 1; } \
    else if (c == 10) { if (!(r == 0 && fs == p && !quoted)) { QCHK(p); FIELD(quoted ? qend : p); ROW(); } fs = p + 1; } \
    else if (c == 13 && p + 1 < len && in[p + 1] == 10) { if (!(r == 0 && fs == p && !quoted)) { QCHK(p); FIELD(quoted ? qend : p); ROW(); } fs = p + 2; skip = p + 1; } \
  } while (0)
#ifdef __wasm_simd128__
  v128_t vd = wasm_i8x16_splat((char)delim), vn = wasm_i8x16_splat(10), vc = wasm_i8x16_splat(13), vq = wasm_i8x16_splat(34);
  for (base = 0; base + 16 <= len; base += 16) {
    v128_t v = wasm_v128_load(in + base);
    u32 m = wasm_i8x16_bitmask(wasm_v128_or(wasm_v128_or(wasm_i8x16_eq(v, vd), wasm_i8x16_eq(v, vn)), wasm_v128_or(wasm_i8x16_eq(v, vc), wasm_i8x16_eq(v, vq))));
    while (m) { i = __builtin_ctz(m); m &= m - 1; p = base + i; { u8 c = in[p]; STEP(c); } }
  }
  i = base;
#else
  i = 0;
#endif
  for (; i < len; i++) { p = i; { u8 c = in[p]; if (c == (u8)delim || c == 10 || c == 13 || c == '"') STEP(c); } }
  if (inq) { rc = 3; goto done; }
  if (fs < len || r > 0 || quoted) { QCHK(len); FIELD(quoted ? qend : len); ROW(); }
done:
  st[0] = f; st[1] = nrows; st[2] = ncols;
  return rc;
}

// gather: column `col` of every row as three plain arrays (start, end, quote flag), from the field arrays that scan filled in
EXPORT("gather") void gather(const u32*starts, const u32*ends, const u8*qflag, u32 ncols, u32 nrows, u32 col, u32*os, u32*oe, u8*oq) {
  for (u32 r = 0, k = col; r < nrows; r++, k += ncols) { os[r] = starts[k]; oe[r] = ends[k]; oq[r] = qflag[k]; }
}

// qscan: the quote marks of a piece of text, for cutting a big file at line ends that are outside quotes (parseParallel). out[0] = parity of the number of quote marks;
// out[1] = 1 when every quote mark at an even place (0th, 2nd, ...) could open a field (the byte before is a line feed, the delimiter or a quote, or it is the first byte),
// out[2] = the same for the odd places. A piece that starts outside quotes needs out[1]; one that starts inside quotes needs out[2].
EXPORT("qscan") void qscan(const u8*in, u32 len, u32 delim, u32*out) {
  u32 n = 0, ok0 = 1, ok1 = 1, base = 0, p;
#define QSTEP(p) do { u8 pv = (p) ? in[(p) - 1] : 10; u32 good = pv == 10 || pv == (u8)delim || pv == 34; if (n & 1) ok1 &= good; else ok0 &= good; n++; } while (0)
#ifdef __wasm_simd128__
  v128_t vq = wasm_i8x16_splat(34);
  for (; base + 16 <= len; base += 16) {
    u32 m = wasm_i8x16_bitmask(wasm_i8x16_eq(wasm_v128_load(in + base), vq));
    while (m) { p = base + __builtin_ctz(m); m &= m - 1; QSTEP(p); }
  }
#endif
  for (p = base; p < len; p++) if (in[p] == 34) QSTEP(p);
  out[0] = n & 1; out[1] = ok0; out[2] = ok1;
}

// numcol: column `col` of every row as a double, when every field is [-]digits[.digits] with at most 15 digits; returns 1 when all parsed, 0 otherwise
EXPORT("numcol") u32 numcol(const u8*in, const u32*starts, const u32*ends, u32 ncols, u32 nrows, u32 col, f64*out) {
  static const f64 P10[16] = {1,10,100,1e3,1e4,1e5,1e6,1e7,1e8,1e9,1e10,1e11,1e12,1e13,1e14,1e15};
  for (u32 r = 0; r < nrows; r++) {
    u32 k = r * ncols + col, p = starts[k], e = ends[k], neg = 0, nd = 0, fd = 0, dot = 0; unsigned long long v = 0;
    if (p >= e) return 0;
    if (in[p] == '-') { neg = 1; p++; if (p >= e) return 0; }
    for (; p < e; p++) {
      u8 c = in[p];
      if (c >= '0' && c <= '9') { v = v * 10 + (c - '0'); nd++; if (dot) fd++; if (nd > 15) return 0; }
      else if (c == '.' && !dot && nd > 0) { dot = 1; }
      else return 0;
    }
    if (nd == 0 || (dot && fd == 0)) return 0;
    if (nd > 1 && in[starts[k] + neg] == '0' && !dot) return 0;   // leading zero: keep as text
    f64 x = (f64)v; if (fd) x /= P10[fd];
    out[r] = neg ? -x : x;
  }
  return 1;
}
