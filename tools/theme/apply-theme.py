#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
# Puts the shared look (tools/theme/theme.css) and a header band into every modules/*/demo.html. Only inserts between marker comments, never edits the page itself, and can be run again.
#   python3 tools/theme/apply-theme.py            write the pages
#   python3 tools/theme/apply-theme.py --check    exit 1 when a page is out of date
#   python3 tools/theme/apply-theme.py --remove   take the markers and what is between them out again
import os, re, sys, glob
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
css = open(os.path.join(root, 'tools/theme/theme.css'), encoding='utf-8').read()
cut = css.index('/* lfc-page:')
band_css = css[:cut]
# Pages whose own look must stay (full-window pages and pages that paint their own body): the band only, or nothing.
NONE = {'back-close', 'cartoon-3d-kit', 'pad-nav', 'stage-curtains', 'netflow-engine'}   # full-window demos (a band would push them off the screen) and a page whose own security policy blocks inline styles
BAND_ONLY = {'fly-to-mini', 'field-report', 'gpu-blur'}   # paint their own body (gradient, dark page) or are drawing surfaces
# Full-window pages get a small corner link instead of a band: nothing moves and nothing is pushed off the screen.
CORNER = {'back-close': 'modules/back-close/demo.html', 'cartoon-3d-kit': 'modules/cartoon-3d-kit/demo.html', 'pad-nav': 'modules/pad-nav/demo.html', 'stage-curtains': 'modules/stage-curtains/demo.html', 'netflow-engine': 'modules/netflow-engine/demo.html', 'cartoon-3d-kit/crowd': 'modules/cartoon-3d-kit/crowd-demo.html'}
CORNER_CSS = ".lfc-corner{position:fixed;top:8px;left:8px;z-index:2147483000;font:600 13px/1 'Segoe UI',system-ui,sans-serif;background:rgba(15,42,71,.88);color:#f3f7fc;padding:7px 11px;border-radius:999px;text-decoration:none;opacity:.8}.lfc-corner:hover,.lfc-corner:focus-visible{opacity:1}.lfc-corner:focus-visible{outline:3px solid #4c9bf5;outline-offset:2px}"
# netflow-engine's own security policy only allows its style file, so its rule lives in demo/page.css.
CSS_FILE = {'netflow-engine': 'modules/netflow-engine/demo/page.css'}
M = {'s': ('<!-- lfc-theme:start -->', '<!-- lfc-theme:end -->'), 'b': ('<!-- lfc-band:start -->', '<!-- lfc-band:end -->')}
RX = re.compile(r'\n?<!-- lfc-(theme|band):start -->.*?<!-- lfc-(theme|band):end -->\n?', re.S)
def strip(t): return RX.sub('\n', t) if RX.search(t) else t
def head_end(t):
    # where the page body starts: after the last head-ish element (title, meta, link, style) that follows the header comment, or after <body ...>
    m = re.search(r'<body[^>]*>', t)
    if m: return m.end(), True
    i = t.index('-->') + 3 if '-->' in t[:3000] else 0
    pos = i
    for m in re.finditer(r'\s*(<meta[^>]*>|<title>.*?</title>|<link[^>]*>|<style[^>]*>.*?</style>)', t[i:], re.S):
        if m.start() != pos - i: break
        pos = i + m.end()
    return pos, False
EXTRA = ['tools/speed-lab/demo.html', 'modules/memory-compression/demo-arrays.html']   # more pages that get the same look
def build(name, t, up='../../'):
    t = strip(t)
    if name in NONE: return t
    pos, has_body = head_end(t)
    page = css if name not in BAND_ONLY else band_css
    style = M['s'][0] + '<style>' + page.strip().replace('\n', '\n') + '</style>' + M['s'][1]
    band = (M['b'][0] + '<header class="lfc-band"><div class="lfc-in"><a class="lfc-brand" href="%sindex.html">JS-modules</a><span class="lfc-here">%s</span>'
            '<nav aria-label="JS-modules"><a href="%sdemos.html">All demos</a><a href="README.md">Docs</a><a href="%sindex.html">Overview</a></nav></div></header>' % (up, name, up, up) + M['b'][1])
    # style goes just before the band, after the page's own styles (so it wins on equal weight); both land at the start of the body
    return t[:pos] + '\n' + style + '\n' + band + '\n' + t[pos:].lstrip('\n')
def corner(key, t, up='../../'):
    t = strip(t)
    pos, _ = head_end(t)
    name = key.split('/')[0]
    style = '' if name in CSS_FILE else M['s'][0] + '<style>' + CORNER_CSS + '</style>' + M['s'][1]
    link = M['b'][0] + '<a class="lfc-corner" href="%sdemos.html">&larr; All demos</a>' % up + M['b'][1]
    return t[:pos] + '\n' + style + link + '\n' + t[pos:].lstrip('\n')
CSSRX = re.compile(r'\n?/\* lfc-corner:start \*/.*?/\* lfc-corner:end \*/\n?', re.S)
def main(argv):
    bad = 0
    for f in sorted(glob.glob(os.path.join(root, 'modules', '*', 'demo.html'))) + [os.path.join(root, e) for e in EXTRA]:
        name = os.path.basename(os.path.dirname(f)); t = open(f, encoding='utf-8').read()
        if name in CORNER and name in NONE: continue
        n = strip(t) if '--remove' in argv else build(name, t)
        if n != t:
            if '--check' in argv: print('out of date:', os.path.relpath(f, root)); bad += 1
            else: open(f, 'w', encoding='utf-8', newline='').write(n); print('wrote', os.path.relpath(f, root))
    for key, rel in CORNER.items():
        f = os.path.join(root, rel); t = open(f, encoding='utf-8').read()
        n = strip(t) if '--remove' in argv else corner(key, t)
        if n != t:
            if '--check' in argv: print('out of date:', rel); bad += 1
            else: open(f, 'w', encoding='utf-8', newline='').write(n); print('wrote', rel)
    for name, rel in CSS_FILE.items():
        f = os.path.join(root, rel); t = open(f, encoding='utf-8').read()
        base = CSSRX.sub('\n', t)
        n = base if '--remove' in argv else base.rstrip('\n') + '\n/* lfc-corner:start */' + CORNER_CSS + '/* lfc-corner:end */\n'
        if n != t:
            if '--check' in argv: print('out of date:', rel); bad += 1
            else: open(f, 'w', encoding='utf-8', newline='').write(n); print('wrote', rel)
    return 1 if bad else 0
if __name__ == '__main__': sys.exit(main(sys.argv[1:]))
