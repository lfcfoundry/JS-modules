"""
optfonts.py: cut every base64 font embedded in an HTML file down to the characters the file can actually show.
Part of JS-modules, https://github.com/lfcfoundry/JS-modules
Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).

Collects every character in the file (typed directly, written as \\uXXXX / \\u{...} / \\xNN, as a JavaScript surrogate pair
\\uD83D\\uDE00, as a CSS escape such as content:"\\2605", or as an &entity;), adds plain ASCII and a few typographic spaces and quotes,
then subsets each @font-face with fontTools and re-embeds it as woff2.

    pip install fonttools brotli
    python3 optfonts.py in.html out.html [--report] [--features kern,liga,tnum] [--extra "ñéü"] [--format woff2|woff]

Layout features kept by default: kerning, ligatures, accents, required forms and tabular digits (tnum). Pass --features to change.
Only works on @font-face rules whose src is a data: URL with base64 data and that name font-family in single quotes.
If your page builds text from data loaded later (a database, user input), add those characters with --extra "ñéü".

Font licenses: the copyright and license records of each font (name IDs 0, 13 and 14) are kept in the subset, and the same notice is written
into a /*! ... */ comment in front of the @font-face rule. If a font is under the SIL Open Font License a warning is printed: subsetting
counts as modifying the font, every copy you ship has to keep the notice, and a font with a Reserved Font Name must be renamed.
--format woff writes woff (zlib) instead of woff2, for when the brotli module is not installed.
"""
import re, sys, io, base64, html, argparse

# What the page can print, besides plain ASCII (U+0020-U+007E): typographic spaces, quotes, dashes, bullet, ellipsis.
ALWAYS = {0xa0, 0xad, 0x2009, 0x202f, 0x2212, 0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2022, 0x2026}
NAME_IDS = [0, 1, 2, 13, 14]   # copyright, family, subfamily, license text, license URL


def collect_chars(s, extra=''):
    """Every code point the page text can show, as a set. Plain ASCII and ALWAYS are included."""
    need = set(range(0x20, 0x7f)) | {ord(c) for c in s if ord(c) > 127} | {ord(c) for c in extra}
    # JavaScript: a surrogate pair written as two escapes is ONE character (\uD83D\uDE00 is U+1F600)
    def pair(m):
        hi, lo = int(m.group(1), 16), int(m.group(2), 16)
        need.add(0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00))
        return ' '
    rest = re.sub(r'\\u([dD][89abAB][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})', pair, s)
    need |= {int(m, 16) for m in re.findall(r'\\u([0-9a-fA-F]{4})', rest)}
    need |= {int(m, 16) for m in re.findall(r'\\u\{([0-9a-fA-F]{1,6})\}', rest)}
    need |= {int(m, 16) for m in re.findall(r'\\x([0-9a-fA-F]{2})', rest)}
    # CSS: content:"\2605" and friends, one to six hex digits (a following space belongs to the escape). A few JavaScript escapes
    # such as \d or \b look the same; they give control characters, which are dropped below, so the worst case is one extra glyph.
    need |= {int(m, 16) for m in re.findall(r'\\([0-9a-fA-F]{1,6})', rest)}
    for e in set(re.findall(r'&#?\w+;', s)):
        need |= {ord(c) for c in html.unescape(e)}
    need |= ALWAYS
    return {u for u in need if (0x20 <= u <= 0x10FFFF) and not (0x7f <= u <= 0x9f) and not (0xD800 <= u <= 0xDFFF)}


def font_notice(f):
    """(family, copyright, license text, license URL) from the font's name table; empty strings when missing."""
    n = f['name']
    def get(i):
        v = n.getDebugName(i)
        return re.sub(r'\s+', ' ', v).strip() if v else ''
    return get(1), get(0), get(13), get(14)


def is_ofl(*texts):
    t = ' '.join(texts).lower()
    return 'open font license' in t or 'scripts.sil.org/ofl' in t or 'openfontlicense' in t or re.search(r'\bofl\b', t) is not None


def reserved_name(copyright_text):
    m = re.search(r'reserved font names?\s+["\u201c\']?([^"\u201d\',.;)]+)', copyright_text, re.I)
    return m.group(1).strip() if m else ''


