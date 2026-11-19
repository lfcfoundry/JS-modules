/* Copyright (c) 2026 LFC Foundry. MIT License. Stand-in for <assert.h> when building LZ4 for wasm32 without a C library (NDEBUG: asserts compile to nothing). */
#ifndef LFC_STUB_ASSERT_H
#define LFC_STUB_ASSERT_H
#define assert(x) ((void)0)
#endif
