#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds ppmd7.wasm from ppmd7.c and prints its size. Needs clang with the wasm32 target and wasm-ld. Then run embed.py to put it into ../ppmd-decode-wasm.js.
# The module imports its memory (env.memory); ppmd-decode-wasm.js hands it one that holds scratch (at byte 4096), the compressed bytes, the result and the model.
# Everything the module itself needs (its stack and a few globals) must end below byte 4096; this script checks that.
set -e
cd "$(dirname "$0")"
clang --target=wasm32 -O2 -nostdlib -fno-builtin -Wl,--no-entry -Wl,--export=__heap_base -Wl,--import-memory -Wl,--global-base=1024 -Wl,-z,stack-size=2048 \
  -Wl,--initial-memory=65536 -Wl,--strip-all -o ppmd7.wasm ppmd7.c
wc -c ppmd7.wasm
node -e "
const m = new WebAssembly.Module(require('fs').readFileSync('ppmd7.wasm'));
const i = new WebAssembly.Instance(m, { env: { memory: new WebAssembly.Memory({ initial: 1 }) } });
const hb = i.exports.__heap_base.value;
console.log('module uses memory up to byte ' + hb + ' (limit 4096)');
if (hb > 4096) { console.error('too big: raise SCRATCH in ppmd-decode-wasm.js'); process.exit(1); }"
