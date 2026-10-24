#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Puts the wasm files into walker-sim-wasm.js as base64 text between their markers:
walker-sim.wasm between WASM:BEGIN and WASM:END (the walking loop), sweep.wasm between SWEEP:BEGIN and SWEEP:END and sweep-scalar.wasm between SWEEPS:BEGIN and SWEEPS:END (the what-if rounds).
Run after build.sh:  python3 modules/walker-sim/wasm/embed.py"""
import base64, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
js_path = os.path.join(here, '..', 'walker-sim-wasm.js')
src = open(js_path).read()
for tag, name in (('WASM', 'walker-sim.wasm'), ('SWEEP', 'sweep.wasm'), ('SWEEPS', 'sweep-scalar.wasm')):
    raw = open(os.path.join(here, name), 'rb').read()
    b64 = base64.b64encode(raw).decode()
    src, n = re.subn(r"(/\*%s:BEGIN\*/)'[^']*'(/\*%s:END\*/)" % (tag, tag), lambda m: m.group(1) + "'" + b64 + "'" + m.group(2), src)
    if n != 1: sys.exit('markers %s not found exactly once' % tag)
    print('embedded %s: %d bytes as %d characters' % (name, len(raw), len(b64)))
open(js_path, 'w').write(src)
