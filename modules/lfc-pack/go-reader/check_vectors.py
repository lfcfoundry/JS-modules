# Copyright (c) 2026 LFC Foundry. MIT License.
# Runs the Go reader over vectors/ and compares with Python's json module (no zstd needed here).
# Value-exact files: rows equal json.loads of the .ndjson lines (numbers compared as doubles). Byte-exact files: output bytes equal the .ndjson bytes.
# usage: python3 -I check_vectors.py /path/to/lfcp-read [vectors-dir]
import sys, os, json, glob, subprocess
exe = sys.argv[1]
vec = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'vectors')
def run(*a):
    r = subprocess.run([exe, *a], capture_output=True)
    if r.returncode: raise SystemExit('FAIL %s: %s' % (a, r.stderr.decode()))
    return r.stdout
dbl = lambda v: json.loads(json.dumps(v), parse_int=float)  # ints above 2**53 read as the nearest double
bad = 0
for src in sorted(glob.glob(os.path.join(vec, '*.ndjson'))):
    base = src[:-len('.ndjson')]; raw = open(src, 'rb').read()
    want = [json.loads(l, parse_int=float) for l in raw.decode('utf-8').split('\n') if l.strip()]
    got = [json.loads(l, parse_int=float) for l in run('rows', base + '.json.lfc').decode('utf-8').split('\n') if l]
    got_x = [json.loads(l, parse_int=float) for l in run('rows', base + '.x.json.lfc').decode('utf-8').split('\n') if l]
    ok1, ok2, ok3 = got == want, got_x == want, run('text', base + '.x.json.lfc') == raw
    print('ok  ' if ok1 and ok2 and ok3 else 'FAIL', os.path.basename(base), '' if ok1 else 'value', '' if ok2 else 'x-rows', '' if ok3 else 'exact'); bad += not (ok1 and ok2 and ok3)
sys.exit(1 if bad else 0)
