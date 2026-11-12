# Copyright (c) 2026 LFC Foundry. MIT License.
# research: import-then-save session table, ratio of medians against 'today' (copy import, 0.9.3 save); peak memory in MB above the level before each step. usage: python3 sessanal.py file.json
import json, sys, statistics as st
d = json.load(open(sys.argv[1])); print(d['ver']); R = {}
for r in d['res']: R.setdefault(r['f'], {}).setdefault(r['v'], []).append(r)
md = lambda xs, f: st.median(f(x) for x in xs)
for f, vs in R.items():
    t = vs['today']; ti, ts = md(t, lambda x: x['im']['importMs']), md(t, lambda x: x['sv']['saveMs'])
    print(f"{f}: today import {ti:.0f} ms (main-thread copy {md(t, lambda x: x['im']['mainCopyMs']):.0f}), save {ts:.0f} ms, peak MB import {md(t, lambda x: x['imPeak']):.0f} save {md(t, lambda x: x['svPeak']):.0f}")
    for v, xs in vs.items():
        if v == 'today': continue
        tot = md(xs, lambda x: x['im']['importMs'] + x['sv']['saveMs']) / md(t, lambda x: x['im']['importMs'] + x['sv']['saveMs'])
        print(f"   {v:11} import {md(xs, lambda x: x['im']['importMs'])/ti:.2f} save {md(xs, lambda x: x['sv']['saveMs'])/ts:.2f} session {tot:.2f}  copy {md(xs, lambda x: x['im']['mainCopyMs']):.0f} ms  peak MB import {md(xs, lambda x: x['imPeak']):.0f} save {md(xs, lambda x: x['svPeak']):.0f}  rows {xs[0]['im']['rows']}")
