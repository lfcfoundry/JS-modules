# Copyright (c) 2026 LFC Foundry. MIT License.
# from one NDJSON file, make pairs: key set to null in a share of rows, and the same key left out of those rows
import json, random, sys
src, key, rates = sys.argv[1], sys.argv[2], [float(x) for x in sys.argv[3].split(',')]
rows = [json.loads(l) for l in open(src) if l.strip()]
for r in rates:
    rnd = random.Random(7); pick = [rnd.random() < r for _ in rows]
    with open('%s-null-%g.ndjson' % (key, r), 'w') as a, open('%s-abs-%g.ndjson' % (key, r), 'w') as b:
        for o, p in zip(rows, pick):
            if p:
                n = dict(o); n[key] = None; a.write(json.dumps(n, separators=(',', ':')) + '\n')
                m = dict(o); del m[key]; b.write(json.dumps(m, separators=(',', ':')) + '\n')
            else:
                t = json.dumps(o, separators=(',', ':')) + '\n'; a.write(t); b.write(t)
