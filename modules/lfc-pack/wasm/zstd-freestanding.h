/* Copyright (c) 2026 LFC Foundry. MIT License. Force-included when zstd is built for wasm32 without a C library. */
#ifndef ZSTD_FREESTANDING_H
#define ZSTD_FREESTANDING_H
#include <stddef.h>
#include <limits.h>
void* lfc_malloc(size_t n); void* lfc_calloc(size_t n, size_t m); void lfc_free(void* p);
#define ZSTD_DEPS_COMMON
#define ZSTD_DEPS_MALLOC
#define ZSTD_memcpy(d,s,l) __builtin_memcpy((d),(s),(l))
#define ZSTD_memmove(d,s,l) __builtin_memmove((d),(s),(l))
#define ZSTD_memset(p,v,l) __builtin_memset((p),(v),(l))
#define ZSTD_malloc(s) lfc_malloc(s)
#define ZSTD_calloc(n,s) lfc_calloc((n),(s))
#define ZSTD_free(p) lfc_free((p))
#endif
