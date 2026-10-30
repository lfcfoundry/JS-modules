#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds a themed web page for a module (or a group of small modules) from its README.md and its modules.json entry.
#   python3 tools/module-pages/build.py pcodec-js save-kit    write modules/<id>/index.html for each id
#   python3 tools/module-pages/build.py --all                 every module in modules.json
import html, json, os, re, sys
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GH = 'https://github.com/lfcfoundry/JS-modules/blob/main/'
css = open(os.path.join(root, 'tools/theme/theme.css'), encoding='utf-8').read()
band_css = css[:css.index('/* lfc-page:')]
EXTRA = """
body{margin:0}.wrap{max-width:820px;margin:0 auto;padding:0 16px 48px;box-sizing:border-box}
.hero{background:var(--lfc-hero);color:var(--lfc-hero-fg);padding:28px 0 26px;margin-bottom:8px}.hero .wrap{padding-bottom:0}
.hero h1{margin:0 0 6px;font-size:clamp(30px,7vw,44px);color:var(--lfc-hero-fg)}.hero p{margin:6px 0;color:var(--lfc-hero-muted);font-size:18px}
.hero .v{display:inline-block;font:600 13px var(--lfc-mono);letter-spacing:.04em;color:var(--lfc-hero-muted);border:1px solid var(--lfc-hero-muted);border-radius:99px;padding:2px 10px}
.btns{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.btns a{background:var(--lfc-accent);color:var(--lfc-accent-fg);padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700}
.btns a.alt{background:transparent;border:1px solid var(--lfc-hero-muted);color:var(--lfc-hero-fg)}
nav.jump{display:flex;flex-wrap:wrap;gap:6px 14px;margin:18px 0;font-size:15px}
h2{margin:34px 0 8px;font-size:26px}h3{margin:20px 0 6px}
pre{overflow-x:auto;font-size:14px;max-width:100%}p code,li code,td code{overflow-wrap:anywhere}.wrap{overflow-wrap:break-word}table{border-collapse:collapse;display:block;overflow-x:auto;max-width:100%}th,td{border:1px solid var(--lfc-line);padding:6px 10px;text-align:left;vertical-align:top;font-size:15px}th{background:var(--lfc-soft)}
.wrap{line-height:1.6}p,li{margin:.7em 0}td{line-height:1.5}
@media(max-width:700px){table,tbody{display:block}thead{display:none}tr{display:block;border:1px solid var(--lfc-line);border-radius:10px;margin:0 0 16px;padding:6px 14px;background:var(--lfc-soft)}
td{display:block;border:0;border-bottom:1px solid var(--lfc-line);padding:10px 0;font-size:16px}td:last-child{border-bottom:0}
td::before{content:attr(data-l);display:block;font:700 12px var(--lfc-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--lfc-muted,#6b7a8c);margin-bottom:3px}td:first-child{font-weight:700}td:first-child::before{display:none}}
.ph{border:2px dashed var(--lfc-line);border-radius:10px;padding:10px 14px;background:var(--lfc-soft)}.mod{border-top:2px solid var(--lfc-line);margin-top:40px}
"""
def esc(s): return html.escape(s, quote=False)
def inline(s, base):
    codes = []
    s = re.sub(r'`([^`]+)`', lambda m: (codes.append(m.group(1)) or '\0%d\0' % (len(codes) - 1)), s)
    s = esc(s)
    def link(m):
        u = m.group(2).replace('&amp;', '&')
        if not re.match(r'^(https?:|#|mailto:)', u):
            u = u[:-len('demo.html')] + 'demo.html' if u.endswith('demo.html') else GH + os.path.normpath(os.path.join(base, u)).replace('\\', '/')
        return '<a href="%s">%s</a>' % (html.escape(u, quote=True), m.group(1))
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', link, s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'(?<![\w*])\*([^*\n]+)\*(?![\w*])', r'<em>\1</em>', s)
    return re.sub('\0(\\d+)\0', lambda m: '<code>%s</code>' % esc(codes[int(m.group(1))]), s)
