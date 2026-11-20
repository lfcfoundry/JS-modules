#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
# Version 1.1.0 (API 1)
# Joins src/head.js and src/api.js into lz4-kit.js with wasm/lz4.wasm embedded as base64.
# Rebuild the WebAssembly with sh wasm/build.sh (clang 18+). Run from anywhere.
import base64, os
here = os.path.dirname(os.path.abspath(__file__))
src = ''.join(open(os.path.join(here, 'src', n), encoding='utf-8').read() for n in ('head.js', 'api.js'))
b64 = base64.b64encode(open(os.path.join(here, 'wasm', 'lz4.wasm'), 'rb').read()).decode()
out = src.replace('/*LK:BEGIN*//*LK:END*/', '"' + b64 + '"')
open(os.path.join(here, 'lz4-kit.js'), 'w', encoding='utf-8').write(out)
print('lz4-kit.js', len(out))
