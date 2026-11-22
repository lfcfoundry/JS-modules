#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
# Version 1.0.1 (API 1)
# Joins src/head.js, src/zstd-core.js and src/api.js into zstd-kit.js (compress and decompress, wasm/zstd-full.wasm)
# and zstd-kit-dec.js (decompress only, wasm/zstd-dec.wasm). src/zstd-core.js is also joined into lfc-pack.js by its build.py.
# Rebuild the WebAssembly with sh wasm/build.sh (clang 18+). Run from anywhere.
import base64, os
here = os.path.dirname(os.path.abspath(__file__))
src = ''.join(open(os.path.join(here, 'src', n), encoding='utf-8').read() for n in ('head.js', 'zstd-core.js', 'api.js'))
for name, wasm, dec in (('zstd-kit.js', 'zstd-full.wasm', False), ('zstd-kit-dec.js', 'zstd-dec.wasm', True)):
    b64 = base64.b64encode(open(os.path.join(here, 'wasm', wasm), 'rb').read()).decode()
    out = src.replace('/*ZK:BEGIN*//*ZK:END*/', '"' + b64 + '"')
    if dec:
        out = out.replace('/*ZK-DEC*/false', 'true').replace('zstd-kit.js: Zstandard compression', 'zstd-kit-dec.js: Zstandard decompression')
    open(os.path.join(here, name), 'w', encoding='utf-8').write(out)
    print(name, len(out))
