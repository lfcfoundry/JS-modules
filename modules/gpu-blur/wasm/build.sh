#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds blur.wasm (the WebAssembly box-blur kernel) and blurmt.wasm (the same kernel for the opt-in threads route: -DTHREADS, one shared memory imported, no static data)
# from blur.c and prints their sizes. Needs clang (18 or newer) with the wasm32 target; the link step uses wasm-ld, which clang calls itself.
#   sh modules/gpu-blur/wasm/build.sh            blur.wasm and blurmt.wasm
#   sh modules/gpu-blur/wasm/build.sh --check    builds to temporary files and exits 1 when they are not byte for byte the files that ship
# No fused multiply-add and no fast-math (the arithmetic is exact integer sums plus one float rounding step, see blur.c). Then run embed.py to put both files into ../gpu-blur.js.
set -e
cd "$(dirname "$0")"
FLAGS="--target=wasm32 -O3 -msimd128 -ffp-contract=off -mnontrapping-fptoint -nostdlib -Wl,--no-entry -Wl,--export=hrows -Wl,--export=vcols -Wl,--export-memory -Wl,--initial-memory=131072 -Wl,-z,stack-size=16384 -Wl,--strip-all"
MT="$FLAGS -matomics -mbulk-memory -DTHREADS -Wl,--import-memory -Wl,--shared-memory -Wl,--max-memory=4294967296"
MT=$(echo "$MT" | sed 's/ -Wl,--export=hrows -Wl,--export=vcols -Wl,--export-memory -Wl,--initial-memory=131072//')
case "$1" in
  --check) bad=0; T=$(mktemp)
    clang $FLAGS -o "$T" blur.c; if cmp -s "$T" blur.wasm; then echo "blur.wasm is what blur.c builds"; else echo "blur.wasm is NOT what blur.c builds"; bad=1; fi
    clang $MT -o "$T" blur.c; if cmp -s "$T" blurmt.wasm; then echo "blurmt.wasm is what blur.c builds with -DTHREADS"; else echo "blurmt.wasm is NOT what blur.c builds with -DTHREADS"; bad=1; fi
    rm -f "$T"; exit $bad ;;
  *) clang $FLAGS -o blur.wasm blur.c; clang $MT -o blurmt.wasm blur.c; wc -c blur.wasm blurmt.wasm ;;
esac
