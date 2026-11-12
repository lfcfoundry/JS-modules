# Copyright (c) 2026 LFC Foundry. MIT License.
# per top-level key: kinds seen; prints keys that hold one scalar kind plus nulls (what a validity bitmap would keep typed)
import json, sys, collections
for f in sys.argv[1:]:
    kinds = collections.defaultdict(collections.Counter); n = 0
    for l in open(f, encoding='utf-8'):
        if not l.strip(): continue
        o = json.loads(l); n += 1
        if not isinstance(o, dict): continue
        for k, v in o.items():
            kinds[k][('null' if v is None else 'bool' if isinstance(v, bool) else 'num' if isinstance(v, (int, float)) else 'str' if isinstance(v, str) else 'nest')] += 1
    hits = [(k, c) for k, c in kinds.items() if c['null'] and len([x for x in c if x != 'null']) == 1 and 'nest' not in c]
    print(f.split('/')[-1], n, 'rows;', len(kinds), 'keys;', 'typed+null keys:', ', '.join('%s %s %.1f%% null' % (k, [x for x in c if x != 'null'][0], 100 * c['null'] / sum(c.values())) for k, c in hits) or 'none')
