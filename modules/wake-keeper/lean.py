#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Makes a smaller wake-keeper by cutting out the parts a game does not use. Version 1.1.0 (API 1)

  python3 modules/wake-keeper/lean.py --list                                  the parts that can be cut, and what each one is
  python3 modules/wake-keeper/lean.py --without idle,status,callbacks,inject -o out.js     write a copy without those parts
  python3 modules/wake-keeper/lean.py --without idle,status,callbacks,inject --no-comments --sizes -o out.js
                                                                               also drop every comment, and print the size of the result

wake-keeper.js carries marker lines: "//@begin NAME" ... "//@end" wrap the code of one part, and an optional "//@else" inside it starts code (written
as "//@ code") that replaces the part when it is cut. This script copies the file and leaves the marked parts out. It changes nothing else, so a part you keep behaves exactly as in the full file; a method you cut is simply missing. Cutting `idle` also cuts poke() and watchInput(), which only restart the idle timer.
Needs only Python 3 (--sizes also shows the minified size when a `terser` program is on the PATH)."""
import argparse, gzip, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PARTS = {
    'idle': 'release the lock after idleMs without input (60 s by default), and poke() and watchInput() that restart it; cut, the lock is held for as long as want(true) stands',
    'status': 'keeper.held and keeper.refusals',
    'callbacks': 'the onChange and onRefused options',
    'inject': 'the nav, doc and now options (fakes for tests); cut, the page\'s own navigator, document and clock are used',
}
NEEDS = {}   # no part needs another


def close(without):
    return set(without)


def lean(src, without):
    out, stack = [], []   # stack of [name, branch]: branch is 'main' or 'else'; parts may sit inside other parts
    for line in src.split('\n'):
        t = line.strip()
        m = re.match(r'^//@begin (\w+)$', t)
        if m:
            if m.group(1) not in PARTS: raise SystemExit('unknown part in the source file: ' + m.group(1))
            stack.append([m.group(1), 'main']); continue
        if t == '//@else' and stack and stack[-1][1] == 'main':
            stack[-1][1] = 'else'; continue
        if t == '//@end' and stack:
            stack.pop(); continue
        if all((br == 'main') != (nm in without) for nm, br in stack):   # a part kept: its main branch; a part cut: its else branch
            if stack and stack[-1][1] == 'else': line = re.sub(r'^(\s*)//@ ?', r'\1', line, count=1)
            out.append(line)
    if stack: raise SystemExit('//@begin without //@end')
    return '\n'.join(out)


def strip_comments(text):
    """Removes block and line comments. Understands '...', "..." and `...` strings; the source has no regular-expression literals."""
    out, i, n, q = [], 0, len(text), None
    while i < n:
        c = text[i]
        if q:
            out.append(c)
            if c == '\\' and i + 1 < n: out.append(text[i + 1]); i += 1
            elif c == q: q = None
            i += 1
        elif c in '\'"`': q = c; out.append(c); i += 1
        elif text.startswith('/*', i):
            j = text.find('*/', i + 2)
            if j < 0: raise SystemExit('a comment is never closed')
            i = j + 2
        elif text.startswith('//', i):
            j = text.find('\n', i)
            i = n if j < 0 else j
        else: out.append(c); i += 1
    lines = [l.rstrip() for l in ''.join(out).split('\n')]
    return '\n'.join(l for l in lines if l.strip()) + '\n'


def version_of(src):
    m = re.search(r'Version (\d+\.\d+\.\d+) \(API (\d+)\)', src)
    return (m.group(1), m.group(2)) if m else ('?', '?')


def build(src, without, no_comments=False, name='wake-keeper'):
    without = close(without)
    text = lean(src, without)
    ver, api = version_of(src)
    note = 'LEAN BUILD without: ' + (', '.join(sorted(without)) or 'nothing') + '. Made by modules/wake-keeper/lean.py; the cut parts are missing on purpose.'
    if no_comments:
        text = strip_comments(text)
        text = '/* %s %s (API %s), %s MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/lfcfoundry/JS-modules */\n' % (name, ver, api, note) + text
    elif without:
        text = re.sub(r'(\n[^\n]*Version [^\n]*\n)', lambda m: m.group(1) + ' * ' + note + '\n', text, count=1)
    return text, without


def sizes(text):
    raw = text.encode('utf-8')
    res = ['%d bytes' % len(raw), '%d gzipped' % len(gzip.compress(raw, 9, mtime=0))]
    ter = shutil.which('terser')
    if ter:
        r = subprocess.run([ter, '-c', 'passes=2', '-m', '--comments', 'false'], input=raw, capture_output=True)
        if r.returncode == 0: res += ['%d minified' % len(r.stdout), '%d minified and gzipped' % len(gzip.compress(r.stdout, 9, mtime=0))]
    return ', '.join(res)


def main():
    ap = argparse.ArgumentParser(description='Make a smaller wake-keeper without the parts a game does not use.')
    ap.add_argument('--list', action='store_true'); ap.add_argument('--without', default=''); ap.add_argument('-o', '--output', default='')
    ap.add_argument('--no-comments', action='store_true', help='drop every comment (a one-line header with the version stays)')
    ap.add_argument('--sizes', action='store_true', help='print the size of the result: bytes, gzipped, and minified when terser is installed')
    ap.add_argument('--input', default=os.path.join(HERE, 'wake-keeper.js'))
    a = ap.parse_args()
    src_path, name = a.input, 'wake-keeper'
    if a.list:
        for k, v in PARTS.items(): print('%-12s %s' % (k, v))
        return
    asked = set(x for x in a.without.split(',') if x)
    bad = asked - set(PARTS)
    if bad: raise SystemExit('unknown part(s): ' + ', '.join(sorted(bad)) + '. Run with --list.')
    text, without = build(open(src_path, encoding='utf-8').read(), asked, a.no_comments, name)
    path = a.output or os.path.join(HERE, 'wake-keeper-lean.js')
    open(path, 'w', encoding='utf-8').write(text)
    print('wrote %s (%s, without: %s)' % (path, sizes(text) if a.sizes else '%d bytes' % len(text.encode('utf-8')), ', '.join(sorted(without)) or 'nothing'))


if __name__ == '__main__':
    main()
