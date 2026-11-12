# Copyright (c) 2026 LFC Foundry. MIT License.
# null-plane stack timing: ratio of medians against r83 per set, for pack time, full read, one-column read, and file size
import json, sys, statistics as st
d = json.load(open(sys.argv[1])); V = sys.argv[2].split(','); print(d['ver'])
print('%-16s %-6s %8s %6s %6s %6s   (ms r83: pack/full/keys1)' % ('set', 'build', 'size', 'pack', 'full', 'keys1'))
sets = []; [sets.append(x['f']) for x in d['res'] if x['f'] not in sets]
for f in sets:
    med = lambda v, m: st.median(x['t'][m] for x in d['res'] if x['f'] == f and x['v'] == v)
    for v in V:
        print('%-16s %-6s %8d %6.2f %6.2f %6.2f   %s' % (f, v, med(v, 'size'), med(v, 'packMs') / med(V[0], 'packMs'), med(v, 'full') / med(V[0], 'full'), med(v, 'keys1') / med(V[0], 'keys1'),
              '(%.0f/%.0f/%.1f)' % (med(V[0], 'packMs'), med(V[0], 'full'), med(V[0], 'keys1')) if v == V[0] else ''))