def md(text, base):
    out, lines, i = [], text.split('\n'), 0
    while i < len(lines):
        l = lines[i]
        if l.startswith('```'):
            j = i + 1; code = []
            while j < len(lines) and not lines[j].startswith('```'): code.append(lines[j]); j += 1
            out.append('<pre><code>%s</code></pre>' % esc('\n'.join(code))); i = j + 1; continue
        if l.startswith('|') and i + 1 < len(lines) and re.match(r'^\|[\s:|-]+\|?$', lines[i + 1]):
            rows = []
            j = i
            while j < len(lines) and lines[j].startswith('|'): rows.append(lines[j]); j += 1
            cells = lambda r: [c.strip() for c in r.strip().strip('|').split('|')]
            hs = cells(rows[0])
            t = '<table><thead><tr>%s</tr></thead><tbody>' % ''.join('<th>%s</th>' % inline(c, base) for c in hs)
            for r in rows[2:]: t += '<tr>%s</tr>' % ''.join('<td data-l="%s">%s</td>' % (html.escape(hs[k] if k < len(hs) else '', quote=True), inline(c, base)) for k, c in enumerate(cells(r)))
            out.append(t + '</tbody></table>'); i = j; continue
        m = re.match(r'^(#{3,4}) (.*)', l)
        if m: out.append('<h3>%s</h3>' % inline(m.group(2), base)); i += 1; continue
        if re.match(r'^\s*[-*] ', l):
            items = []
            while i < len(lines) and (re.match(r'^\s*[-*] ', lines[i]) or (lines[i].startswith('  ') and items)):
                if re.match(r'^\s*[-*] ', lines[i]): items.append(re.sub(r'^\s*[-*] ', '', lines[i]))
                else: items[-1] += ' ' + lines[i].strip()
                i += 1
            out.append('<ul>%s</ul>' % ''.join('<li>%s</li>' % inline(x, base) for x in items)); continue
        if re.match(r'^\d+\. ', l):
            items = []
            while i < len(lines) and re.match(r'^\d+\. ', lines[i]): items.append(re.sub(r'^\d+\. ', '', lines[i])); i += 1
            out.append('<ol>%s</ol>' % ''.join('<li>%s</li>' % inline(x, base) for x in items)); continue
        if l.strip():
            para = [l]; i += 1
            while i < len(lines) and lines[i].strip() and not re.match(r'^(#|```|\||\s*[-*] |\d+\. )', lines[i]): para.append(lines[i]); i += 1
            out.append('<p>%s</p>' % inline(' '.join(para), base)); continue
        i += 1
    return '\n'.join(out)
def sections(readme):
    parts = re.split(r'^## ', readme, flags=re.M)
    head, secs = parts[0], {}
    order = []
    for p in parts[1:]:
        t, _, b = p.partition('\n'); secs[t.strip()] = b.strip('\n'); order.append(t.strip())
    return head, secs, order
GROUPS = [('Why it exists', ['Why it exists']),
          ('Highlights', ['Looks, timing and a worker', 'What it does that plain JSON saves do not', 'What is different', 'What it does differently', 'What it protects you from', 'Pick a file']),
          ('How it compares', ['How it compares', 'How it differs', 'Numbers', 'Measured', 'Compared']),
          ('How to use it', ['Use', 'Quick start', 'API', 'Options', 'Try it and test it', 'Lean builds', 'Lean build']),
          ('Who uses it', ['See it in action']),
          ('Good to know', ['Limits', 'What it is not', 'Good to know', 'Rules'])]
def pick(secs, order, keys):
    got = []
    for t in order:
        if any(t.startswith(k) or k in t for k in keys): got.append(t)
    return got
