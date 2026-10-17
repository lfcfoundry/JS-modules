#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds jso-kernels.wasm from jso-kernels.c and prints its size. Needs clang with the wasm32 target and wasm-ld.
set -e
cd "$(dirname "$0")"
clang --target=wasm32 -O3 -nostdlib -ffreestanding \
  -Wl,--no-entry -Wl,--export=__heap_base -Wl,--export=tpl_scan \
  -Wl,--initial-memory=1048576 -Wl,--max-memory=1073741824 -Wl,-z,stack-size=4096 -Wl,--strip-all -Wl,--global-base=1024 \
  -o jso-kernels.wasm jso-kernels.c
wc -c jso-kernels.wasm
