#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Puts wasm/force.wasm and wasm/stress.wasm into netflow-engine.js between their WASM:<name>:BEGIN and WASM:<name>:END markers (base64 text).
Run after build.sh:  python3 wasm/embed.py   then   node modules/netflow-engine/test/run.js"""
import base64, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
js_path = os.path.join(here, '..', 'netflow-engine.js')
src = open(js_path).read()
for name in ('force', 'stress'):
    b64 = base64.b64encode(open(os.path.join(here, name + '.wasm'), 'rb').read()).decode()
    pat = r"(/\*WASM:%s:BEGIN\*/)'[^']*'(/\*WASM:%s:END\*/)" % (name, name)
    src, n = re.subn(pat, lambda m: m.group(1) + "'" + b64 + "'" + m.group(2), src)
    if n != 1: sys.exit('markers for %s not found exactly once' % name)
    print('%s: embedded %d bytes as %d characters' % (name, len(b64) * 3 // 4, len(b64)))
open(js_path, 'w').write(src)
