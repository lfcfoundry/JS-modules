# Copyright (c) 2026 LFC Foundry. MIT License.
# Reads files written by json-format.js with python/lfc_pack.py and compares with json.loads of the source.
import sys, json, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'python'))
import lfc_pack
bad = 0
for lfc, src in [a.split('=') for a in sys.argv[1:]]:
    want = [json.loads(l) for l in open(src, 'rb').read().decode('utf-8').split('\n') if l.strip()]
    got = lfc_pack.read(lfc)
    ok = got == want
    print(lfc, 'rows', len(got), 'ok' if ok else 'DIFFERENT'); bad += not ok
    if lfc.endswith('x.lfc'):
        same = lfc_pack.read_text(lfc) == open(src, 'rb').read(); print('  text byte-exact', same); bad += not same
sys.exit(1 if bad else 0)
