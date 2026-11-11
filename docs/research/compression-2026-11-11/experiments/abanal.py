# Copyright (c) 2026 LFC Foundry. MIT License.
import json,sys,statistics as st
d=json.load(open(sys.argv[1])); print(d['ver']); R=d['res']; V=sys.argv[2].split(',')
fs=[]; [fs.append(x['f']) for x in R if x['f'] not in fs]
print('set | variant | first pack ratio vs base (median of rounds, range) | later pack ratio vs base (median, range) | base first ms / later ms | size same?')
for f in fs:
    rows=[x for x in R if x['f']==f]
    base={x['r']:x for x in rows if x['v']=='base'}
    for v in V[1:]:
        fr=[];lr=[];same=True
        for x in rows:
            if x['v']!=v: continue
            b=base[x['r']]; fr.append(x['first']/b['first']); lr.append(st.median(x['later'])/st.median(b['later'])); same&=x['size']==b['size']
        bf=st.median(b2['first'] for b2 in base.values()); bl=st.median(st.median(b2['later']) for b2 in base.values())
        print(f"{f} | {v} | {st.median(fr):.2f} ({min(fr):.2f}-{max(fr):.2f}) | {st.median(lr):.2f} ({min(lr):.2f}-{max(lr):.2f}) | {bf:.0f} / {bl:.0f} | {same}")
