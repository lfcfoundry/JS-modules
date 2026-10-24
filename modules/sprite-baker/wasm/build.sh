#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds tri.wasm (the WebAssembly triangle filler) from tri.c and prints its size. Needs clang (18 or newer) with the wasm32 target; the link step uses wasm-ld, which clang calls itself.
#   sh modules/sprite-baker/wasm/build.sh                    tri.wasm, everything (textures and ridge lines)
#   sh modules/sprite-baker/wasm/build.sh lean tri-lean.wasm  a smaller file for a game that uses neither textures nor ridge lines (-DNO_TEXTURE -DNO_RIDGE); name it as you like
#   sh modules/sprite-baker/wasm/build.sh --check            builds to a temporary file and exits 1 when it is not byte for byte the tri.wasm that ships
# No fused multiply-add and no fast-math: the arithmetic has to match JavaScript's to the last bit (see tri.c). Then run embed.py to put the file into ../sprite-baker-wasm.js.
set -e
cd "$(dirname "$0")"
FLAGS="--target=wasm32 -O3 -ffp-contract=off -mnontrapping-fptoint -nostdlib -Wl,--no-entry -Wl,--export=fill -Wl,--export=fill_mesh -Wl,--export=outline -Wl,--export=features -Wl,--export-memory -Wl,--initial-memory=16777216 -Wl,-z,stack-size=65536 -Wl,--strip-all"
case "$1" in
  lean) clang $FLAGS -DNO_TEXTURE -DNO_RIDGE -o "${2:-tri-lean.wasm}" tri.c; wc -c "${2:-tri-lean.wasm}" ;;
  --check) T=$(mktemp); clang $FLAGS -o "$T" tri.c; if cmp -s "$T" tri.wasm; then echo "tri.wasm is what tri.c builds"; rm -f "$T"; else echo "tri.wasm is NOT what tri.c builds"; rm -f "$T"; exit 1; fi ;;
  *) clang $FLAGS -o tri.wasm tri.c; wc -c tri.wasm ;;
esac
