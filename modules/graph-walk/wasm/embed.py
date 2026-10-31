#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Puts wasm/graph-walk.wasm into graph-walk.js between the WASM:gw:BEGIN and WASM:gw:END markers (base64 text).
Run after build.sh:  python3 wasm/embed.py            (--check only compares and exits 1 when they differ)"""
import base64, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
js_path = os.path.join(here, '..', 'graph-walk.js')
src = open(js_path).read()
b64 = base64.b64encode(open(os.path.join(here, 'graph-walk.wasm'), 'rb').read()).decode()
new, n = re.subn(r"(/\*WASM:gw:BEGIN\*/)'[^']*'(/\*WASM:gw:END\*/)", lambda m: m.group(1) + "'" + b64 + "'" + m.group(2), src)
if n != 1: sys.exit('markers not found exactly once')
if '--check' in sys.argv:
    if new != src: print('graph-walk.js does not carry the current wasm file: run wasm/embed.py'); sys.exit(1)
    print('graph-walk.js carries the current wasm file'); sys.exit(0)
open(js_path, 'w').write(new); print('embedded')
