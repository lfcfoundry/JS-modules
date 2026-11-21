/* Copyright (c) 2026 LFC Foundry. MIT License.
 * Small C layer around LZ4 1.11.1 (BSD-2-Clause, Yann Collet) for wasm32: a first-fit allocator that grows the wasm memory, the calls the JavaScript side needs,
 * and the kit's own fast block compressor for data that packs well (it writes standard LZ4 blocks and hands hard data to LZ4 itself).
 * Built by build.sh together with the pinned LZ4 release, which is compiled unchanged. */
#include <stddef.h>
#include "lz4.h"
#include "lz4hc.h"
#include "lz4frame.h"
typedef unsigned char u8; typedef unsigned int u32; typedef unsigned long long u64;
#define EXPORT(n) __attribute__((export_name(n)))
/* ---- memory: blocks carry a 16-byte header (size, free flag); free blocks are merged with neighbors; the heap grows a page at a time */
extern u8 __heap_base;
typedef struct blk { u32 size; u32 free; u32 pad0, pad1; } blk;
static u8* heapLo; static u8* heapEnd; static u8* heapTop;
static void* memset_(void* p, int v, size_t n) { u8* d = (u8*)p; while (n--) *d++ = (u8)v; return p; }
static int grow(u32 need) { u32 pages = (need + 65535) >> 16; if (__builtin_wasm_memory_grow(0, pages) == (size_t)-1) return 0; heapEnd += (u64)pages << 16; return 1; }
static void init(void) { if (heapLo) return; heapLo = heapTop = (u8*)(((size_t)&__heap_base + 15) & ~(size_t)15); heapEnd = (u8*)((size_t)__builtin_wasm_memory_size(0) << 16); }
void* lfc_malloc(size_t n) {
  init(); n = (n + 15) & ~(size_t)15; if (n == 0) n = 16;
  for (u8* p = heapLo; p < heapTop; p += sizeof(blk) + ((blk*)p)->size) { blk* b = (blk*)p;
    if (b->free && b->size >= n) { if (b->size >= n + sizeof(blk) + 64) { blk* r = (blk*)(p + sizeof(blk) + n); r->size = b->size - n - sizeof(blk); r->free = 1; b->size = (u32)n; } b->free = 0; return p + sizeof(blk); } }
  u64 need = (u64)n + sizeof(blk); if ((u64)(heapTop - heapLo) + need > 0xFFFFF000ull) return 0;
  if (heapTop + need > heapEnd) { u64 miss = (u64)(heapTop + need - heapEnd); if (!grow((u32)miss)) return 0; }
  blk* b = (blk*)heapTop; b->size = (u32)n; b->free = 0; heapTop += need; return (u8*)b + sizeof(blk);
}
void* lfc_calloc(size_t n, size_t m) { u64 t = (u64)n * m; if (t > 0xFFFFF000ull) return 0; void* p = lfc_malloc((size_t)t); if (p) memset_(p, 0, (size_t)t); return p; }
void lfc_free(void* q) {
  if (!q) return; blk* b = (blk*)((u8*)q - sizeof(blk)); b->free = 1;
  for (;;) { u8* nx = (u8*)b + sizeof(blk) + b->size; if (nx < heapTop && ((blk*)nx)->free) b->size += sizeof(blk) + ((blk*)nx)->size; else break; }
  if ((u8*)b + sizeof(blk) + b->size == heapTop) { heapTop = (u8*)b;
    for (;;) { u8* last = 0; for (u8* p = heapLo; p < heapTop; p += sizeof(blk) + ((blk*)p)->size) last = p; if (last && ((blk*)last)->free) heapTop = last; else break; } }
}
EXPORT("malloc") void* lz_malloc(u32 n) { return lfc_malloc(n); }
EXPORT("free") void lz_free(void* p) { lfc_free(p); }
EXPORT("heap_used") u32 heap_used(void) { return (u32)(heapTop - heapLo); }
/* ---- calls. A failure is returned as 0xFFFFFFFF (LZ4 returns 0 or a negative number for it). */
EXPORT("version") u32 lz_version(void) { return (u32)LZ4_versionNumber(); }
EXPORT("bound") u32 lz_bound(u32 n) { return n > (u32)LZ4_MAX_INPUT_SIZE ? 0xFFFFFFFFu : (u32)LZ4_compressBound((int)n); }
/* ---- the kit's own fast block compressor (default speed, inputs of 64 KiB and more). It writes a standard LZ4 block, read by any LZ4 decoder.
 * How it differs from LZ4_compress_fast: a 6-byte hash into a 65,536-entry table (LZ4: 4 bytes, 4,096 entries). On data that packs well (logs, JSON, CSV)
 * it finds longer matches, so there are fewer sequences to write: faster and smaller. On data that packs poorly the large table only costs cache misses,
 * so the input is worked through in pieces (4, 8, 16, then 32 KiB) and when the pieces stop packing well the rest of the input is handed to
 * LZ4_compress_fast, which carries on in the same block. Data that never packs well goes there from byte 0 and gives the same bytes as before.
 * Table entries are positions counted from a base that moves up by more than 64 KiB after every call, so entries left by earlier calls are always
 * "too far" and are never read: the table is not cleared per call and the output depends on the input alone. */
