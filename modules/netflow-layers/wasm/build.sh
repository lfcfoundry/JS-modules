#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds order.wasm (the row-order search and the row placement of netflow-layers) from order.c and prints its size. Needs clang (18 or newer) with the wasm32 target; wasm-ld is called by clang.
#   sh modules/netflow-layers/wasm/build.sh            order.wasm
#   sh modules/netflow-layers/wasm/build.sh --check    builds to a temporary file and exits 1 when it is not byte for byte the order.wasm that ships
# No fused multiply-add and no fast-math: the arithmetic has to match JavaScript's to the last bit (see order.c). Then run embed.py to put the file into ../netflow-layers.js.
set -e
cd "$(dirname "$0")"
FLAGS="--target=wasm32 -O3 -ffp-contract=off -mnontrapping-fptoint -mbulk-memory -nostdlib -ffreestanding -fno-builtin"
LINK="-Wl,--no-entry -Wl,--export=order -Wl,--export=place -Wl,--export-memory -Wl,--export=__heap_base -Wl,--initial-memory=1048576 -Wl,-z,stack-size=16384 -Wl,--strip-all -Wl,--global-base=1024"
case "$1" in
  --check) T=$(mktemp); clang $FLAGS $LINK -o "$T" order.c; if cmp -s "$T" order.wasm; then echo "order.wasm is what order.c builds"; rm -f "$T"; else echo "order.wasm is NOT what order.c builds"; rm -f "$T"; exit 1; fi ;;
  *) clang $FLAGS $LINK -o order.wasm order.c; wc -c order.wasm ;;
esac
