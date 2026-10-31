#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds order.wasm (the WebAssembly half of netflow-sankey's order search) from order.c and prints its size. Needs clang (18 or newer) with the wasm32 target; the link step uses wasm-ld, which clang calls itself.
#   sh modules/netflow-sankey/wasm/build.sh            order.wasm
#   sh modules/netflow-sankey/wasm/build.sh --check    builds to a temporary file and exits 1 when it is not byte for byte the order.wasm that ships
# Then run embed.py to put the file into ../netflow-sankey.js.
set -e
cd "$(dirname "$0")"
FLAGS="--target=wasm32 -O3 -mbulk-memory -ffp-contract=off -nostdlib -Wl,--no-entry -Wl,--export=bind -Wl,--export=run -Wl,--export=relax -Wl,--export=__heap_base -Wl,--export-memory -Wl,-z,stack-size=8192 -Wl,--strip-all"
case "$1" in
  --check) T=$(mktemp); clang $FLAGS -o "$T" order.c; if cmp -s "$T" order.wasm; then echo "order.wasm is what order.c builds"; rm -f "$T"; else echo "order.wasm is NOT what order.c builds"; rm -f "$T"; exit 1; fi ;;
  *) clang $FLAGS -o order.wasm order.c; wc -c order.wasm ;;
esac
