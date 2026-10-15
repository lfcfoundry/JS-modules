"""
optfonts.py: cut every base64 font embedded in an HTML file down to the characters the file can actually show.
Part of JS-modules, https://github.com/JNFoo/JS-modules
Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).

Collects every character in the file (typed directly, written as \\uXXXX / \\u{...} / \\xNN, or as an &entity;), adds plain ASCII and a few
typographic spaces and quotes, then subsets each @font-face with fontTools and re-embeds it as woff2.

    pip install fonttools brotli
    python3 optfonts.py in.html out.html [--report] [--features kern,liga,tnum]

Layout features kept by default: kerning, ligatures, accents, required forms and tabular digits (tnum). Pass --features to change.
Only works on @font-face rules whose src is a data: URL with base64 data and that name font-family in single quotes.
If your page builds text from data loaded later (a database, user input), add those characters with --extra "ñéü".
"""
import re, sys, io, base64, html, argparse
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--report', action='store_true')
ap.add_argument('--features', default='ccmp,locl,mark,mkmk,kern,liga,clig,calt,rlig,rclt,rvrn,curs,tnum')
ap.add_argument('--extra', default='')
a = ap.parse_args()
FEATURES = [f for f in a.features.split(',') if f]
s = open(a.src, encoding='utf-8').read()
need = set(range(0x20, 0x7f)) | {ord(c) for c in s if ord(c) > 127} | {ord(c) for c in a.extra}
need |= {int(m, 16) for m in re.findall(r'\\u([0-9a-fA-F]{4})', s)}
need |= {int(m, 16) for m in re.findall(r'\\u\{([0-9a-fA-F]+)\}', s)}
need |= {int(m, 16) for m in re.findall(r'\\x([0-9a-fA-F]{2})', s)}
for e in set(re.findall(r'&#?\w+;', s)):
    need |= {ord(c) for c in html.unescape(e)}
need |= {0xa0, 0xad, 0x2009, 0x202f, 0x2212, 0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2022, 0x2026}
before = after = 0
rep = []

def sub(m):
    global before, after
    body = m.group(1)
    fam = re.search(r"font-family:\s*'([^']+)'", body)
    b64 = re.search(r'base64,([A-Za-z0-9+/=]+)', m.group(0))
    if not fam or not b64:
        return m.group(0)
    raw = base64.b64decode(b64.group(1))
    f = TTFont(io.BytesIO(raw), recalcTimestamp=False)
    cm = f.getBestCmap()
    keep = sorted(u for u in need if u in cm)
    o = Options(); o.flavor = 'woff2'; o.layout_features = FEATURES; o.notdef_outline = True
    o.name_IDs = [1, 2]; o.hinting = False; o.glyph_names = False; o.legacy_kern = True; o.drop_tables += ['DSIG']
    sb = Subsetter(o); sb.populate(unicodes=keep); sb.subset(f)
    out = io.BytesIO(); f.flavor = 'woff2'; f.save(out); nb = out.getvalue()
    before += len(raw); after += len(nb)
    rep.append('%s: %d -> %d bytes, %d characters kept (of %d in the font)' % (fam.group(1), len(raw), len(nb), len(keep), len(cm)))
    return m.group(0).replace(b64.group(1), base64.b64encode(nb).decode())

s2 = re.sub(r'@font-face\s*\{(.*?)\}', sub, s, flags=re.S)
open(a.dst, 'w', encoding='utf-8').write(s2)
print('fonts: %d -> %d bytes of font data (file %d -> %d)' % (before, after, len(s), len(s2)))
if a.report:
    print('\n'.join(rep))
