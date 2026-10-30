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
def main(argv):
    bad = 0
    for f in sorted(glob.glob(os.path.join(root, 'modules', '*', 'demo.html'))) + [os.path.join(root, e) for e in EXTRA]:
        name = os.path.basename(os.path.dirname(f)); t = open(f, encoding='utf-8').read()
        n = strip(t) if '--remove' in argv else build(name, t)
        if n != t:
            if '--check' in argv: print('out of date:', os.path.relpath(f, root)); bad += 1
            else: open(f, 'w', encoding='utf-8', newline='').write(n); print('wrote', os.path.relpath(f, root))
    return 1 if bad else 0
if __name__ == '__main__': sys.exit(main(sys.argv[1:]))
