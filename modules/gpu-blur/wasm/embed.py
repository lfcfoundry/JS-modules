#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Puts wasm/blur.wasm into gpu-blur.js between the WASM:BEGIN and WASM:END markers, and wasm/blurmt.wasm between WASMT:BEGIN and WASMT:END (base64 text).
Run after build.sh:  python3 modules/gpu-blur/wasm/embed.py            (--check only compares and exits 1 when they differ)"""
import base64, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
js_path = os.path.join(here, '..', 'gpu-blur.js')
check = '--check' in sys.argv[1:]
src = open(js_path).read()
new = src
for name, tag in (('blur.wasm', 'WASM'), ('blurmt.wasm', 'WASMT')):
    b64 = base64.b64encode(open(os.path.join(here, name), 'rb').read()).decode()
    new, n = re.subn(r"(/\*" + tag + r":BEGIN\*/)'[^']*'(/\*" + tag + r":END\*/)", lambda m: m.group(1) + "'" + b64 + "'" + m.group(2), new)
    if n != 1: sys.exit(tag + ' markers not found exactly once')
if check:
    if new != src: print('gpu-blur.js does not carry the current blur.wasm and blurmt.wasm: run wasm/embed.py'); sys.exit(1)
    print('gpu-blur.js carries the current blur.wasm and blurmt.wasm'); sys.exit(0)
open(js_path, 'w').write(new)
print('embedded blur.wasm and blurmt.wasm into gpu-blur.js')
