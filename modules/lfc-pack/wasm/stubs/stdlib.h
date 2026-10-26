/* Copyright (c) 2026 LFC Foundry. MIT License. Stand-in for <stdlib.h> when building zstd for wasm32 without a C library. */
#ifndef LFC_STUB_STDLIB_H
#define LFC_STUB_STDLIB_H
#include <stddef.h>
void* lfc_malloc(size_t n); void* lfc_calloc(size_t n, size_t m); void lfc_free(void* p);
#define malloc(n) lfc_malloc(n)
#define calloc(n, m) lfc_calloc((n), (m))
#define free(p) lfc_free(p)
#endif
