#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds the markdown tables for RESULT-four-browsers.md from the raw json files. python3 mkresult.py > tables.md
import json, os, statistics as st, sys
W = os.path.dirname(os.path.abspath(__file__)); F = os.path.join(W, 'final'); R = os.path.join(W, '..', 'final-rest'); FP = os.path.join(W, '..', 'bridge', 'out')
BR = [('chromium', 'Chromium 155.0.8059.39'), ('firefox', 'Firefox 158.0'), ('webkit', 'WebKitGTK 2.52.6'), ('epiphany', 'GNOME Web 46.5')]
med = st.median
def J(p):
    return json.load(open(p)) if os.path.exists(p) else None
def runs(b, names=('run3', 'run2', 'run1')):
    return [(n, (J(os.path.join(F, f'{n}-{b}.json')) or {}).get('tests', {})) for n in names]
def pc(a, b): return (b / a - 1) * 100
def f1(x): return f'{x:,.1f}'
def f0(x): return f'{x:,.0f}'
def sgn(x): return f'{x:+.0f}%' if abs(x) >= 0.5 else '0%'
out = []
def P(s=''): out.append(s)
hdr = '| ' + ' | '.join(['Measure'] + [n for _, n in BR]) + ' |'
sep = '|---|' + '---:|' * 4
def table(title, rows, note=None):
    P(f'**{title}**'); P(); P(hdr); P(sep)
    for r in rows: P('| ' + ' | '.join(r) + ' |')
    if note: P(); P(note)
    P()
T = {b: runs(b)[0][1] for b, _ in BR}          # run3 = the final build
T2 = {b: runs(b)[1][1] for b, _ in BR}         # run2 = the build before the last small change (same code paths for these tests)
T1 = {b: runs(b)[2][1] for b, _ in BR}
def cell2(get, fmt=f1):
    return [fmt(get(b)) if get(b) is not None else 'n/a' for b, _ in BR]
# --- big unpack
rows = []
for t, label in (('unpack-steady', 'program already holds its memory'), ('unpack-cold', 'fresh program (release() before each call)')):
    rows.append([f'{label}: 1.5.1'] + [f1(T[b][t]['A']) for b, _ in BR])
    rows.append([f'{label}: 1.6.0'] + [f1(T[b][t]['B']) for b, _ in BR])
    rows.append([f'{label}: change'] + [sgn(pc(T[b][t]['A'], T[b][t]['B'])) for b, _ in BR])
table('Copy `unpack()` of one 4,000,000-number file, ms, median of 40 turns (lower is better); the two versions take turns', rows)
rows = []
for t, label in (('unpack-steady', 'steady'), ('unpack-cold', 'fresh')):
    for n in ('run1', 'run2', 'run3'):
        TT = {b: dict(runs(b))[n] for b, _ in BR}
        rows.append([f'{label}, {n}: change'] + [sgn(pc(TT[b][t]['A'], TT[b][t]['B'])) if t in TT[b] else 'n/a' for b, _ in BR])
table('Same, repeated in fresh browser instances (change of 1.6.0 against 1.5.1; negative is faster)', rows)
rows = [['wasm memory held, 1.5.1 (MB)'] + [f1(T[b]['unpack-steady']['memA']/1048576) for b, _ in BR], ['wasm memory held, 1.6.0 (MB)'] + [f1(T[b]['unpack-steady']['memB']/1048576) for b, _ in BR]]
table('Wasm memory the program holds after that unpack (MB, lower is better)', rows)
# --- set
rows = [['1.5.1'] + [f1(T[b]['set']['A']) for b, _ in BR], ['1.6.0'] + [f1(T[b]['set']['B']) for b, _ in BR], ['change'] + [sgn(pc(T[b]['set']['A'], T[b]['set']['B'])) for b, _ in BR]]
table(f'Copy `unpack()` of 13 columns ({T["chromium"]["set"]["numbers"]:,} numbers, 8 types, only the 600,000-number one reaches the batched path), ms, median of 40 turns (lower is better)', rows)
# --- startup
rows = []
for f, lab in (('read', 'pcodec-js.js'), ('fast', 'pcodec-js-fast.js'), ('pack', 'pcodec-js-pack.js')):
    for k, kl in (('evalMs', 'script run'), ('loadMs', 'load() until ready'), ('totalMs', 'total')):
        rows.append([f'{lab}, {kl}: 1.5.1 / 1.6.0'] + [f"{f1(med([i[k] for i in T[b]['startup'][f]['A']]))} / {f1(med([i[k] for i in T[b]['startup'][f]['B']]))}" for b, _ in BR])
    rows.append([f'{lab}, longest page gap, median (worst of 40): 1.5.1 / 1.6.0'] + [f"{f1(med([i['gapMax'] for i in T[b]['startup'][f]['A']]))} ({f0(max(i['gapMax'] for i in T[b]['startup'][f]['A']))}) / {f1(med([i['gapMax'] for i in T[b]['startup'][f]['B']]))} ({f0(max(i['gapMax'] for i in T[b]['startup'][f]['B']))})" for b, _ in BR])
