#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Puts wasm/crc32.wasm into zip-open.js between the WASM:BEGIN and WASM:END markers (base64 text).
Run after build.sh:  python3 modules/zip-open/wasm/embed.py            (--check only compares and exits 1 when they differ)"""
import base64, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
js_path = os.path.join(here, '..', 'zip-open.js')
b64 = base64.b64encode(open(os.path.join(here, 'crc32.wasm'), 'rb').read()).decode()
src = open(js_path).read()
new, n = re.subn(r"(/\*WASM:BEGIN\*/)'[^']*'(/\*WASM:END\*/)", lambda m: m.group(1) + "'" + b64 + "'" + m.group(2), src)
if n != 1: sys.exit('markers not found exactly once')
if '--check' in sys.argv:
    if new != src: print('zip-open.js does not carry the current crc32.wasm: run wasm/embed.py'); sys.exit(1)
    print('zip-open.js carries the current crc32.wasm'); sys.exit(0)
open(js_path, 'w').write(new)
print('embedded %d bytes as %d characters' % (len(base64.b64decode(b64)), len(b64)))