#ifndef LFC_LOG
#define LFC_LOG 16
#endif
#ifndef LFC_HB
#define LFC_HB 6
#endif
#ifndef LFC_HARD
#define LFC_HARD 34        /* a 32 KiB piece that packs above this percent counts as hard; two in a row hand the rest to LZ4 */
#endif
#ifndef LFC_HARD0
#define LFC_HARD0 60       /* the same for the first pieces (4, 8, 16 KiB), which have little history yet; one is enough */
#endif
#define LFC_PIECE 32768u
#define LFC_MIN 65536u
static u32 lfcTab[1 << LFC_LOG]; static u32 lfcBase = 65536;
typedef struct { const u8* ip; const u8* anchor; u8* op; u32 nb; } lfc_state;
static inline u64 rd64(const u8* p) { u64 v; __builtin_memcpy(&v, p, 8); return v; }
static inline u32 rd32(const u8* p) { u32 v; __builtin_memcpy(&v, p, 4); return v; }
static inline void wr64(u8* p, u64 v) { __builtin_memcpy(p, &v, 8); }
static inline u32 lfc_count(const u8* p, const u8* m, const u8* lim) {
  const u8* s = p;
  while (p + 8 <= lim) { u64 x = rd64(p) ^ rd64(m); if (x) return (u32)(p - s) + ((u32)__builtin_ctzll(x) >> 3); p += 8; m += 8; }
  while (p < lim && *p == *m) { p++; m++; }
  return (u32)(p - s);
}
#define LFC_H(v) ((u32)((((v) << (64 - 8 * LFC_HB)) * 0x9E3779B185EBCA87ULL) >> (64 - LFC_LOG)))
#define LFC_POS(p) (base + (u32)((p) - src))
/* one piece: searches from st->ip until the position passes lim (lim is at most 12 bytes before the end of the input) */
static void lfc_piece(lfc_state* st, const u8* const src, const u32 base, const u8* const lim, const u8* const matchlimit) {
  const u8* ip = st->ip; const u8* anchor = st->anchor; u8* op = st->op; u32 nb = st->nb;
  u32* const tab = lfcTab; const u8* m; u64 seq; u32 h, pos, ref; u8* tok;
  for (;;) {
    /* search: the hash of the next position is worked out before this one is checked */
    { const u8* fip = ip; u64 fseq = rd64(ip); u32 fh = LFC_H(fseq);
      for (;;) {
        seq = fseq; h = fh; ip = fip; fip += nb++ >> 6;                 /* after 64 misses in a row the step grows, as in LZ4 */
        if (fip > lim) { ip = fip; goto done; }
        ref = tab[h]; fseq = rd64(fip); fh = LFC_H(fseq); pos = LFC_POS(ip); tab[h] = pos;
        if (pos - ref <= 65535) { m = src + (ref - base); if (rd32(m) == (u32)seq) break; }
      } }
    nb = 1 << 6;
    while (ip > anchor && m > src && ip[-1] == m[-1]) { ip--; m--; }      /* grow the match backwards */
    { u32 ll = (u32)(ip - anchor); tok = op++;
      if (ll >= 15) { u32 r = ll - 15; *tok = 0xF0; while (r >= 255) { *op++ = 255; r -= 255; } *op++ = (u8)r;
        { const u8* s = anchor; u8* d = op; u8* const e = op + ll; do { wr64(d, rd64(s)); d += 8; s += 8; } while (d < e); op = e; } }
      else { *tok = (u8)(ll << 4); wr64(op, rd64(anchor)); if (ll > 8) wr64(op + 8, rd64(anchor + 8)); op += ll; } }
    for (;;) {
      u32 off = (u32)(ip - m), ml;
      op[0] = (u8)off; op[1] = (u8)(off >> 8); op += 2;
      ml = lfc_count(ip + 4, m + 4, matchlimit); ip += 4 + ml;
      if (ml >= 270) { u32 r = ml - 15; *tok |= 15; while (r >= 255) { *op++ = 255; r -= 255; } *op++ = (u8)r; }
      else { *tok |= (u8)(ml < 15 ? ml : 15); *op = (u8)(ml - 15); op += ml >= 15; }   /* the extra length byte is written either way and kept only when needed */
      anchor = ip;
      if (ip > lim) goto done;
      tab[LFC_H(rd64(ip - 2))] = LFC_POS(ip - 2);
      seq = rd64(ip); h = LFC_H(seq); pos = LFC_POS(ip); ref = tab[h]; tab[h] = pos;       /* most matches are followed at once by another */
      if (pos - ref <= 65535) { m = src + (ref - base); if (rd32(m) == (u32)seq) { tok = op++; *tok = 0; continue; } }
      break;
    }
    if (++ip > lim) goto done;
  }
done:
  st->ip = ip; st->anchor = anchor; st->op = op; st->nb = nb;
}
/* dcap is at least LZ4_compressBound(n); n is at least 13. Returns the block size, or 0 when LZ4 itself failed (it cannot with that much room). */
static u32 lfc_fast(u8* dst, u32 dcap, const u8* src, u32 n) {
  const u8* const iend = src + n; const u8* const mflimit = iend - 12; const u8* const matchlimit = iend - 5;
  lfc_state st; u32 base, piece = 4096, hard = 0;
  if ((u64)lfcBase + n + 65536 > 0xFFFF0000ull) { memset_(lfcTab, 0, sizeof lfcTab); lfcBase = 65536; }
  base = lfcBase; lfcBase = base + n + 65536;
  st.ip = src; st.anchor = src; st.op = dst; st.nb = 1 << 6;
  while (st.ip <= mflimit) {
    const u8* const cin = st.ip; const u8* const cout = st.op + (st.ip - st.anchor);          /* bytes not yet written count as stored */
    const u8* const lim = (u32)(mflimit - st.ip) > piece ? st.ip + piece : mflimit;
    lfc_piece(&st, src, base, lim, matchlimit);
    { u32 in = (u32)(st.ip - cin), out = (u32)(st.op + (st.ip - st.anchor) - cout);
      if (in >= piece / 2) {
        if (out * 100 > in * (piece < LFC_PIECE ? LFC_HARD0 : LFC_HARD)) { if (piece < LFC_PIECE || ++hard >= 2) break; } else hard = 0; } }
    if (piece < LFC_PIECE) piece *= 2;
  }
  if (st.ip <= mflimit) {   /* hard data: LZ4 packs everything after the last match written. Its sequences only point inside its own part, so the two parts read as one block */
    const u8* const p = st.anchor;
    int r = LZ4_compress_fast((const char*)p, (char*)st.op, (int)(iend - p), (int)(dcap - (u32)(st.op - dst)), 1);
    return r <= 0 ? 0 : (u32)(st.op - dst) + (u32)r;
  }
  { u8* op = st.op; u32 ll = (u32)(iend - st.anchor);
    if (ll >= 15) { u32 r = ll - 15; *op++ = 0xF0; while (r >= 255) { *op++ = 255; r -= 255; } *op++ = (u8)r; } else *op++ = (u8)(ll << 4);
    __builtin_memcpy(op, st.anchor, ll); op += ll; return (u32)(op - dst); }
}
/* fast levels: acceleration 1 is the default, higher is faster and larger. The default on 64 KiB and more with a full-size output buffer goes to the kit's own compressor above. */
EXPORT("compress") u32 lz_compress(void* dst, u32 dcap, const void* src, u32 n, int accel) {
  if (n > (u32)LZ4_MAX_INPUT_SIZE || dcap > 0x7FFFFFFFu) return 0xFFFFFFFFu;
#ifndef LFC_OFF
  if (accel <= 1 && n >= LFC_MIN && dcap >= (u32)LZ4_compressBound((int)n)) { u32 r = lfc_fast((u8*)dst, dcap, (const u8*)src, n); return r ? r : 0xFFFFFFFFu; }
#endif
  int r = LZ4_compress_fast((const char*)src, (char*)dst, (int)n, (int)dcap, accel < 1 ? 1 : accel); return r <= 0 && n ? 0xFFFFFFFFu : (u32)r;
}
/* high compression: level 1..12 (LZ4_compress_HC allocates its own working state) */
EXPORT("compress_hc") u32 lz_compress_hc(void* dst, u32 dcap, const void* src, u32 n, int level) {
  if (n > (u32)LZ4_MAX_INPUT_SIZE || dcap > 0x7FFFFFFFu) return 0xFFFFFFFFu;
  int r = LZ4_compress_HC((const char*)src, (char*)dst, (int)n, (int)dcap, level); return r <= 0 && n ? 0xFFFFFFFFu : (u32)r;
}
/* the call the 1.11.0 bug was in: a stream state holding garbage, LZ4_resetStreamHC at the given level, then streaming compression of the whole input as one block.
 * Kept as an export so the tests can check levels 10 to 12 on a dirty state (fixed in 1.11.1). */
