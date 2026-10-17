#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds walker-sim.wasm from walker-sim.c and prints its size. Needs clang with the wasm32 target and wasm-ld. Then run embed.py to put it into ../walker-sim-wasm.js.
# The module imports its memory (env.memory, at least 2 pages): walker-sim-wasm.js hands it one that holds the run's arrays above the first 66,560 bytes.
set -e
cd "$(dirname "$0")"
clang --target=wasm32 -O3 -nostdlib -ffreestanding -Wl,--no-entry -Wl,--export=walk -Wl,--import-memory -Wl,--initial-memory=131072 -Wl,-z,stack-size=1024 -Wl,--strip-all \
  -o walker-sim.wasm walker-sim.c
wc -c walker-sim.wasm
