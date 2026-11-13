import json,sys,collections
p=json.load(open(sys.argv[1])); root=sys.argv[2]; nodes={n['id']:n for n in p['nodes']}; par={}
for n in p['nodes']:
  for c in n.get('children',[]): par[c]=n['id']
dt=collections.Counter()
for sid,d in zip(p['samples'],p['timeDeltas']): dt[sid]+=d
def under(i):
  while i in nodes:
    if nodes[i]['callFrame']['functionName']==root: return True
    i=par.get(i)
    if i is None: return False
  return False
c=collections.Counter(); tot=0
for i,n in nodes.items():
  if dt[i] and under(i): c[n['callFrame']['functionName'] or '(anon)']+=dt[i]; tot+=dt[i]
print('under',root,round(tot/1000),'ms')
for k,v in c.most_common(int(sys.argv[3]) if len(sys.argv)>3 else 25): print(f'{100*v/tot:5.1f}% {v/1000:7.1f} ms {k}')