EXPORT("compress_hc_stream") u32 lz_compress_hc_stream(void* dst, u32 dcap, const void* src, u32 n, int level, u32 junk) {
  if (n > (u32)LZ4_MAX_INPUT_SIZE || dcap > 0x7FFFFFFFu) return 0xFFFFFFFFu;
  LZ4_streamHC_t* s = LZ4_createStreamHC(); if (!s) return 0xFFFFFFFFu;
  memset_(s, (int)junk, sizeof(LZ4_streamHC_t));
  LZ4_resetStreamHC(s, level);
  int r = LZ4_compress_HC_continue(s, (const char*)src, (char*)dst, (int)n, (int)dcap);
  LZ4_freeStreamHC(s); return r <= 0 && n ? 0xFFFFFFFFu : (u32)r;
}
/* decompress one LZ4 block of known original size; returns the size or 0xFFFFFFFF for damaged data */
EXPORT("decompress") u32 lz_decompress(void* dst, u32 dcap, const void* src, u32 n) {
  if (dcap > 0x7FFFFFFFu || n > 0x7FFFFFFFu) return 0xFFFFFFFFu;
  int r = LZ4_decompress_safe((const char*)src, (char*)dst, (int)n, (int)dcap); return r < 0 ? 0xFFFFFFFFu : (u32)r;
}
/* the standard .lz4 frame: level 0 = fast, 1..12 = high compression; the content size and a content checksum are written */
EXPORT("frame_bound") u32 lz_frame_bound(u32 n) { size_t r = LZ4F_compressFrameBound(n, 0); return LZ4F_isError(r) ? 0xFFFFFFFFu : (u32)r; }
EXPORT("frame_compress") u32 lz_frame_compress(void* dst, u32 dcap, const void* src, u32 n, int level) {
  LZ4F_preferences_t p; memset_(&p, 0, sizeof p); p.compressionLevel = level; p.frameInfo.contentSize = n; p.frameInfo.contentChecksumFlag = LZ4F_contentChecksumEnabled; p.frameInfo.blockMode = LZ4F_blockLinked;
  size_t r = LZ4F_compressFrame(dst, dcap, src, n, &p); return LZ4F_isError(r) ? 0xFFFFFFFFu : (u32)r;
}
/* decompress a whole frame (or several frames in a row) into dst; 0xFFFFFFFF damaged, 0xFFFFFFFE dst too small */
EXPORT("frame_decompress") u32 lz_frame_decompress(void* dst, u32 dcap, const void* src, u32 n) {
  LZ4F_dctx* c; if (LZ4F_isError(LZ4F_createDecompressionContext(&c, LZ4F_VERSION))) return 0xFFFFFFFFu;
  const u8* sp = (const u8*)src; size_t sleft = n; u8* dp = (u8*)dst; size_t dleft = dcap; u32 res = 0; int more = 1; size_t r = n ? 1 : 0;
  while (sleft && more) {
    size_t sn = sleft, dn = dleft; r = LZ4F_decompress(c, dp, &dn, sp, &sn, 0);
    if (LZ4F_isError(r)) { res = 0xFFFFFFFFu; more = 0; break; }
    sp += sn; sleft -= sn; dp += dn; dleft -= dn;
    if (sn == 0 && dn == 0) { res = dleft == 0 ? 0xFFFFFFFEu : 0xFFFFFFFFu; more = 0; break; }
    if (r == 0 && sleft == 0) break;
  }
  LZ4F_freeDecompressionContext(c);
  if (!res && (r != 0 || n == 0)) res = 0xFFFFFFFFu;   /* input ended inside a frame (or was empty) */
  if (res) return res;
  return (u32)(dp - (u8*)dst);
}
