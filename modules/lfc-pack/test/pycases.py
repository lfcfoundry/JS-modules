# Copyright (c) 2026 LFC Foundry. MIT License.
# Reads every <n>.lfc in a folder with python/lfc_pack.py and compares with json.loads of <n>.src (value-exact, and byte-exact for files named *x.lfc).
import sys, json, glob, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'python')); sys.setrecursionlimit(20000)
import lfc_pack

def norm(o):
    if isinstance(o, bool) or o is None or isinstance(o, str): return o
    if isinstance(o, (int, float)): return float(o)
    if isinstance(o, list): return [norm(x) for x in o]
    return {k: norm(v) for k, v in o.items()}

bad = n = 0
for f in sorted(glob.glob(os.path.join(sys.argv[1], '*.lfc'))):
    src = open(f[:-4] + '.src', 'rb').read()
    want = [json.loads(l) for l in src.decode('utf-8').split('\n') if l.strip()]
    try:
        ok = norm(lfc_pack.read(f)) == norm(want)
        if f.endswith('x.lfc'): ok = ok and lfc_pack.read_text(f) == src
    except Exception as e:
        ok = False; print(f, type(e).__name__, str(e)[:80])
    n += 1
    if not ok: bad += 1; print('DIFF', f, src[:60])
print('python reader: checked', n, 'files, bad', bad)
sys.exit(1 if bad else 0)
