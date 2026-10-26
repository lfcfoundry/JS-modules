/* Copyright (c) 2026 LFC Foundry. MIT License. Stand-in for <string.h> when building zstd for wasm32 without a C library. */
#ifndef LFC_STUB_STRING_H
#define LFC_STUB_STRING_H
#include <stddef.h>
#define memcpy(d,s,n) __builtin_memcpy((d),(s),(n))
#define memmove(d,s,n) __builtin_memmove((d),(s),(n))
#define memset(p,v,n) __builtin_memset((p),(v),(n))
#define memcmp(a,b,n) __builtin_memcmp((a),(b),(n))
#endif
