#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License. Builds the tables of the four-browser speed run from the JSON files that run.js wrote (several runs per browser: median of the runs).
# python3 make-result.py RAW_DIR > tables.md        Lower is better in every table (milliseconds) unless a line says otherwise.
import json, glob, os, sys, statistics as st
raw = sys.argv[1]
BR = [('chromium', 'Chromium 155'), ('firefox', 'Firefox 158.0'), ('webkit', 'WebKitGTK 2.52.6'), ('epiphany', 'GNOME Web 46.5')]
D = {}
for b, _ in BR:
    D[b] = [json.load(open(f)) for f in sorted(glob.glob(os.path.join(raw, b + '-*.json')))]
def med(xs):
    xs = [x for x in xs if x is not None]
    return st.median(xs) if xs else None
def f(x, d=1):
    if x is None: return 'n/a'
    return ('%.' + str(d) + 'f') % x if x < 100 or d == 0 else '%d' % round(x)
def row_of(b, size, route, radius=12):
    out = []
    for run in D[b]:
        for r in run.get('rows', []):
            if r['size'] == size and r['route'] == route and r['radius'] == radius: out.append(r)
    return out
def cell(b, size, route, scen, key, radius=12):
    return med([(r.get(scen) or {}).get(key) for r in row_of(b, size, route, radius)])
def table(head, rows):
    s = '| ' + ' | '.join(head) + ' |\n| ' + ' | '.join(['---'] + ['---:'] * (len(head) - 1)) + ' |\n'
    for r in rows: s += '| ' + ' | '.join(r) + ' |\n'
    return s
def used(b, size, route, kind):
    u = set()
    for r in row_of(b, size, route):
        if r.get('used', {}).get(kind): u.add(r['used'][kind])
    return '/'.join(sorted(u)) or '?'
H = ['ms, lower is better'] + [n for _, n in BR]
out = []
def sect(t): out.append('\n### ' + t + '\n')
for size in ['1920x1080']:
    for scen, title, key in [('bytesToCanvas', 'bytes in, drawn canvas out: time until the picture is really finished', 'seen'), ('canvasToCanvas', 'canvas in, drawn canvas out: time until the picture is really finished', 'seen'), ('bytesToPixels', 'bytes in, bytes out (the promise API)', 'call')]:
        sect(size.replace('x', ' x ') + ', radius 12, ' + title)
        rows = []
        for route in ['webgl2', 'wasm', 'js', 'auto']:
            label = {'webgl2': 'route webgl2 (forced)', 'wasm': 'route wasm', 'js': 'route js', 'auto': 'route auto (picks ' + '/'.join(used(b, size, 'auto', 'canvas' if scen != 'bytesToPixels' else 'pixels') for b, _ in BR if D[b]) + ')'}[route]
            rows.append([label] + [f(cell(b, size, route, scen, key)) if D[b] else 'n/a' for b, _ in BR])
        out.append(table(H, rows))
        sect(size.replace('x', ' x ') + ', radius 12, ' + title.split(':')[0] + ': longest page task meanwhile (median of reps; worst rep in brackets)')
        rows = []
        for route in ['webgl2', 'wasm', 'js', 'auto']:
            rows.append(['route ' + route] + [f(cell(b, size, route, scen, 'gap')) + ' (' + f(cell(b, size, route, scen, 'gapMax')) + ')' if D[b] else 'n/a' for b, _ in BR])
        out.append(table(H, rows))
sect('One block: GpuBlur.blurSync, bytes in, bytes out, 1920 x 1080 radius 12 (the page waits; this is the kernel speed with copy in and out)')
out.append(table(H, [['wasm'] + [f(cell(b, '1920x1080', 'wasm', 'sync', 'call')) for b, _ in BR], ['js'] + [f(cell(b, '1920x1080', 'js', 'sync', 'call')) for b, _ in BR]]))
sect('Sizes: bytes in, drawn canvas out, time until finished, radius 12')
sizes = ['128x72', '480x270', '1280x720', '1920x1080', '3840x2160']
for b, n in BR:
    if not D[b]: continue
    out.append('\n**' + n + '**\n\n' + table(['ms, lower is better'] + [s.replace('x', ' x ') for s in sizes], [['route ' + r] + [f(cell(b, s, r, 'bytesToCanvas', 'seen')) for s in sizes] for r in ['webgl2', 'wasm', 'js', 'auto']]))
