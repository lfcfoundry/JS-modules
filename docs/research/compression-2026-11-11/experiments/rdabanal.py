# Copyright (c) 2026 LFC Foundry. MIT License.
# ratio of medians (B / A) per set and mode from rdab-<browser>.json
import json, sys, statistics as st
d = json.load(open(sys.argv[1])); A, B = sys.argv[2].split(','); print(d['ver'], ' ratio', B, '/', A, '(median ms A -> B)')
sets = []; [sets.append(x['f']) for x in d['res'] if x['f'] not in sets]
modes = list(d['res'][0]['t'].keys())
for f in sets:
    line = '%-16s' % f
    for m in modes:
        a = st.median(x['t'][m] for x in d['res'] if x['f'] == f and x['v'] == A); b = st.median(x['t'][m] for x in d['res'] if x['f'] == f and x['v'] == B)
        line += '  %s %.2f (%.1f->%.1f)' % (m, b / a if a else 0, a, b)
    print(line)
