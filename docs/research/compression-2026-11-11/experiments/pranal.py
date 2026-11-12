# Copyright (c) 2026 LFC Foundry. MIT License.
# research: ratio-of-medians table from a prdrive result file. usage: python3 pranal.py file.json
import json, sys, statistics as st
d = json.load(open(sys.argv[1])); print(d['ver'])
R = {}; B = d['res'][0]['v']
for r in d['res']: R.setdefault(r['f'], {}).setdefault(r['v'], []).append(r['t'])
for f, vs in R.items():
    b = st.median(x['ms'] for x in vs[B]); bb = vs[B][0]['bytes']
    print(f"{f}: {B} {b:.0f} ms, {bb} bytes")
    for v, xs in vs.items():
        if v == B: continue
        print(f"   {v:16} time {st.median(x['ms'] for x in xs)/b:.2f}  size {xs[0]['bytes']/bb:.3f}  {'same' if all(x['same'] for x in xs) else 'DIFFER'}")
