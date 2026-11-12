# Copyright (c) 2026 LFC Foundry. MIT License.
# research B19: flat rows from one GitHub Archive hour (real public events; kept in scratch, never committed): event type (about 15 values), repo name and actor login (medium/high cardinality, skewed), org login (often missing), created_at as epoch seconds, public flag. usage: python3 -I mkgh-flat.py in.json.gz out.ndjson rows
import gzip, json, sys, datetime
n = int(sys.argv[3]); out = open(sys.argv[2], 'w')
with gzip.open(sys.argv[1], 'rt', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if i >= n: break
        e = json.loads(line)
        r = {'type': e['type'], 'repo': e['repo']['name'], 'actor': e['actor']['login']}
        if e.get('org'): r['org'] = e['org']['login']
        r['at'] = int(datetime.datetime.fromisoformat(e['created_at'].replace('Z', '+00:00')).timestamp()); r['public'] = e['public']
        out.write(json.dumps(r, separators=(',', ':'), ensure_ascii=False) + '\n')
