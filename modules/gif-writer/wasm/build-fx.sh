#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds pixfx.wasm (the WebAssembly half of the picture filters in ../gif-writer-fx.js) from pixfx.c and prints its size. Needs clang (18 or newer) with the wasm32 target.
#   sh modules/gif-writer/wasm/build-fx.sh            pixfx.wasm
#   sh modules/gif-writer/wasm/build-fx.sh --check    builds to a temporary file and exits 1 when it is not byte for byte the pixfx.wasm that ships
# Then run embed-fx.py to put the file into ../gif-writer-fx.js.
set -e
cd "$(dirname "$0")"
FLAGS="--target=wasm32 -O3 -msimd128 -mbulk-memory -ffp-contract=off -nostdlib -Wl,--no-entry -Wl,--strip-all -Wl,--export=blur -Wl,--export=unsharp -Wl,--export=glow_down -Wl,--export=glow_up -Wl,--export=grade -Wl,--export=__heap_base"
case "$1" in
  --check) T=$(mktemp); clang $FLAGS -o "$T" pixfx.c; if cmp -s "$T" pixfx.wasm; then echo "pixfx.wasm is what pixfx.c builds"; rm -f "$T"; else echo "pixfx.wasm is NOT what pixfx.c builds"; rm -f "$T"; exit 1; fi ;;
  *) clang $FLAGS -o pixfx.wasm pixfx.c; wc -c pixfx.wasm ;;
esac
