# Copyright (c) 2026 LFC Foundry. MIT License.
# research B19: per-query medians (warm, within the 24-query loop) for each mode, against mode 'off'. usage: python3 eqq.py file.json
import json, sys, statistics as st
d = json.load(open(sys.argv[1])); print(d['ver']); R = {}
for r in d['res']: R.setdefault(r['f'], {}).setdefault(r['m'], []).append(r['t'])
for f, ms in R.items():
    q = ms['off'][0]['q']; print(f)
    for j, name in enumerate(q):
        o = st.median(x['byQ'][j] for x in ms['off'])
        print(f"   {name:42} off {o:7.2f} ms  " + "  ".join(f"{m} {st.median(x['byQ'][j] for x in xs)/o:.2f}" for m, xs in ms.items() if m != 'off'))
