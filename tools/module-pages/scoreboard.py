#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
# The front-page scoreboard: one dot per measured comparison, built from scoreboard.json.
#   python3 tools/module-pages/scoreboard.py --write    rebuild the block in index.html (between the two scoreboard markers)
#   python3 tools/module-pages/scoreboard.py --check    fail if the block is out of date, or if a dot's proof text is missing
#                                                       from its module page (so a dot cannot outlive the page behind it)
import sys as _sys, os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', 'single-file-tools'))
import json, math, os, re, sys, html
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA = os.path.join(root, 'tools/module-pages/scoreboard.json')
INDEX = os.path.join(root, 'index.html')
BEGIN, END = '<!--scoreboard:begin-->', '<!--scoreboard:end-->'

def esc(s): return html.escape(s, quote=False)

def block(d):
    rows = sorted(d['rows'], key=lambda r: -r['x'])
    lo, hi = math.log10(0.3), math.log10(3000)
    pos = lambda v: (math.log10(v) - lo) / (hi - lo) * 100
    wins = sum(1 for r in rows if r['x'] >= 1.0 and not r.get('level'))
    loss = sum(1 for r in rows if r['x'] < 1.0)
    level = len(rows) - wins - loss
    body = ''
    for r in rows:
        v = r['x']
        cls = ' l' if v < 1 else ''
        body += (f'<div class="row"><span>{esc(r["label"])}</span><div class="track"><i class="dot{cls}" style="left:{pos(v):.1f}%"></i>'
                 f'<b class="{"lo" if v < 1 else ""}" style="left:{pos(v):.1f}%">{v:g}x</b></div></div>\n    ')
    ticks = ''.join(f'<span style="left:{pos(t):.1f}%">{lab}</span>' for t, lab in [(1, '1x'), (10, '10x'), (100, '100x'), (1000, '1,000x')])
    title = f'We are ahead of the nearest alternative on {wins} of the {len(rows)} comparisons we have measured'
    if level: title += f', level on {level}'
    title += f', and behind on {loss}'
    return (f'{BEGIN}\n    <div class="eco score">\n    <h3>{title}</h3>\n'
            f'    <p class="sub">Times faster than the named alternative, one dot per comparison (log scale; the line is level, right is ahead).</p>\n'
            f'    {body}<div class="row ax"><div></div><div class="track">{ticks}</div></div>\n'
            f'    <p class="src">{esc(d["note"])}</p>\n  </div>\n  {END}')

def current():
    d = json.load(open(DATA, encoding='latin-1'))
    return d, open(INDEX, encoding='latin-1').read()

def page_text(mod):
    p = os.path.join(root, 'modules', mod, 'index.html')
    if not os.path.exists(p): return ''
    t = open(p, encoding='latin-1').read()
    return html.unescape(re.sub(r'<[^>]+>', ' ', t)).replace(' ', ' ')

def main(argv):
    d, s = current()
    new = block(d)
    if BEGIN in s:
        cur = s[s.index(BEGIN):s.index(END) + len(END)]
    else:
        cur = None
    if '--write' in argv:
        if cur is None:
            m = re.search(r'    <div class="eco score">.*?</div>\n  </div>\n', s, re.S)
            # first run: replace the hand-made block
            a = s.index('    <div class="eco score">')
            b = s.index('  </div>\n', s.index('<p class="src">', a)) + len('  </div>\n')
            s = s[:a] + '  ' + new + '\n' + s[b:]
        else:
            s = s.replace(cur, new)
        open(INDEX, 'w', encoding='latin-1').write(s)
        print('scoreboard written:', len(d['rows']), 'rows')
        return 0
    bad = []
    if cur != new: bad.append('index.html scoreboard block is out of date (run --write)')
    for r in d['rows']:
        t = page_text(r['module'])
        for need in r['proof']:
            if need not in re.sub(r'\s+', ' ', t):
                bad.append(f'{r["label"]}: "{need}" not found on modules/{r["module"]}/index.html')
    if bad:
        print('scoreboard problems:'); [print(' -', b) for b in bad]; return 1
    print('scoreboard: ok,', len(d['rows']), 'rows')
    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv))
