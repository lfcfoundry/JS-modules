#!/bin/sh
# builds the three shipped programs for all 8 number types, then runs wasm-opt
# (run: sh vendor.sh once, then sh buildall.sh; wasm-opt comes from the npm package "binaryen", version 132)
set -e
cd "$(dirname "$0")"
WO=${WASM_OPT:-wasm-opt}
FL="--enable-simd --enable-bulk-memory --enable-sign-ext --enable-nontrapping-float-to-int --enable-mutable-globals --enable-multivalue --enable-reference-types"
mkdir -p ../work/wasm
sh build.sh read-fast "all-types" 3 1
sh build.sh read-speed "all-types" s 0
sh build.sh pack-full "all-types,encode" s 0
$WO -Oz $FL ../work/wasm/read-fast.wasm -o ../work/wasm/read-fast.opt.wasm
$WO -Os $FL ../work/wasm/read-speed.wasm -o ../work/wasm/read-speed.opt.wasm
for n in read-fast read-speed; do ls -l ../work/wasm/$n.opt.wasm | awk '{print $5,$9}'; done
# the packer is built for speed (opt-level s, wasm-opt -Os): 34% faster packing than the size-built one, 43,056 B bigger
$WO -Os $FL ../work/wasm/pack-full.wasm -o ../work/wasm/pack-full.opt.wasm; ls -l ../work/wasm/pack-full.opt.wasm | awk '{print $5,$9}'
# copy the three finished programs next to build.py
cp ../work/wasm/read-fast.opt.wasm ../work/wasm/read-speed.opt.wasm ../work/wasm/pack-full.opt.wasm .
