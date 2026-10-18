#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds force.wasm from force.c and stress.wasm from stress.c and prints their sizes. Needs clang with the wasm32 target and wasm-ld (checked with Ubuntu clang 18.1.3).
# -ffp-contract=off keeps every multiply and add separate, as in JavaScript, so the positions match the JavaScript ones to the last digit.
set -e
cd "$(dirname "$0")"
FLAGS="--target=wasm32 -O3 -msimd128 -mbulk-memory -ffp-contract=off -nostdlib -ffreestanding -fno-builtin"
LINK="-Wl,--no-entry -Wl,--export=__heap_base -Wl,--initial-memory=1048576 -Wl,--max-memory=2147483648 -Wl,-z,stack-size=8192 -Wl,--strip-all -Wl,--global-base=1024"
clang $FLAGS $LINK -Wl,--export=force_round -o force.wasm force.c
clang $FLAGS $LINK -o stress.wasm stress.c
wc -c force.wasm stress.wasm
