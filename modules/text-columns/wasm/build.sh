#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds tc.wasm (plain) and tc-simd.wasm (128-bit SIMD) from tc.c. Needs clang (18 or newer) with the wasm32 target.
#   sh wasm/build.sh            both files
#   sh wasm/build.sh --check    builds to temporary files and exits 1 when they are not byte for byte the files that ship
set -e
cd "$(dirname "$0")"
FLAGS="--target=wasm32 -O3 -ffp-contract=off -mnontrapping-fptoint -mbulk-memory -nostdlib -ffreestanding -fno-builtin"
LINK="-Wl,--no-entry -Wl,--export-memory -Wl,--export=__heap_base -Wl,--initial-memory=131072 -Wl,-z,stack-size=16384 -Wl,--strip-all -Wl,--global-base=1024"
b() { clang $FLAGS $2 $LINK -o "$1" tc.c; }
case "$1" in
  --check) T=$(mktemp); U=$(mktemp); b "$T" ""; b "$U" "-msimd128"; if cmp -s "$T" tc.wasm && cmp -s "$U" tc-simd.wasm; then echo "tc.wasm and tc-simd.wasm are what tc.c builds"; rm -f "$T" "$U"; else echo "the wasm files are NOT what tc.c builds"; rm -f "$T" "$U"; exit 1; fi ;;
  *) b tc.wasm ""; b tc-simd.wasm "-msimd128"; wc -c tc.wasm tc-simd.wasm ;;
esac
