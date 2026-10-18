#!/usr/bin/env python3
# Builds the comparison tables (markdown) from res-<browser>.json.  usage: python3 tables.py [dir]
import json, sys, os
d = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
B = [('chromium', 'Chromium'), ('firefox', 'Firefox'), ('webkit', 'WebKitGTK'), ('epiphany', 'GNOME Web')]
R = {}
for k, _ in B:
    p = os.path.join(d, 'res-%s.json' % k)
    if os.path.exists(p): R[k] = json.load(open(p))
ids = [r['id'] for r in next(iter(R.values()))['out']['results']]
lab = {r['id']: r['label'] for r in next(iter(R.values()))['out']['results']}
def get(k, i, f):
    for r in R[k]['out']['results']:
        if r['id'] == i: return r.get(f)
print('Browsers:', ', '.join('%s %s' % (n, R[k]['version']) for k, n in B if k in R))
print('\n### Unpack, nanoseconds per number (lower is better); 12 columns, 899,000+ numbers\n')
print('| contender | ' + ' | '.join(n for k, n in B if k in R) + ' |\n|---|' + '---:|' * len(R))
for i in ids:
    if get(next(iter(R)), i, 'unpackNsPerValue') is None: continue
    print('| %s | ' % lab[i] + ' | '.join(str(get(k, i, 'unpackNsPerValue')) for k, n in B if k in R) + ' |')
print('\n### Pack, milliseconds for the 12 columns (lower is better) and packed bytes (lower is better)\n')
print('| contender | ' + ' | '.join(n for k, n in B if k in R) + ' | packed bytes |\n|---|' + '---:|' * (len(R) + 1))
for i in ids:
    if get(next(iter(R)), i, 'packMs') is None: continue
    print('| %s | ' % lab[i] + ' | '.join(str(get(k, i, 'packMs')) for k, n in B if k in R) + ' | %s |' % format(get(next(iter(R)), i, 'packedTotal'), ','))
print('\n### Start-up, milliseconds from "load" to ready (lower is better; timers round to whole ms in Firefox, WebKitGTK and GNOME Web)\n')
print('| contender | ' + ' | '.join(n for k, n in B if k in R) + ' |\n|---|' + '---:|' * len(R))
for i in ids:
    print('| %s | ' % lab[i] + ' | '.join(str(round((get(k, i, 'compileMs') or 0) + (get(k, i, 'instantiateMs') or 0), 1)) for k, n in B if k in R) + ' |')
print('\n### Wrong columns (must be 0)\n')
print(', '.join('%s %s' % (n, sum(r['wrongColumns'] for r in R[k]['out']['results'])) for k, n in B if k in R))
