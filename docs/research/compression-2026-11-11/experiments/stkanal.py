# Copyright (c) 2026 LFC Foundry. MIT License.
# full-stack table: each part alone and all stacked, ratio of medians against 0.8.3 at 13 MB; "sum" = product of the parts' ratios (what independent gains would give)
import json, sys, statistics as st
d = json.load(open(sys.argv[1])); print(d['ver'])
res = d['res']; sets = sorted({x['f'].rsplit('@', 1)[0] for x in res}, key=lambda f: [x['f'] for x in res].index(f + '@13'))
def m(f, v, k): return st.median(x['t'][k] for x in res if x['f'] == f and x['v'] == v)
for f in sets:
    base = f + '@13'; print(f)
    for k in ('packMs', 'size', 'full', 'range1', 'keys1'):
        b = m(base, 'r83', k); parts = {'B14': m(base, 'sel', k) / b, '4MB': m(f + '@4', 'r83', k) / b, 'N+B3b': m(base, 'b3bn', k) / b}
        allr = m(f + '@4', 'all', k) / b; prod = parts['B14'] * parts['4MB'] * parts['N+B3b']
        print('  %-7s B14 %.2f  4MB %.2f  N+B3b %.2f | product %.2f | all stacked %.2f  %s' % (k, parts['B14'], parts['4MB'], parts['N+B3b'], prod, allr, 'BETTER than parts' if allr < prod * 0.95 else ('worse' if allr > prod * 1.05 else 'about the product')))
