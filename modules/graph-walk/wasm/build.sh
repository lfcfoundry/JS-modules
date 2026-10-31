#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds graph-walk.wasm from graph-walk.c and prints its size. Needs clang (18 or newer) with the wasm32 target; wasm-ld is called by clang.
#   sh wasm/build.sh            build
#   sh wasm/build.sh --check    builds to a temporary file and exits 1 when it is not byte for byte the file that ships
# No fused multiply-add and no fast-math. Then run embed.py to put the file into graph-walk.js.
set -e
cd "$(dirname "$0")"
FLAGS="--target=wasm32 -O3 -ffp-contract=off -mnontrapping-fptoint -mbulk-memory -nostdlib -ffreestanding -fno-builtin"
LINK="-Wl,--no-entry -Wl,--export=gw_components -Wl,--export=gw_scc -Wl,--export=gw_topo -Wl,--export=gw_dijkstra -Wl,--export=gw_kcore -Wl,--export=gw_pagerank -Wl,--export=gw_betweenness -Wl,--export=gw_mst -Wl,--export-memory -Wl,--export=__heap_base -Wl,--initial-memory=131072 -Wl,-z,stack-size=4096 -Wl,--strip-all -Wl,--global-base=1024"
b() { clang $FLAGS $LINK -o "$1" graph-walk.c; }
case "$1" in
  --check) T=$(mktemp); b "$T"; if cmp -s "$T" graph-walk.wasm; then echo "graph-walk.wasm is what graph-walk.c builds"; rm -f "$T"; else echo "graph-walk.wasm is NOT what graph-walk.c builds"; rm -f "$T"; exit 1; fi ;;
  *) b graph-walk.wasm; wc -c graph-walk.wasm ;;
esac
