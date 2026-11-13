import json,sys,statistics as st
d=json.load(open(sys.argv[1])); V=sys.argv[2].split(','); print(d['ver'])
fs=sorted(set(x['f'] for x in d['res']))
for f in fs:
  for k in ('cold','warm'):
    m={v:[x['t'][k] for x in d['res'] if x['f']==f and x['v']==v and 't' in x] for v in V}
    if not all(m.values()): continue
    base=st.median(m[V[0]]); print(f"{f:16s} {k:4s} "+"  ".join(f"{v} {st.median(m[v]):7.1f}" for v in V)+"   ratios "+" ".join(f"{st.median(m[v])/base:.3f}" for v in V[1:])+f"  n={len(m[V[0]])}")
