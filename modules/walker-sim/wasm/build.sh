#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds walker-sim.wasm (the walking loop, from walker-sim.c), sweep.wasm and sweep-scalar.wasm (the what-if rounds, from sweep.c; the second without SIMD, for engines that refuse SIMD) and prints their sizes. Needs clang with the wasm32 target and wasm-ld. Then run embed.py to put them into ../walker-sim-wasm.js.
# Each module imports its memory (env.memory, at least 2 pages): walker-sim-wasm.js hands it one that holds the arrays above the first 66,560 bytes.
set -e
cd "$(dirname "$0")"
clang --target=wasm32 -O3 -nostdlib -ffreestanding -Wl,--no-entry -Wl,--export=walk -Wl,--import-memory -Wl,--initial-memory=131072 -Wl,-z,stack-size=1024 -Wl,--strip-all \
  -o walker-sim.wasm walker-sim.c
# -ffp-contract=off keeps every addition and multiplication separate, so the numbers are the same as the JavaScript ones
clang --target=wasm32 -O3 -nostdlib -ffreestanding -ffp-contract=off -msimd128 -Wl,--no-entry -Wl,--export=sweeps -Wl,--import-memory -Wl,--initial-memory=131072 -Wl,-z,stack-size=1024 -Wl,--strip-all \
  -o sweep.wasm sweep.c
clang --target=wasm32 -O3 -nostdlib -ffreestanding -ffp-contract=off -Wl,--no-entry -Wl,--export=sweeps -Wl,--import-memory -Wl,--initial-memory=131072 -Wl,-z,stack-size=1024 -Wl,--strip-all \
  -o sweep-scalar.wasm sweep.c
wc -c walker-sim.wasm sweep.wasm sweep-scalar.wasm
