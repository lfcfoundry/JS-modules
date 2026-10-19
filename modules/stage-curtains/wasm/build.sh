#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds velvet.wasm (the WebAssembly velvet pixel loop) from velvet.c and prints its size. Needs clang (18 or newer) with the wasm32 target; clang calls wasm-ld itself.
#   sh modules/stage-curtains/wasm/build.sh            builds velvet.wasm
#   sh modules/stage-curtains/wasm/build.sh --check    builds to a temporary file and exits 1 when it is not byte for byte the velvet.wasm that ships
# The module imports its memory; '__heap_base' tells the caller where free space starts (everything below it belongs to the module).
# No fused multiply-add (-ffp-contract=off) and no fast-math: the floating-point results have to match JavaScript's to the last bit. Then run embed.py to put the file into ../stage-curtains.js.
set -e
cd "$(dirname "$0")"
FLAGS="--target=wasm32 -O3 -ffp-contract=off -nostdlib -Wl,--no-entry -Wl,--export=paint -Wl,--export=__heap_base -Wl,--import-memory -Wl,--strip-all"
if [ "$1" = "--check" ]; then
  T=$(mktemp); clang $FLAGS -o "$T" velvet.c
  if cmp -s "$T" velvet.wasm; then echo "velvet.wasm is what velvet.c builds"; rm -f "$T"; else echo "velvet.wasm is NOT what velvet.c builds"; rm -f "$T"; exit 1; fi
else
  clang $FLAGS -o velvet.wasm velvet.c; wc -c velvet.wasm
fi
