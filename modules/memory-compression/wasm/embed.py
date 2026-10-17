#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Puts wasm/memory-compression.wasm into memory-compression.js between the WASM:BEGIN and WASM:END markers (base64 text).
Run after build.sh:  python3 modules/memory-compression/wasm/embed.py"""
import base64, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
js_path = os.path.join(here, '..', 'memory-compression.js')
b64 = base64.b64encode(open(os.path.join(here, 'memory-compression.wasm'), 'rb').read()).decode()
src = open(js_path).read()
new, n = re.subn(r"(/\*WASM:BEGIN\*/)'[^']*'(/\*WASM:END\*/)", lambda m: m.group(1) + "'" + b64 + "'" + m.group(2), src)
if n != 1: sys.exit('markers not found exactly once')
open(js_path, 'w').write(new)
print('embedded %d bytes as %d characters' % (len(b64) * 3 // 4, len(b64)))
