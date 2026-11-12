/* Copyright (c) 2026 LFC Foundry. MIT License. */
/* Stand-in for <stdlib.h> for a research wasm32 Brotli build without a C library. */
#ifndef BR_STUB_STDLIB_H
#define BR_STUB_STDLIB_H
#include <stddef.h>
void* lfc_malloc(size_t n); void lfc_free(void* p); void br_exit(int c);
#define malloc(n) lfc_malloc(n)
#define free(p) lfc_free(p)
#define exit(c) br_exit(c)
#define EXIT_FAILURE 1
#endif
