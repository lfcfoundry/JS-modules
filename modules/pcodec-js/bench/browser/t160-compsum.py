# Copyright (c) 2026 LFC Foundry. MIT License.
import json,statistics as st,sys
pre=sys.argv[1] if len(sys.argv)>1 else 'comp8'
import os
D=os.environ.get('T160_OUT','final')+'/'
R={}
for b in ('chromium','firefox','webkit','epiphany'):
    d=json.load(open(f'{D}{pre}-{b}.json'))['tests']['comp']; R[b]={}
    for x in d:
        runs=x['runs']; g=lambda k: st.median([r[k] for r in runs if r.get(k)])
        R[b][x['id']]=dict(ns=g('nsPerNumber'),ms=g('unpackMs'),start=g('startMs'),pack=(g('packMs') if any(r.get('packMs') for r in runs) else None),n=len(runs),same=len({tuple(r['hashes']) for r in runs})==1,spread=(min(r['nsPerNumber'] for r in runs),max(r['nsPerNumber'] for r in runs)))
for b in R:
    print(b)
    for i,v in R[b].items(): print(f"  {i:6} ns/num {v['ns']:.2f} (min {v['spread'][0]:.2f} max {v['spread'][1]:.2f}) start {v['start']:.1f} pack {v['pack'] and round(v['pack'],1)} same={v['same']} n={v['n']}")
json.dump(R,open(D+pre+'-summary.json','w'),indent=1)
