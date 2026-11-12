# Copyright (c) 2026 LFC Foundry. MIT License.
# block-size screen: medians per set, block size and build, as ratios to 0.8.3 at the default 13 MB blocks
import json, sys, statistics as st
d = json.load(open(sys.argv[1])); print(d['ver'])
res = d['res']; keys = []; [keys.append(x['f']) for x in res if x['f'] not in keys]
med = lambda f, v, m: st.median(x['t'][m] for x in res if x['f'] == f and x['v'] == v)
print('%-22s %-4s %8s %6s %6s %6s %6s %6s' % ('set@MB', 'build', 'size', 'pack', 'full', 'r1', 'mid10', 'keys1'))
for f in keys:
    base = f.split('@')[0] + '@13'
    for v in ['r83', 'sel']:
        print('%-22s %-4s %8d %6.2f %6.2f %6.2f %6.2f %6.2f' % (f, v, med(f, v, 'size'), med(f, v, 'packMs') / med(base, 'r83', 'packMs'),
              *[med(f, v, m) / med(base, 'r83', m) for m in ['full', 'range1', 'rangeMid10', 'keys1']]))
