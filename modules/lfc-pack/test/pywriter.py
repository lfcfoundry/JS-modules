# Copyright (c) 2026 LFC Foundry. MIT License.
# Python writer check: writes <n>.pyw.lfc (value-exact) and <n>.pywx.lfc (byte-exact lines) for every <n>.src in a folder and reads each back with python/lfc_pack.py. pywriter.cjs then opens them with lfc-pack.js.
import sys, json, glob, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'python')); sys.setrecursionlimit(20000)
import lfc_pack
try: import lfc_pack_write
except ImportError: print('skipped: no zstandard package and Python older than 3.14'); sys.exit(0)
def norm(o):
    if isinstance(o, bool) or o is None or isinstance(o, str): return o
    if isinstance(o, (int, float)): return float(o)
    if isinstance(o, list): return [norm(x) for x in o]
    return {k: norm(v) for k, v in o.items()}
bad = n = 0
for f in sorted(glob.glob(os.path.join(sys.argv[1], '*.src'))):
    src = open(f, 'rb').read(); base = f[:-4]
    try:
        want = [json.loads(l) for l in src.decode('utf-8').split('\n') if l.strip()]
        d = lfc_pack_write.pack(src); open(base + '.pyw.lfc', 'wb').write(d)
        ok = norm(lfc_pack.read(d)) == norm(want)
        x = lfc_pack_write.pack_exact(src); open(base + '.pywx.lfc', 'wb').write(x)
        ok = ok and lfc_pack.read_text(x) == src
    except Exception as e:
        ok = False; print(f, type(e).__name__, str(e)[:80])
    n += 1
    if not ok: bad += 1; print('DIFF', f)
print('python writer: checked', n, 'files, bad', bad); sys.exit(1 if bad else 0)