table('Start-up in a fresh page, ms, median of 40 fresh pages (lower is better); each cell is 1.5.1 / 1.6.0', rows)
# --- workers
w = lambda b, k, v: med([i[k] for i in T[b]['workers'][v]])
rows = []
for k, lab in (('workerReady', 'first worker ready'), ('poolCreate', 'pool of 4 made with warm: true'), ('workerUnpack', 'first 4,000,000-number unpack on a new worker'), ('poolFirstSplit', 'first split-file unpack on a new pool of 4'), ('poolSecondSplit', 'second split-file unpack, same pool')):
    rows.append([f'{lab}: 1.5.1 / 1.6.0'] + [f'{f1(w(b, k, "A"))} / {f1(w(b, k, "B"))}' for b, _ in BR])
table('Workers, ms, median of 40 fresh pages (lower is better)', rows)
# --- pool jobs
rows = []
for j, lab in (('split', 'split 4,000,000 numbers, joined into your array'), ('one', 'one normal 4,000,000-number file'), ('list', '12 columns as a list')):
    rows.append([f'{lab}: 1.5.1 / 1.6.0'] + [f"{f1(T[b]['pool'][j]['A'])} / {f1(T[b]['pool'][j]['B'])} ({sgn(pc(T[b]['pool'][j]['A'], T[b]['pool'][j]['B']))})" for b, _ in BR])
table('Pool of 3 workers, steady state, ms, median of 20 turns (lower is better)', rows)
# --- pack
rows = [['1.5.1 / 1.6.0'] + [f"{f1(T[b]['pack']['A'])} / {f1(T[b]['pack']['B'])} ({sgn(pc(T[b]['pack']['A'], T[b]['pack']['B']))})" for b, _ in BR]]
table('`pack()` of three float columns (850,000 numbers; same bytes out), ms, median of 40 turns (lower is better)', rows)
# --- starts / park
s = lambda b, k, v: med([i[k] for i in T[b]['starts'][v]])
rows = []
for k, lab in (('callSync', 'page task of the call that starts 4 workers (the first job of a pool)'), ('firstJobGap', 'longest page gap during that first job'), ('firstJobMs', 'first job of 4 small files, whole time')):
    rows.append([f'{lab}: 1.5.1 / 1.6.0'] + [f'{f1(s(b, k, "A"))} / {f1(s(b, k, "B"))}' for b, _ in BR])
