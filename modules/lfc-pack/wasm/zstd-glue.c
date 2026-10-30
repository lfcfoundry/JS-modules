/* Copyright (c) 2026 LFC Foundry. MIT License.
 * Small C layer around zstd (BSD-3-Clause, Meta Platforms) for wasm32: a first-fit allocator that grows the wasm memory, and the calls the JavaScript side needs.
 * Built by build.sh together with the pinned zstd release; ZS_DECODE_ONLY builds the decoder alone. */
#include <stddef.h>
#include "zstd.h"
#include "xxhash.h"
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
  /* merge forward, then merge into the previous free block, then give the top back to the bump pointer */
  for (;;) { u8* nx = (u8*)b + sizeof(blk) + b->size; if (nx < heapTop && ((blk*)nx)->free) b->size += sizeof(blk) + ((blk*)nx)->size; else break; }
  if ((u8*)b + sizeof(blk) + b->size == heapTop) { heapTop = (u8*)b; /* the last block: everything before it that is free also falls back */
    for (;;) { u8* last = 0; for (u8* p = heapLo; p < heapTop; p += sizeof(blk) + ((blk*)p)->size) last = p; if (last && ((blk*)last)->free) heapTop = last; else break; } }
}
EXPORT("malloc") void* zs_malloc(u32 n) { return lfc_malloc(n); }
EXPORT("free") void zs_free(void* p) { lfc_free(p); }
EXPORT("heap_used") u32 heap_used(void) { return (u32)(heapTop - heapLo); }
/* ---- calls */
EXPORT("decompress") u32 zs_decompress(void* dst, u32 dcap, const void* src, u32 n) { return (u32)ZSTD_decompress(dst, dcap, src, n); }
EXPORT("content_size") u32 zs_content_size(const void* src, u32 n) { u64 s = ZSTD_getFrameContentSize(src, n); return s >= 0xFFFFFFF0ull ? 0xFFFFFFFFu : (u32)s; }
EXPORT("is_error") u32 zs_is_error(u32 code) { return ZSTD_isError(code); }
/* ---- checksums over a range of the module memory, so a page can check a block without a JavaScript loop.
 * crc32: zlib polynomial, slicing by 8, continues from `c` (pass 0 to start); the same value as the footer and block checksums.
 * xxh64: the XXH64 of the bundled xxhash (seed 0); returned as two 32-bit halves through the low word, high word kept for xxh64_hi. */
static u32 CRCT[8][256]; static int crcInit; static u32 xxHi;
static void crcMake(void) { for (u32 n = 0; n < 256; n++) { u32 c = n; for (int k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320u ^ (c >> 1) : c >> 1; CRCT[0][n] = c; }
  for (u32 n = 0; n < 256; n++) { u32 c = CRCT[0][n]; for (int t = 1; t < 8; t++) { c = CRCT[0][c & 255] ^ (c >> 8); CRCT[t][n] = c; } } crcInit = 1; }
EXPORT("crc32") u32 zs_crc32(const u8* p, u32 n, u32 c) {
  if (!crcInit) crcMake(); c = ~c;
  while (n >= 8) { u32 a = c ^ (p[0] | (u32)p[1] << 8 | (u32)p[2] << 16 | (u32)p[3] << 24), b = p[4] | (u32)p[5] << 8 | (u32)p[6] << 16 | (u32)p[7] << 24;
    c = CRCT[7][a & 255] ^ CRCT[6][(a >> 8) & 255] ^ CRCT[5][(a >> 16) & 255] ^ CRCT[4][a >> 24] ^ CRCT[3][b & 255] ^ CRCT[2][(b >> 8) & 255] ^ CRCT[1][(b >> 16) & 255] ^ CRCT[0][b >> 24]; p += 8; n -= 8; }
  while (n--) c = CRCT[0][(c ^ *p++) & 255] ^ (c >> 8);
  return ~c;
}
EXPORT("xxh64") u32 zs_xxh64(const void* p, u32 n) { u64 h = ZSTD_XXH64(p, n, 0); xxHi = (u32)(h >> 32); return (u32)h; }
EXPORT("xxh64_hi") u32 zs_xxh64_hi(void) { return xxHi; }
#ifndef ZS_DECODE_ONLY
EXPORT("bound") u32 zs_bound(u32 n) { return (u32)ZSTD_compressBound(n); }
static ZSTD_CCtx* cctx;
/* level: 1..22; window_log 0 = zstd's choice for the level */
EXPORT("compress") u32 zs_compress(void* dst, u32 dcap, const void* src, u32 n, int level, u32 window_log) {
  if (!cctx) cctx = ZSTD_createCCtx(); if (!cctx) return (u32)-1;
  ZSTD_CCtx_reset(cctx, ZSTD_reset_session_and_parameters);
  ZSTD_CCtx_setParameter(cctx, ZSTD_c_compressionLevel, level);
  ZSTD_CCtx_setParameter(cctx, ZSTD_c_checksumFlag, 0);
  ZSTD_CCtx_setParameter(cctx, ZSTD_c_contentSizeFlag, 1);
  if (window_log) ZSTD_CCtx_setParameter(cctx, ZSTD_c_windowLog, (int)window_log);
  return (u32)ZSTD_compress2(cctx, dst, dcap, src, n);
}
EXPORT("release") void zs_release(void) { if (cctx) { ZSTD_freeCCtx(cctx); cctx = 0; } }
#endif
