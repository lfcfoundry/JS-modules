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