table('Starting the workers of a pool, ms, median of 40 fresh pages (lower is better)', rows)
# --- parking
I = {b: (J(os.path.join(F, f'idle6-{b}.json')) or {}).get('tests', {}).get('idle2') for b, _ in BR}
rows = []
if all(I.values()):
    m = lambda b, v, k: med([i[k] for i in I[b][v] if i.get(k) is not None])
    rows.append(['idle 4.8 s, no pool: longest page gap, median (worst of 6)'] + [f"{f1(m(b, 'none', 'idleMax'))} ({f0(max(i['idleMax'] for i in I[b]['none']))})" for b, _ in BR])
    rows.append(['idle, 1.5.1 pool never parks: longest page gap'] + [f"{f1(m(b, 'A pool', 'idleMax'))} ({f0(max(i['idleMax'] for i in I[b]['A pool']))})" for b, _ in BR])
    rows.append(['idle, 1.6.0 pool parks at about 2.2 s: longest page gap'] + [f"{f1(m(b, 'B pool', 'idleMax'))} ({f0(max(i['idleMax'] for i in I[b]['B pool']))})" for b, _ in BR])
    rows.append(['gap within 60 ms of the parking, median (worst of 6)'] + [f"{f1(m(b, 'B pool', 'aroundPark'))} ({f1(max(i['aroundPark'] or 0 for i in I[b]['B pool']))})" for b, _ in BR])
    rows.append(['first job after parking (4 small files), ms: 1.6.0 restart'] + [f"{f1(m(b, 'B pool', 'restartJobMs'))}" for b, _ in BR])
    rows.append(['same job on a warm pool (1.6.0 / 1.5.1), ms'] + [f"{f1(m(b, 'B pool', 'warmJobMs'))} / {f1(m(b, 'A pool', 'restartJobMs'))}" for b, _ in BR])
    rows.append(['longest page gap during the restart job, median (worst of 6)'] + [f"{f1(m(b, 'B pool', 'restartGap'))} ({f1(max(i['restartGap'] for i in I[b]['B pool']))})" for b, _ in BR])
table('Pool parking (`idleMs: 2500` for this table), ms (lower is better)', rows)
# --- footprint
rows = []
FPd = {b: (J(os.path.join(FP, f'fp-A-{b}.json')), J(os.path.join(FP, f'fp-B-{b}.json'))) for b, _ in BR}
def step(R, name):
    for x in R['mem'] + R['pool']:
        if (x.get('name') or x.get('step')) == name: return x
if all(a and b for a, b in FPd.values()):
    def row(label, name, key='pss'):
        return [label] + [f"{f1(step(FPd[b][0], name)['pss']['mb'])} / {f1(step(FPd[b][1], name)['pss']['mb'])}" for b, _ in BR]
    def delta(label, n0, n1):
        return [label] + [f"{step(FPd[b][0], n1)['pss']['mb'] - step(FPd[b][0], n0)['pss']['mb']:+.1f} / {step(FPd[b][1], n1)['pss']['mb'] - step(FPd[b][1], n0)['pss']['mb']:+.1f}" for b, _ in BR]
    rows.append(delta('process change of a 4,000,000-number copy unpack (MB)', 'big file bytes in page (5.8 MB)', 'unpack copy 4M numbers'))
    rows.append(delta('process change of one worker unpacking it (MB)', 'worker unpacked 4M'.replace('worker unpacked 4M', 'one worker created'), 'worker unpacked 4M'))
    rows.append(['wasm memory held after the copy unpack (MB)'] + [f"{step(FPd[b][0], 'unpack copy 4M numbers')['wasmBytes'] / 1048576:.1f} / {step(FPd[b][1], 'unpack copy 4M numbers')['wasmBytes'] / 1048576:.1f}" for b, _ in BR])
    rows.append(row('pool after a split unpack, result dropped, about 8 s idle (MB)', 'result dropped, 5 s idle'))
    rows.append(row('same pool after it was ended (MB)', 'pool ended'))
    rows.append(['held by the idle pool = idle minus ended (MB)'] + [f"{step(FPd[b][0], 'result dropped, 5 s idle')['pss']['mb'] - step(FPd[b][0], 'pool ended')['pss']['mb']:.1f} / {step(FPd[b][1], 'result dropped, 5 s idle')['pss']['mb'] - step(FPd[b][1], 'pool ended')['pss']['mb']:.1f}" for b, _ in BR])
    rows.append(['workers still running at that point'] + [f"{step(FPd[b][0], 'workers running after the idle time').get('workers') if step(FPd[b][0], 'workers running after the idle time').get('workers') is not None else 'n/a'} / {step(FPd[b][1], 'workers running after the idle time').get('workers')}" for b, _ in BR])
table('Memory of the whole browser (proportional memory of every process, MB, lower is better); each cell is 1.5.1 / 1.6.0; single walk per browser', rows)
print('\n'.join(out))
