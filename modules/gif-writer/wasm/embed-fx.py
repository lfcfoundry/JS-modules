#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Puts wasm/pixfx.wasm into gif-writer-fx.js between the WASM:pixfx:BEGIN and WASM:pixfx:END markers (base64 text).
Run after build.sh:  python3 modules/gif-writer/wasm/embed.py            (--check only compares and exits 1 when they differ)"""
import base64, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
js_path = os.path.join(here, '..', 'gif-writer-fx.js')
b64 = base64.b64encode(open(os.path.join(here, 'pixfx.wasm'), 'rb').read()).decode()
src = open(js_path).read()
new, n = re.subn(r"(/\*WASM:pixfx:BEGIN\*/)'[^']*'(/\*WASM:pixfx:END\*/)", lambda m: m.group(1) + "'" + b64 + "'" + m.group(2), src)
if n != 1: sys.exit('markers not found exactly once')
if '--check' in sys.argv:
    if new != src: print('gif-writer-fx.js does not carry the current pixfx.wasm: run wasm/embed-fx.py'); sys.exit(1)
    print('gif-writer-fx.js carries the current pixfx.wasm'); sys.exit(0)
open(js_path, 'w').write(new)
print('embedded %d bytes as %d characters' % (len(base64.b64decode(b64)), len(b64)))
