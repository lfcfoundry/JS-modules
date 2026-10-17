#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds memory-compression.wasm from memory-compression.c and prints its size. Needs clang with the wasm32 target and wasm-ld.
set -e
cd "$(dirname "$0")"
clang --target=wasm32 -O3 -msimd128 -mbulk-memory -nostdlib -fno-builtin-memcpy -ffreestanding \
  -Wl,--no-entry -Wl,--export=__heap_base -Wl,--export=lz4_decode -Wl,--export=lz4_encode \
  -Wl,--export=shuffle -Wl,--export=unshuffle -Wl,--export=delta_planes -Wl,--export=undelta_planes -Wl,--export=inflate_raw -Wl,--export=df_init -Wl,--export=df_run -Wl,--export=df_lf -Wl,--export=df_df -Wl,--export=df_cov -Wl,--export=df_extra \
  -Wl,--initial-memory=4194304 -Wl,--max-memory=2147483648 -Wl,-z,stack-size=8192 -Wl,--strip-all -Wl,--global-base=1024 \
  -o memory-compression.wasm memory-compression.c
wc -c memory-compression.wasm
