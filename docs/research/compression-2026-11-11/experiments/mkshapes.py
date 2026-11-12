# Copyright (c) 2026 LFC Foundry. MIT License.
# null data shapes: clustered runs, several nullable columns, a made-up orders export, and sentinel stand-ins (null replaced by an out-of-range value)
import json, random, sys
src = sys.argv[1]; rows = [json.loads(l) for l in open(src) if l.strip()]; n = len(rows); W = lambda f, rs: open(f, 'w').write(''.join(json.dumps(o, separators=(',', ':')) + '\n' for o in rs))
rnd = random.Random(11)
for share in (0.01, 0.1):   # runs of 200 rows (an outage), same share of nulls as the random sets
    out = []; flag = [False] * n; runs = int(n * share / 200)
    for _ in range(runs): s0 = rnd.randrange(0, n - 200); flag[s0:s0 + 200] = [True] * 200
    for o, f in zip(rows, flag): o2 = dict(o); o2['temp'] = None if f else o['temp']; out.append(o2)
    W('temp-runs-%g.ndjson' % share, out)
out = []
for o in rows:
    o2 = dict(o)
    for k in ('temp', 'hum', 'dev'):
        if rnd.random() < 0.05: o2[k] = None
    out.append(o2)
W('multi-5.ndjson', out)
for share in (0.01, 0.1):   # sentinels: number -> -999 (outside the range), text -> "~null~"
    r2 = random.Random(7); pick = [r2.random() < share for _ in rows]
    W('temp-sent-%g.ndjson' % share, [dict(o, temp=-999) if p else o for o, p in zip(rows, pick)])
    r2 = random.Random(7); pick = [r2.random() < share for _ in rows]
    W('dev-sent-%g.ndjson' % share, [dict(o, dev='~null~') if p else o for o, p in zip(rows, pick)])
# made-up orders export (300,000 rows), the kind of table where nulls are common
r = random.Random(5); t0 = 1760000000; out = []
words = 'leave at door|ring twice|gift wrap please|call on arrival|fragile|no substitutions|back entrance'.split('|')
for i in range(n):
    c = t0 + i * 7 + r.randrange(7)
    o = {'id': 100000 + i, 'customer_id': r.randrange(1, 40000), 'created_at': c, 'status': r.choice(['paid', 'paid', 'paid', 'shipped', 'refunded', 'cancelled']),
         'total': round(r.uniform(5, 400), 2), 'shipped_at': None if r.random() < 0.3 else c + r.randrange(3600, 400000),
         'discount': None if r.random() < 0.8 else round(r.uniform(1, 50), 2), 'coupon': None if r.random() < 0.9 else r.choice(['FALL10', 'WELCOME', 'VIP20', 'FREESHIP']),
         'rating': None if r.random() < 0.6 else r.randrange(1, 6), 'note': None if r.random() < 0.95 else r.choice(words), 'gift': None if r.random() < 0.5 else r.random() < 0.1}
    out.append(o)
W('orders-300000.ndjson', out)
