# Copyright (c) 2026 LFC Foundry. MIT License.
# research B19: ratio of medians against mode 'off' (whole blocks then filter), first query and 24 queries. usage: python3 eqanal.py file.json
import json, sys, statistics as st
d = json.load(open(sys.argv[1])); print(d['ver']); R = {}
for r in d['res']: R.setdefault(r['f'], {}).setdefault(r['m'], []).append(r['t'])
for f, ms in R.items():
    o1 = st.median(x['first'] for x in ms['off']); o24 = st.median(x['all24'] for x in ms['off'])
    ok = len({(x['n1'], x['sum']) for xs in ms.values() for x in xs}) == 1
    print(f"{f}: off first {o1:.1f} ms, 24 queries {o24:.0f} ms, {'same counts' if ok else 'COUNTS DIFFER'}")
    for m, xs in ms.items():
        if m != 'off': print(f"   {m:6} first {st.median(x['first'] for x in xs)/o1:.2f}  24 queries {st.median(x['all24'] for x in xs)/o24:.2f}")
