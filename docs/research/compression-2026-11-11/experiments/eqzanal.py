# Copyright (c) 2026 LFC Foundry. MIT License.
# research B19c: per file, first / 24-query ratios against off, plus the worst single query, for each mode
import json, sys, statistics as st
for fn in sys.argv[1:]:
    d = json.load(open(fn)); R = {}; print(d['ver'], fn)
    for r in d['res']: R.setdefault(r['f'], {}).setdefault(r['m'], []).append(r['t'])
    for fi, ms in R.items():
        q = ms['off'][0]['q']; off = [st.median(x['byQ'][j] for x in ms['off']) for j in range(len(q))]
        o1 = st.median(x['first'] for x in ms['off']); o24 = st.median(x['all24'] for x in ms['off'])
        print(' ', fi, '  '.join(f"{m}: {st.median(x['first'] for x in xs)/o1:.2f}/{st.median(x['all24'] for x in xs)/o24:.2f} worst {max(st.median(x['byQ'][j] for x in xs)/off[j] for j in range(len(q))):.2f}" for m, xs in ms.items() if m != 'off'))
