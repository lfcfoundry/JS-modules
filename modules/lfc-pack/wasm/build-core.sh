#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds core.wasm (SIMD128) and core-plain.wasm (no SIMD, same results) from core.c. Needs clang 18+ with the wasm32 target and wasm-ld.
set -e
cd "$(dirname "$0")"
F="--target=wasm32 -O3 -nostdlib -fno-builtin -mbulk-memory -Wl,--no-entry -Wl,--export-dynamic -Wl,--initial-memory=402653184 -Wl,--max-memory=1073741824 -Wl,-z,stack-size=65536 -Wl,--strip-all"
clang $F -msimd128 -o core.wasm core.c
clang $F -o core-plain.wasm core.c
wc -c core.wasm core-plain.wasm
