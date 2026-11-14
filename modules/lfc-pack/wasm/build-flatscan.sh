#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds flatscan.wasm (fast flat writer, SIMD128) and flatscan-plain.wasm (the same code without SIMD, same results), tpl4.wasm (log templates, reader side) and rowscan.wasm (packTables row text, uses the tokenizer's memory). Needs clang 18+ with the wasm32 target and wasm-ld.
# With clang 18.1.3 this reproduces the committed binaries byte for byte; other clang versions give working but different bytes.
set -e
cd "$(dirname "$0")"
F="--target=wasm32 -O3 -nostdlib -fno-builtin -mbulk-memory -Wl,--no-entry -Wl,--export=__heap_base -Wl,--initial-memory=1048576 -Wl,--max-memory=2147483648 -Wl,-z,stack-size=16384 -Wl,--strip-all"
clang $F -msimd128 -o flatscan.wasm flatscan.c
clang $F -o flatscan-plain.wasm flatscan.c
clang $F -o tpl4.wasm tpl4.c
clang --target=wasm32 -O3 -nostdlib -fno-builtin -Wl,--no-entry -Wl,--import-memory -Wl,--strip-all -o rowscan.wasm rowscan.c
wc -c flatscan.wasm flatscan-plain.wasm tpl4.wasm rowscan.wasm
clang --target=wasm32 -O3 -nostdlib -fno-builtin -mbulk-memory -Wl,--no-entry -Wl,--export-memory -Wl,--export=__heap_base -Wl,--initial-memory=131072 -Wl,--max-memory=2147483648 -Wl,-z,stack-size=4096 -Wl,--strip-all -o bdec.wasm bdec.c
wc -c bdec.wasm
