#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds crc32.wasm (the WebAssembly checksum) from crc32.c and prints its size. Needs clang (18 or newer) with the wasm32 target; the link step uses wasm-ld, which clang calls itself.
#   sh modules/zip-open/wasm/build.sh            crc32.wasm
#   sh modules/zip-open/wasm/build.sh --check    builds to a temporary file and exits 1 when it is not byte for byte the crc32.wasm that ships
# Then run embed.py to put the file into ../zip-open.js.
set -e
cd "$(dirname "$0")"
FLAGS="--target=wasm32 -O3 -ffp-contract=off -nostdlib -DSLICE=16 -Wl,--no-entry -Wl,--export=init -Wl,--export=crc -Wl,--export=__heap_base -Wl,--export-memory -Wl,-z,stack-size=4096 -Wl,--strip-all"
case "$1" in
  --check) T=$(mktemp); clang $FLAGS -o "$T" crc32.c; if cmp -s "$T" crc32.wasm; then echo "crc32.wasm is what crc32.c builds"; rm -f "$T"; else echo "crc32.wasm is NOT what crc32.c builds"; rm -f "$T"; exit 1; fi ;;
  *) clang $FLAGS -o crc32.wasm crc32.c; wc -c crc32.wasm ;;
esac
