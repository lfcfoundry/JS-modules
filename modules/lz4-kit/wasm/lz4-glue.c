/* Copyright (c) 2026 LFC Foundry. MIT License.
 * Small C layer around LZ4 1.11.1 (BSD-2-Clause, Yann Collet) for wasm32: a first-fit allocator that grows the wasm memory, and the calls the JavaScript side needs.
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
/* fast levels: acceleration 1 is the default, higher is faster and larger */
EXPORT("compress") u32 lz_compress(void* dst, u32 dcap, const void* src, u32 n, int accel) {
  if (n > (u32)LZ4_MAX_INPUT_SIZE || dcap > 0x7FFFFFFFu) return 0xFFFFFFFFu;
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
