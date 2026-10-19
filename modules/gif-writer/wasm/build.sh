#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds gif.wasm (the WebAssembly half of the GIF writer) from gif.c and prints its size. Needs clang (18 or newer) with the wasm32 target; the link step uses wasm-ld, which clang calls itself.
#   sh modules/gif-writer/wasm/build.sh            gif.wasm
#   sh modules/gif-writer/wasm/build.sh --check    builds to a temporary file and exits 1 when it is not byte for byte the gif.wasm that ships
# Then run embed.py to put the file into ../gif-writer.js.
set -e
cd "$(dirname "$0")"
FLAGS="--target=wasm32 -O3 -mbulk-memory -ffp-contract=off -nostdlib -Wl,--no-entry -Wl,--export=setup -Wl,--export=frame -Wl,--export=encode -Wl,--export=lzw -Wl,--export=hist_reset -Wl,--export=hist_picture -Wl,--export=hist_extract -Wl,--export=quantize -Wl,--export=__heap_base -Wl,--export-memory -Wl,-z,stack-size=8192 -Wl,--strip-all"
case "$1" in
  --check) T=$(mktemp); clang $FLAGS -o "$T" gif.c; if cmp -s "$T" gif.wasm; then echo "gif.wasm is what gif.c builds"; rm -f "$T"; else echo "gif.wasm is NOT what gif.c builds"; rm -f "$T"; exit 1; fi ;;
  *) clang $FLAGS -o gif.wasm gif.c; wc -c gif.wasm ;;
esac