sect('Radius: 1920 x 1080, bytes in, drawn canvas out, time until finished')
out.append(table(H, [['radius %d, %s' % (rad, r)] + [f(cell(b, '1920x1080', r, 'bytesToCanvas', 'seen', rad)) for b, _ in BR] for rad in [4, 12, 40] for r in ['webgl2', 'wasm', 'js']]))
sect('What auto found on each device (480 x 270 probe, ms)')
rows = []
for b, n in BR:
    if not D[b]: continue
    i = D[b][0].get('info', {})
    rows.append([n, str(i.get('webgl2')), f(i.get('glMs')), f(i.get('wasmMs')), str(i.get('webgl2Worth')), str(i.get('canvasRoute')), str(i.get('pixelsRoute'))])
out.append(table(['Browser', 'WebGL 2 context', 'probe on WebGL 2', 'probe in wasm', 'WebGL 2 worth it', 'drawn pictures by', 'pixels by'], rows).replace('---:', '---'))
sect('First use on a fresh page (7 fresh pages, median): ready() then the first 1920 x 1080 blur by the route auto picks')
rows = []
for b, n in BR:
    c = [x for run in D[b] for x in run.get('cold', [])]
    if not c: continue
    rows.append([n, f(med([x['readyMs'] for x in c])), f(med([x['readyGap'] for x in c])), f(med([x['seen'] for x in c])), f(med([x['gap'] for x in c])), ', '.join(sorted(set(x['route'] for x in c)))])
out.append(table(['Browser', 'ready() total', 'longest page task during ready()', 'first blur until finished', 'longest page task during it', 'route'], rows).replace('---:', '---'))
sect('Picture match at 1920 x 1080 radius 12 against the plain JavaScript reference (share of equal values; higher is better)')
rows = []
for b, n in BR:
    m = [run.get('match') for run in D[b] if run.get('match')]
    if not m: continue
    m = m[0]
    rows.append([n, m['webgl2Ran'], '%.4f%% (within 1 level %.4f%%, largest %d)' % (m['webgl2']['eqPct'], m['webgl2']['w1Pct'], m['webgl2']['max']), '%.4f%% (largest %d)' % (m['wasm']['eqPct'], m['wasm']['max'])])
out.append(table(['Browser', 'card route ran as', 'card route', 'wasm route'], rows).replace('---:', '---'))
sect('Competitors, same picture, a blur that looks like a Gaussian of sigma 6 (ms, lower is better; "finished" = drawn and forced to completion; a one-block call is the page waiting)')
for size in ['1920x1080', '480x270']:
    names = []
    for run in D['chromium'] + D['firefox'] + D['webkit'] + D['epiphany']:
        for c in run.get('competitors', []):
            if c['size'] == size and c['name'] not in names: names.append(c['name'])
    rows = []
    for nm in names:
        r = [nm]
        for b, _ in BR:
            cs = [c for run in D[b] for c in run.get('competitors', []) if c['size'] == size and c['name'] == nm]
            if not cs: r.append('n/a'); continue
            if cs[0].get('unavailable'): r.append('not available (' + cs[0]['unavailable'] + ')'); continue
            t = med([c.get('seen') if c.get('seen') is not None else c.get('call') for c in cs]); g = med([c.get('gap') for c in cs])
            r.append(f(t) + ' / task ' + f(g))
        rows.append(r)
    for scen, key, label in [('bytesToCanvas', 'seen', 'gpu-blur auto (this module), bytes in, drawn out'), ('canvasToCanvas', 'seen', 'gpu-blur auto (this module), canvas in, drawn out')]:
        rows.append([label] + [f(cell(b, size, 'auto', scen, key)) + ' / task ' + f(cell(b, size, 'auto', scen, 'gap')) if D[b] else 'n/a' for b, _ in BR])
    out.append('\n**' + size.replace('x', ' x ') + '** (each cell: time / longest page task)\n\n' + table(['Library or feature'] + [n for _, n in BR], rows))
print(''.join(out) if isinstance(out[0], str) else '')
