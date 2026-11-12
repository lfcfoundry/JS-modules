# Copyright (c) 2026 LFC Foundry. MIT License.
# research: ratio of medians against the first build, per file, for unpackColumns and unpack (first call and warm). usage: python3 colsanal.py file.json
import json, sys, statistics as st
d = json.load(open(sys.argv[1])); print(d['ver']); R = {}
for r in d['res']: R.setdefault(r['f'], {}).setdefault(r['m'], []).append(r['t'])
for f, ms in R.items():
    base = list(ms)[0]; b = {k: st.median(x[k] for x in ms[base]) for k in ('colsFirst', 'cols', 'rowsFirst', 'rows')}
    print(f"{f}: {base} cols first {b['colsFirst']:.1f} warm {b['cols']:.1f} ms; rows first {b['rowsFirst']:.1f} warm {b['rows']:.1f} ms")
    for m, xs in ms.items():
        if m != base: print(f"   {m:8} " + '  '.join(f"{k} {st.median(x[k] for x in xs) / b[k]:.2f}" for k in b))
