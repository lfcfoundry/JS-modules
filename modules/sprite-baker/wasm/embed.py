#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Puts wasm/tri.wasm into sprite-baker-wasm.js between the WASM:BEGIN and WASM:END markers (base64 text).
Run after build.sh:  python3 modules/sprite-baker/wasm/embed.py            (--check only compares and exits 1 when they differ)
With --lean FILE.wasm and -o OUT.js it writes a copy of the add-on carrying that (lean) build instead and leaves the shipped file alone."""
import base64, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
js_path = os.path.join(here, '..', 'sprite-baker-wasm.js')
args = sys.argv[1:]
wasm_path, out_path, check = os.path.join(here, 'tri.wasm'), js_path, '--check' in args
if '--lean' in args: wasm_path = args[args.index('--lean') + 1]
if '-o' in args: out_path = args[args.index('-o') + 1]
b64 = base64.b64encode(open(wasm_path, 'rb').read()).decode()
src = open(js_path).read()
new, n = re.subn(r"(/\*WASM:BEGIN\*/)'[^']*'(/\*WASM:END\*/)", lambda m: m.group(1) + "'" + b64 + "'" + m.group(2), src)
if n != 1: sys.exit('markers not found exactly once')
if check:
    if new != src: print('sprite-baker-wasm.js does not carry the current tri.wasm: run wasm/embed.py'); sys.exit(1)
    print('sprite-baker-wasm.js carries the current tri.wasm'); sys.exit(0)
open(out_path, 'w').write(new)
print('embedded %d bytes as %d characters into %s' % (len(base64.b64decode(b64)), len(b64), os.path.basename(out_path)))
