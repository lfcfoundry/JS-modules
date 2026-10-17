/* Copyright (c) 2026 LFC Foundry. MIT License.
 * jso-kernels.c: small WebAssembly helpers for memory-compression-jso (built by build.sh into jso-kernels.wasm, embedded by embed.py).
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