def comment_safe(t):
    return t.replace('*/', '* /').replace('<', '(').replace('>', ')')[:700]


def optimize(s, extra='', features=None, fmt='woff2', warn=None, rep=None):
    """Returns (new_html, bytes_before, bytes_after). warn(text) is called for license warnings; rep.append(text) gets report lines."""
    from fontTools.ttLib import TTFont
    from fontTools.subset import Subsetter, Options
    features = features or []
    need = collect_chars(s, extra)
    totals = [0, 0]
    warn = warn or (lambda t: None)
    rep = rep if rep is not None else []

    def sub(m):
        body = m.group(1)
        fam = re.search(r"font-family:\s*'([^']+)'", body)
        b64 = re.search(r'base64,([A-Za-z0-9+/=]+)', m.group(0))
        if not fam or not b64:
            return m.group(0)
        raw = base64.b64decode(b64.group(1))
        f = TTFont(io.BytesIO(raw), recalcTimestamp=False)
        family, copyright_text, license_text, license_url = font_notice(f)
        cm = f.getBestCmap()
        keep = sorted(u for u in need if u in cm)
        o = Options(); o.flavor = fmt; o.layout_features = features; o.notdef_outline = True
        o.name_IDs = NAME_IDS; o.hinting = False; o.glyph_names = False; o.legacy_kern = True; o.drop_tables += ['DSIG']
        sb = Subsetter(o); sb.populate(unicodes=keep); sb.subset(f)
        out = io.BytesIO(); f.flavor = fmt; f.save(out); nb = out.getvalue()
        totals[0] += len(raw); totals[1] += len(nb)
        rep.append('%s: %d -> %d bytes, %d characters kept (of %d in the font)' % (fam.group(1), len(raw), len(nb), len(keep), len(cm)))
        new_rule = m.group(0).replace(b64.group(1), base64.b64encode(nb).decode())
        if not (copyright_text or license_text or license_url):
            warn("WARNING: font '%s' has no copyright or license text in its name table. Check its license yourself and credit it in your page." % fam.group(1))
            return new_rule
        if is_ofl(copyright_text, license_text, license_url):
            r = reserved_name(copyright_text)
            warn("WARNING: font '%s' is under the SIL Open Font License. Subsetting is a modification: the copyright notice and license text were kept "
                 "(in the font and in a comment in the page); keep them in what you ship, and include the license text with your game." % fam.group(1)
                 + (" It declares a Reserved Font Name (%s): a modified copy may not use that name, so give the font another name in your CSS and files." % r if r else ''))
        notice = comment_safe(('Font: %s. %s %s %s' % (family or fam.group(1), copyright_text, license_text, license_url)).strip())
        return '/*! ' + notice + ' */\n' + new_rule

    s2 = re.sub(r'@font-face\s*\{(.*?)\}', sub, s, flags=re.S)
    return s2, totals[0], totals[1]


def main(argv=None):
    ap = argparse.ArgumentParser(description='Cut every base64 font in an HTML file down to the characters it can show.')
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--report', action='store_true')
    ap.add_argument('--features', default='ccmp,locl,mark,mkmk,kern,liga,clig,calt,rlig,rclt,rvrn,curs,tnum')
    ap.add_argument('--extra', default='')
    ap.add_argument('--format', default='woff2', choices=['woff2', 'woff'], help='woff2 needs the brotli module; woff does not')
    a = ap.parse_args(argv)
    try:
        import fontTools  # noqa: F401
    except ImportError:
        raise SystemExit('optfonts.py needs fontTools: pip install fonttools brotli')
    if a.format == 'woff2':
        try:
            import brotli  # noqa: F401
        except ImportError:
            raise SystemExit('woff2 output needs the brotli module: pip install brotli (or use --format woff)')
    features = [f for f in a.features.split(',') if f]
    s = open(a.src, encoding='utf-8').read()
    rep = []
    s2, before, after = optimize(s, a.extra, features, a.format, lambda t: print(t, file=sys.stderr), rep)
    open(a.dst, 'w', encoding='utf-8').write(s2)
    print('fonts: %d -> %d bytes of font data (file %d -> %d)' % (before, after, len(s), len(s2)))
    if a.report:
        print('\n'.join(rep))


if __name__ == '__main__':
    main()
