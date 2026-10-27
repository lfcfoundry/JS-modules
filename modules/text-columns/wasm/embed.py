#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Puts wasm/tc.wasm and wasm/tc-simd.wasm into the module .js between the WASM:tc:BEGIN/END and WASM:tcsimd:BEGIN/END markers (base64 text).
Run after build.sh:  python3 wasm/embed.py            (--check only compares and exits 1 when they differ)"""
import base64, glob, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
js_path = glob.glob(os.path.join(here, '..', '*.js'))[0]
src = open(js_path).read(); new = src
for tag, f in (('tc', 'tc.wasm'), ('tcsimd', 'tc-simd.wasm')):
    b64 = base64.b64encode(open(os.path.join(here, f), 'rb').read()).decode()
    new, n = re.subn(r"(/\*WASM:%s:BEGIN\*/)'[^']*'(/\*WASM:%s:END\*/)" % (tag, tag), lambda m: m.group(1) + "'" + b64 + "'" + m.group(2), new)
    if n != 1: sys.exit('markers for %s not found exactly once' % tag)
if '--check' in sys.argv:
    if new != src: print('the .js does not carry the current wasm files: run wasm/embed.py'); sys.exit(1)
    print('the .js carries the current wasm files'); sys.exit(0)
open(js_path, 'w').write(new); print('embedded')
