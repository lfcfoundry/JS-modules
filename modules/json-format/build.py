#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
# Version 0.1.0 (API 0)
# Concatenates src/*.js into json-format.js and embeds the wasm modules (base64). Run from anywhere.
import base64, os, sys
here = os.path.dirname(os.path.abspath(__file__))
order = ['head', 'util', 'wasm', 'zstd', 'shred', 'nested', 'flat', 'container', 'api', 'pool', 'tail']
src = ''.join(open(os.path.join(here, 'src', n + '.js'), encoding='utf-8').read() for n in order)
mods = {'zstd-dec': 'wasm/zstd-dec.wasm', 'zstd-full': 'wasm/zstd-full.wasm', 'core': 'wasm/core.wasm', 'core-plain': 'wasm/core-plain.wasm'}
lit = '{' + ','.join('"%s":"%s"' % (k, base64.b64encode(open(os.path.join(here, v), 'rb').read()).decode()) for k, v in mods.items()) + '}'
a, b = '/*WASM:BEGIN*/', '/*WASM:END*/'
i = src.index(a); j = src.index(b)
out = src[:i + len(a)] + lit + src[j:]
open(os.path.join(here, 'json-format.js'), 'w', encoding='utf-8').write(out)
print('json-format.js', len(out))
