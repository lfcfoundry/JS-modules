#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds lz4.wasm (block and frame compress and decompress) from the pinned LZ4 release 1.11.1 (the first release without the 1.11.0 LZ4_resetStreamHC overflow).
# Needs clang 18+ with the wasm32 target, wasm-ld, curl and sha256sum. Nothing from the LZ4 package is run, only compiled.
set -e
cd "$(dirname "$0")"
V=1.11.1; SHA=683fed08a844ad012196381e40badf80c0bbe4962959761416d41c9e67d77ec7
W=${LZ4_WORK:-/tmp/lfc-lz4-kit-lz4}; mkdir -p "$W"
if [ ! -d "$W/lz4-$V" ]; then
  curl -fsSL -o "$W/lz4-$V.tar.gz" "https://github.com/lz4/lz4/releases/download/v$V/lz4-$V.tar.gz"
  echo "$SHA  $W/lz4-$V.tar.gz" | sha256sum -c -
  tar xzf "$W/lz4-$V.tar.gz" -C "$W"
fi
L="$W/lz4-$V/lib"
F="--target=wasm32 -O2 -mbulk-memory -nostdlib -ffreestanding -fno-builtin-memcpy -fno-builtin-memset -DNDEBUG -DLZ4_DEBUG=0 -DXXH_NAMESPACE=LZ4_ -Wno-deprecated-declarations -Istubs -I$L"
LD="-Wl,--no-entry -Wl,--export=__heap_base -Wl,--initial-memory=1048576 -Wl,--max-memory=2147483648 -Wl,-z,stack-size=262144 -Wl,--strip-all -Wl,--global-base=1024"
clang $F $LD -o lz4.wasm lz4-glue.c $L/lz4.c $L/lz4hc.c $L/lz4frame.c $L/xxhash.c
wc -c lz4.wasm
