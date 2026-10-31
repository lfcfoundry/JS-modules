#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Puts wasm/crc32.wasm, wasm/inflate.wasm and wasm/xlsx.wasm into zip-open.js between their markers (base64 text).
Run after build.sh:  python3 modules/zip-open/wasm/embed.py            (--check only compares and exits 1 when they differ)"""
import base64, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
js_path = os.path.join(here, '..', 'zip-open.js')
src = new = open(js_path).read()
for marker, name in (('WASM', 'crc32.wasm'), ('WASMINF', 'inflate.wasm'), ('WASMXLSX', 'xlsx.wasm')):
    b64 = base64.b64encode(open(os.path.join(here, name), 'rb').read()).decode()
    new, n = re.subn(r"(/\*%s:BEGIN\*/)'[^']*'(/\*%s:END\*/)" % (marker, marker), lambda m: m.group(1) + "'" + b64 + "'" + m.group(2), new)
    if n != 1: sys.exit('markers %s not found exactly once' % marker)
if '--check' in sys.argv:
    if new != src: print('zip-open.js does not carry the current wasm files: run wasm/embed.py'); sys.exit(1)
    print('zip-open.js carries the current crc32.wasm, inflate.wasm and xlsx.wasm'); sys.exit(0)
open(js_path, 'w').write(new)
print('embedded crc32.wasm, inflate.wasm and xlsx.wasm')
