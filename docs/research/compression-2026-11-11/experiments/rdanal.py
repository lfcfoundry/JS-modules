# Copyright (c) 2026 LFC Foundry. MIT License.
# summarize rd-<browser>.json: median ms, median zstd-decode ms and share per read mode
import json, sys, statistics as st
d = json.load(open(sys.argv[1])); print(d['ver'])
modes = ['rowsAll', 'rows2', 'colsAll', 'cols2', 'range10', 'range1', 'lazy2']
print('%-16s %6s %8s' % ('set', 'blocks', 'KB') + ''.join('%22s' % m for m in modes))
for f, o in d['res'].items():
    line = '%-16s %6d %8d' % (f, o['blocks'], o['bytes'] // 1024)
    for m in modes:
        r = o.get(m, 'n/a')
        if isinstance(r, str): line += '%22s' % 'n/a'; continue
        t = st.median(x[0] for x in r); z = st.median(x[1] for x in r)
        line += '%22s' % ('%.1f ms z%2.0f%%' % (t, 100 * z / t if t else 0))
    print(line)
print('ratio to rowsAll (median ms):')
for f, o in d['res'].items():
    base = st.median(x[0] for x in o['rowsAll']); line = '%-16s' % f
    for m in modes[1:]:
        r = o.get(m, 'n/a'); line += '%10s' % ('n/a' if isinstance(r, str) else '%.2f' % (st.median(x[0] for x in r) / base))
    print(line)
