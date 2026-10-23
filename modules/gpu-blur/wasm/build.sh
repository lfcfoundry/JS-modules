#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds blur.wasm (the WebAssembly box-blur kernel) from blur.c and prints its size. Needs clang (18 or newer) with the wasm32 target; the link step uses wasm-ld, which clang calls itself.
#   sh modules/gpu-blur/wasm/build.sh            blur.wasm
#   sh modules/gpu-blur/wasm/build.sh --check    builds to a temporary file and exits 1 when it is not byte for byte the blur.wasm that ships
# No fused multiply-add and no fast-math (the arithmetic is exact integer sums plus one float rounding step, see blur.c). Then run embed.py to put the file into ../gpu-blur.js.
set -e
cd "$(dirname "$0")"
FLAGS="--target=wasm32 -O3 -msimd128 -ffp-contract=off -mnontrapping-fptoint -nostdlib -Wl,--no-entry -Wl,--export=hrows -Wl,--export=vcols -Wl,--export-memory -Wl,--initial-memory=131072 -Wl,-z,stack-size=16384 -Wl,--strip-all"
case "$1" in
  --check) T=$(mktemp); clang $FLAGS -o "$T" blur.c; if cmp -s "$T" blur.wasm; then echo "blur.wasm is what blur.c builds"; rm -f "$T"; else echo "blur.wasm is NOT what blur.c builds"; rm -f "$T"; exit 1; fi ;;
  *) clang $FLAGS -o blur.wasm blur.c; wc -c blur.wasm ;;
esac