def module_html(m, base_mods):
    mid = m['id']; folder = m.get('folder') or os.path.dirname(m['readme'])
    readme = open(os.path.join(root, m['readme']), encoding='utf-8').read()
    head, secs, order = sections(readme)
    intro = [p for p in head.split('\n\n') if p.strip() and not p.startswith('#') and not p.startswith('**Version') and not p.startswith('**Tested') and not p.startswith('Part of')]
    used, body = set(), []
    body.append('<h2 id="what">What it does</h2>' + md('\n\n'.join(intro[:3]), folder))
    for title, keys in GROUPS:
        ts = [t for t in pick(secs, order, keys) if t not in used]
        if not ts: continue
        body.append('<h2 id="%s">%s</h2>' % (re.sub(r'\W+', '-', title.lower()), title))
        for t in ts:
            used.add(t)
            if t != title and len(ts) > 1 or t not in (title, 'Why it exists', 'Use', 'Quick start', 'How it compares', 'See it in action'): body.append('<h3>%s</h3>' % esc(t))
            body.append(md(secs[t], folder))
    body.append('<h2 id="numbers">Speed and efficiency numbers</h2><div class="ph"><p><strong>Placeholder.</strong> Measured speed, size and memory numbers for this module will appear here as they are collected. Each will name the browser and device it was measured on. Until then, only the numbers already in the comparison above are published.</p></div>')
    rest = [t for t in order if t not in used and t not in ('For AI agents', 'Prior art and credits', 'Full research notes')]
    if rest:
        body.append('<h2 id="more">More</h2>')
        for t in rest: body.append('<h3>%s</h3>' % esc(t) + md(secs[t], folder))
    if 'Prior art and credits' in secs:
        body.append('<h2 id="credits">Credits</h2>' + md(secs['Prior art and credits'], folder))
    ver = re.search(r'\*\*Version ([^*]+)\*\*', readme); ver = ver.group(1) if ver else m.get('version', '')
    btn = ''
    if os.path.exists(os.path.join(root, folder, 'demo.html')): btn += '<a href="demo.html">Open the demo</a>'
    btn += '<a class="alt" href="%s%s">README</a>' % (GH, m['readme'])
    if os.path.exists(os.path.join(root, folder, 'CHANGELOG.md')): btn += '<a class="alt" href="%s%s/CHANGELOG.md">Changelog</a>' % (GH, folder)
    jump = ''.join('<a href="#%s">%s</a>' % (re.search(r'id="([^"]+)"', b).group(1), re.search(r'>([^<]+)</h2>', b).group(1)) for b in body if b.startswith('<h2'))
    band = '<header class="lfc-band"><div class="lfc-in"><a class="lfc-brand" href="../../index.html">JS-modules</a><span class="lfc-here">%s</span><nav aria-label="JS-modules"><a href="../../demos.html">All demos</a><a href="../../index.html">Overview</a></nav></div></header>' % esc(mid)
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>%s · JS-modules</title><meta name="description" content="%s"><style>%s%s</style></head><body>%s<div class="hero"><div class="wrap"><span class="v">%s</span><h1>%s</h1><p>%s</p><div class="btns">%s</div></div></div><main class="wrap"><nav class="jump" aria-label="On this page">%s</nav>%s</main></body></html>\n'
            % (esc(mid), html.escape(m.get('short', ''), quote=True), band_css, EXTRA, band, esc(ver), esc(mid), esc(m.get('summary', '')), btn, jump, '\n'.join(body)))
def main(argv):
    data = json.load(open(os.path.join(root, 'modules.json'), encoding='utf-8'))
    mods = {m['id']: m for m in data['modules'] + data['tools']}
    ids = list(mods) if '--all' in argv else [a for a in argv if not a.startswith('--')]
    for i in ids:
        m = mods[i]; folder = m.get('folder') or os.path.dirname(m['readme'])
        open(os.path.join(root, folder, 'index.html'), 'w', encoding='utf-8', newline='').write(module_html(m, mods)); print('wrote', folder + '/index.html')
if __name__ == '__main__': main(sys.argv[1:])
