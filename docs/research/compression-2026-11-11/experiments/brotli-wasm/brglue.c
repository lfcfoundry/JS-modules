/* Copyright (c) 2026 LFC Foundry. MIT License. Research only: Brotli 1.1.0 (MIT, Google) for wasm32 without a C library; allocator copied from wasm/zstd-glue.c. Build: see RESEARCH.md E15. */
/* Copyright (c) 2026 LFC Foundry. MIT License.
 * Small C layer around zstd (BSD-3-Clause, Meta Platforms) for wasm32: a first-fit allocator that grows the wasm memory, and the calls the JavaScript side needs.
 * Built by build.sh together with the pinned zstd release; ZS_DECODE_ONLY builds the decoder alone. */
#include <stddef.h>
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
#include <brotli/encode.h>
#include <brotli/decode.h>
void br_exit(int c) { (void)c; __builtin_trap(); }
/* log2 for doubles: exponent plus a short series on the mantissa (accurate to ~1e-9, enough for Brotli's cost estimates) */
double br_log2(double x) { if (x <= 0) return -1e300; union { double d; unsigned long long u; } v = { x }; int e = (int)((v.u >> 52) & 2047) - 1023; v.u = (v.u & 0xFFFFFFFFFFFFFull) | 0x3FF0000000000000ull;
  double m = v.d, t = (m - 1) / (m + 1), t2 = t * t, s = 0, p = t; for (int k = 1; k < 40; k += 2) { s += p / k; p *= t2; } return e + 2 * s * 1.4426950408889634; }
EXPORT("malloc") void* br_malloc(u32 n) { return lfc_malloc(n); }
EXPORT("free") void br_free(void* p) { lfc_free(p); }
EXPORT("bound") u32 br_bound(u32 n) { return (u32)BrotliEncoderMaxCompressedSize(n); }
EXPORT("compress") u32 br_compress(void* dst, u32 dcap, const void* src, u32 n, int q, int lgwin) { size_t out = dcap; if (!BrotliEncoderCompress(q, lgwin ? lgwin : 22, BROTLI_MODE_GENERIC, n, src, &out, dst)) return 0xFFFFFFFFu; return (u32)out; }
EXPORT("decompress") u32 br_decompress(void* dst, u32 dcap, const void* src, u32 n) { size_t out = dcap; if (BrotliDecoderDecompress(n, src, &out, dst) != BROTLI_DECODER_RESULT_SUCCESS) return 0xFFFFFFFFu; return (u32)out; }
