#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds ef.wasm (plain WebAssembly) and ef-simd.wasm (the same C with 128-bit SIMD) from ef.c and prints their sizes. Needs clang (18 or newer) with the wasm32 target; wasm-ld is called by clang.
#   sh wasm/build.sh            both files
#   sh wasm/build.sh --check    builds to temporary files and exits 1 when they are not byte for byte the files that ship
# No fused multiply-add and no fast-math. Then run embed.py to put both files into the module's .js.
set -e
cd "$(dirname "$0")"
FLAGS="--target=wasm32 -O3 -ffp-contract=off -mnontrapping-fptoint -mbulk-memory -nostdlib -ffreestanding -fno-builtin"
LINK="-Wl,--no-entry -Wl,--export=ef_get -Wl,--export=ef_next -Wl,--export=ef_get_many -Wl,--export=ef_next_many -Wl,--export=ef_decode -Wl,--export=ef_build -Wl,--export=ef_gather -Wl,--export=ef_intersect -Wl,--export=pef_get -Wl,--export=pef_next -Wl,--export=pef_get_many -Wl,--export=pef_next_many -Wl,--export=pef_decode_range -Wl,--export-memory -Wl,--export=__heap_base -Wl,--initial-memory=131072 -Wl,-z,stack-size=16384 -Wl,--strip-all -Wl,--global-base=1024"
b() { clang $FLAGS $2 $LINK -o "$1" ef.c; }
case "$1" in
  --check) T=$(mktemp); U=$(mktemp); b "$T" ""; b "$U" "-msimd128"; if cmp -s "$T" ef.wasm && cmp -s "$U" ef-simd.wasm; then echo "ef.wasm and ef-simd.wasm are what ef.c builds"; rm -f "$T" "$U"; else echo "the wasm files are NOT what ef.c builds"; rm -f "$T" "$U"; exit 1; fi ;;
  *) b ef.wasm ""; b ef-simd.wasm "-msimd128"; wc -c ef.wasm ef-simd.wasm ;;
esac
