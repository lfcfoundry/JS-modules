#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds flatscan.wasm (fast flat writer) and tpl4.wasm (log templates, reader side). Needs clang 18+ with the wasm32 target and wasm-ld.
# With clang 18.1.3 this reproduces the committed binaries byte for byte; other clang versions give working but different bytes.
set -e
cd "$(dirname "$0")"
F="--target=wasm32 -O3 -nostdlib -fno-builtin -mbulk-memory -Wl,--no-entry -Wl,--export=__heap_base -Wl,--initial-memory=1048576 -Wl,--max-memory=2147483648 -Wl,-z,stack-size=16384 -Wl,--strip-all"
clang $F -o flatscan.wasm flatscan.c
clang $F -o tpl4.wasm tpl4.c
wc -c flatscan.wasm tpl4.wasm
