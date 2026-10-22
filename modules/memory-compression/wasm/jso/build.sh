#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds jso-kernels.wasm from jso-kernels.c and prints its size. Needs clang with the wasm32 target and wasm-ld.
set -e
cd "$(dirname "$0")"
clang --target=wasm32 -O3 -nostdlib -ffreestanding -fno-builtin -ffp-contract=off \
  -Wl,--no-entry -Wl,--export=__heap_base -Wl,--export=tpl_scan -Wl,--export=fsst_tbl -Wl,--export=fsst_init -Wl,--export=fsst_encode_col -Wl,--export=fsst_decode_col -Wl,--export=rans_dec -Wl,--export=rans_enc -Wl,--export=planes_split -Wl,--export=planes_join -Wl,--export=plane_stats -Wl,--export=bp_unpack -Wl,--export=bp_pack -Wl,--export=delta_enc -Wl,--export=delta_dec -Wl,--export=block_stats -Wl,--export=alp_enc \
  -Wl,--initial-memory=1048576 -Wl,--max-memory=1073741824 -Wl,-z,stack-size=4096 -Wl,--strip-all -Wl,--global-base=1024 \
  -o jso-kernels.wasm jso-kernels.c
wc -c jso-kernels.wasm
