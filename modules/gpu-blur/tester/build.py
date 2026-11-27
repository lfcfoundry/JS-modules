#!/usr/bin/env python3
"""Copyright (c) 2026 LFC Foundry. MIT License. Puts the shipped gpu-blur.js (and core-plan.js) into gpu-blur-device-test.html between the GPU_BLUR (and CORE_PLAN) markers and stamps the build (US Eastern).
  python3 build.py          write the page      python3 build.py --check   exit 1 when the inlined module is not byte for byte the shipped file"""
import os, re, sys, datetime, zoneinfo
here = os.path.dirname(os.path.abspath(__file__)); page = os.path.join(here, 'gpu-blur-device-test.html')
mod = open(os.path.join(here, '..', 'gpu-blur.js'), encoding='utf-8').read()
html = open(page, encoding='utf-8').read()
pat = re.compile(r'(/\*GPU_BLUR:BEGIN\*/\n)(.*?)(\n/\*GPU_BLUR:END\*/)', re.S)
m = pat.search(html)
if not m: sys.exit('markers not found')
if '</script' in mod.lower(): sys.exit('the module contains a script end tag')
if '--check' in sys.argv:
    ok = m.group(2) == mod.rstrip('\n') and '/*CORE_PLAN:BEGIN*/\n' + open(os.path.join(here, '..', '..', 'core-plan', 'core-plan.js'), encoding='utf-8').read().rstrip('\n') + '\n/*CORE_PLAN:END*/' in html; print('inlined gpu-blur.js is ' + ('current' if ok else 'NOT current')); sys.exit(0 if ok else 1)
html = html[:m.start(2)] + mod.rstrip('\n') + html[m.end(2):]
cp = open(os.path.join(here, '..', '..', 'core-plan', 'core-plan.js'), encoding='utf-8').read().rstrip('\n')   # the shared helper-count rule, inline: the page has no network
m2 = re.compile(r'(/\*CORE_PLAN:BEGIN\*/\n)(.*?)(\n/\*CORE_PLAN:END\*/)', re.S).search(html)
if not m2: sys.exit('core-plan markers not found')
html = html[:m2.start(2)] + cp + html[m2.end(2):]
stamp = datetime.datetime.now(zoneinfo.ZoneInfo('America/New_York')).strftime('%Y.%m.%d.%H%M')
html = re.sub(r"var BUILD = '[^']*';", "var BUILD = '" + stamp + "';", html, count=1)
open(page, 'w', encoding='utf-8').write(html); print('wrote ' + page + ' build ' + stamp)
