# Copyright (c) 2026 LFC Foundry. MIT License.
import json,sys,statistics as st
A=json.load(open('attrib.json')); T=json.load(open(sys.argv[1]))
print(T['ver'])
print('set | pack ms (first / median later) | zstd share of pack | wasted zstd share of pack | unpack ms | zstd-decode share of unpack | row building share | JSON.parse ms')
for k,runs in T['res'].items():
    calls=A[k]['calls']; rows=[]
    for i,r in enumerate(runs):
        assert len(r['cms'])==len(calls),(k,len(r['cms']),len(calls))
        z=sum(r['cms']); w=sum(ms for ms,c in zip(r['cms'],calls) if not c[2])
        cols=r['cols']; build=(r['unpack']-cols)/r['unpack'] if cols>0 else None
        rows.append((r['pack'],z/r['pack'],w/r['pack'],r['unpack'],r['dms']/r['unpack'],build,r['jp']))
    first=rows[0]; later=rows[1:]
    med=lambda j: st.median(x[j] for x in later)
    b=med(5) if later[0][5] is not None else None
    print(f"{k} | {first[0]:.0f} / {med(0):.0f} | {med(1):.2f} | {med(2):.2f} (first {first[2]:.2f}) | {first[3]:.0f} / {med(3):.0f} | {med(4):.2f} | {'n/a' if b is None else f'{b:.2f}'} | {med(6):.0f}")
