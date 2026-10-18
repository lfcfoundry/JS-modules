#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Turns the markdown the runners print into one compact table per run: rows = libraries, columns = data sets, cell = size share · pack ms · unpack ms.
Usage: python3 bench/summarize.py out-node-final.md [out-other.md ...]   (prints one table per file)"""
import re, sys
ORDER = ['jso-fast', 'jso-small', 'msgpackr-records', 'msgpackr-bundle', 'cbor-x-records', 'avsc', '@msgpack/msgpack', 'msgpackr', 'cbor-x', 'notepack.io', 'v8.serialize', 'flechette (rows->columns->IPC)', 'JSON', 'JSON+fflate1', 'JSON+fflate6', 'JSON+lz4js', 'bson', 'zipson', 'compress-json', 'lz-string', 'jsonpack']
SETS = ['nfm-links', 'nfm-nodes', 'api-users', 'geojson', 'events', 'small', 'irregular']
def parse(path):
    data, cur, title = {}, None, None
    for line in open(path):
        m = re.match(r'### (\S+) \((\d+) items?, JSON text ([\d.]+) MB\)', line)
        if m: cur = m.group(1); data[cur] = {'n': m.group(2), 'json': m.group(3), 'rows': {}}; continue
        if line.startswith('BROWSER '): title = line.strip()
        if cur and line.startswith('| ') and not line.startswith('| contender') and not line.startswith('|---'):
            c = [x.strip() for x in line.strip().strip('|').split('|')]
            name = re.sub(r' \(first [\d,]+ items only\)', '', c[0]); capped = 'only)' in c[0]
            if len(c) >= 7 and c[1] and 'failed' not in c[6]:
                data[cur]['rows'][name] = {'size': c[2], 'pack': c[3], 'unpack': c[4], 'ok': c[6], 'capped': capped}
            else: data[cur]['rows'][name] = {'fail': c[-1]}
    return title, data
def fmt(r):
    if r is None: return ''
    if 'fail' in r: return 'fails'
    mark = '' if r['ok'] == 'exact' else (' §' if r['ok'].startswith('same values') else ' †')
    cap = ' ‡' if r['capped'] else ''
    def ms(x): x = float(x); return '%.0f' % x if x >= 10 else '%.1f' % x
    return '%s · %s · %s%s%s' % (r['size'], ms(r['pack']), ms(r['unpack']), mark, cap)
for path in sys.argv[1:]:
    title, data = parse(path)
    sets = [s for s in SETS if s in data]
    print('<!-- %s : %s -->' % (path, title or 'Node'))
    print('| library | ' + ' | '.join('%s (%s items, %s MB JSON)' % (s, '{:,}'.format(int(data[s]['n'])), data[s]['json']) for s in sets) + ' |')
    print('|---|' + '---|' * len(sets))
    names = [n for n in ORDER if any(n in data[s]['rows'] for s in sets)]
    for n in names: print('| %s | ' % n + ' | '.join(fmt(data[s]['rows'].get(n)) for s in sets) + ' |')
    print()
