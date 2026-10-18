#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Puts wasm/jso-kernels.wasm into src/jso-layer.js between the KW:BEGIN and KW:END markers (base64 text).
Run after build.sh, then python3 modules/memory-compression/build.py:  python3 modules/memory-compression/wasm/jso/embed.py"""
import base64, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
js_path = os.path.join(here, '..', '..', 'src', 'jso-layer.js')
b64 = base64.b64encode(open(os.path.join(here, 'jso-kernels.wasm'), 'rb').read()).decode()
src = open(js_path).read()
new, n = re.subn(r"(/\*KW:BEGIN\*/)'[^']*'(/\*KW:END\*/)", lambda m: m.group(1) + "'" + b64 + "'" + m.group(2), src)
if n != 1: sys.exit('markers not found exactly once')
open(js_path, 'w').write(new)
print('embedded %d bytes as %d characters' % (len(b64) * 3 // 4, len(b64)))
