#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License. Part of JS-modules, https://github.com/lfcfoundry/JS-modules
"""Keeps a delivered HTML file Latin-1 only (every character at most U+00FF), without changing what it does or shows.

Why: browsers store text at 1 byte per character only when every character fits in Latin-1. One emoji, arrow or curly quote
anywhere in a script or in the page makes the browser keep the whole text at 2 bytes per character. In Chromium, Netflow Map's
renderer used 9% less memory once its file was Latin-1, and Apple Press started in 0.66 to 0.89 of the time in WebKitGTK.

What it writes instead (each means exactly the same character):
  inside <script> (JavaScript or JSON)   \\uXXXX (a pair of them above U+FFFF)
  inside <style>                         \\XXXX followed by a space (a CSS escape)
  everywhere else (markup, attributes, comments, <title>, <textarea>)   &#xXXXX;
Scripts of other types (text/plain, templates and the like) are data that the page reads as it is, so an escape would change
it: they are left alone and reported; the check then fails until the page's own build handles them.

  python3 latin1.py in.html out.html        write the Latin-1 copy (in and out may be the same file)
  python3 latin1.py --check a.html b.html   exit 1 and list every character above U+00FF (line, column, character)
From Python: import latin1; text, counts, left = latin1.escape_html(text); latin1.check(text) -> [(line, column, char), ...]
"""
import re, sys

JS_TYPES = {'', 'text/javascript', 'application/javascript', 'module', 'application/json', 'importmap', 'application/ld+json',
            'text/ecmascript', 'application/ecmascript', 'speculationrules'}
BLOCK = re.compile(r'(<script\b[^>]*>.*?</script\s*>|<style\b[^>]*>.*?</style\s*>)', re.S | re.I)
OPEN = re.compile(r'(<(script|style)\b[^>]*>)(.*?)(</\2\s*>)$', re.S | re.I)
TYPE = re.compile(r'''\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))''', re.I)


def _js(ch):
    o = ord(ch)
    if o <= 0xFFFF:
        return '\\u%04x' % o
    o -= 0x10000
    return '\\u%04x\\u%04x' % (0xD800 + (o >> 10), 0xDC00 + (o & 0x3FF))


def _sub(text, kind, counts):
    if all(ord(c) < 256 for c in text):
        return text
    out = []
    for ch in text:
        if ord(ch) > 255:
            counts[kind] += 1
            out.append(_js(ch) if kind == 'script' else ('\\%x ' % ord(ch)) if kind == 'style' else '&#x%x;' % ord(ch))
        else:
            out.append(ch)
    return ''.join(out)


def escape_html(text):
    """Returns (latin-1 text, {'script': n, 'style': n, 'markup': n}, [types of script blocks left alone])."""
    counts = {'script': 0, 'style': 0, 'markup': 0}
    left = []
    res = []
    for part in BLOCK.split(text):
        m = OPEN.match(part)
        if not m:
            res.append(_sub(part, 'markup', counts))
            continue
        tag, kind, body, close = m.group(1), m.group(2).lower(), m.group(3), m.group(4)
        if kind == 'script':
            t = TYPE.search(tag)
            typ = (t.group(1) or t.group(2) or t.group(3) or '').strip().lower() if t else ''
            if typ not in JS_TYPES:
                if any(ord(c) > 255 for c in body):
                    left.append(typ)
                res.append(_sub(tag, 'markup', counts) + body + close)
                continue
        res.append(_sub(tag, 'markup', counts) + _sub(body, kind, counts) + close)
    return ''.join(res), counts, left


def check(text):
    """Every character above U+00FF as (line, column, character), both counted from 1."""
    bad = []
    for ln, line in enumerate(text.split('\n'), 1):
        for col, ch in enumerate(line, 1):
            if ord(ch) > 255:
                bad.append((ln, col, ch))
    return bad


def main(argv):
    if len(argv) >= 2 and argv[1] == '--check':
        fails = 0
        for p in argv[2:]:
            bad = check(open(p, encoding='utf-8').read())
            if bad:
                fails += 1
                print('%s: %d character(s) above U+00FF, the browser keeps this page at 2 bytes per character' % (p, len(bad)))
                for ln, col, ch in bad[:20]:
                    print('  line %d, column %d: U+%04X' % (ln, col, ord(ch)))
            else:
                print('%s: Latin-1 only' % p)
        return 1 if fails else 0
    if len(argv) != 3:
        print(__doc__)
        return 2
    text, counts, left = escape_html(open(argv[1], encoding='utf-8').read())
    open(argv[2], 'w', encoding='utf-8', newline='').write(text)
    print('%s: escaped %d in scripts, %d in styles, %d in markup%s' % (argv[2], counts['script'], counts['style'], counts['markup'],
          ('; left alone in script blocks of type ' + ', '.join(left) + ' (data the page reads as it is)') if left else ''))
    return 1 if left else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
