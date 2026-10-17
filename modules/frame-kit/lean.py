#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Makes a smaller frame-kit by cutting out the parts a game does not use. Version 1.2.0 (API 1)

  python3 modules/frame-kit/lean.py --list                                  the parts that can be cut, and what each one is
  python3 modules/frame-kit/lean.py --without options,stats,refreshRule --file even-dt -o out.js     write a copy without those parts
  python3 modules/frame-kit/lean.py --without options,stats,refreshRule --file even-dt --no-comments --sizes -o out.js
                                                                               also drop every comment, and print the size of the result

even-dt.js or quality-governor.js carries marker lines: "//@begin NAME" ... "//@end" wrap the code of one part, and an optional "//@else" inside it starts code (written
as "//@ code") that replaces the part when it is cut. This script copies the file and leaves the marked parts out. Each of the two files is cut on its own with --file. A part you keep behaves exactly as in the full file; the three parts marked CUT in --list change one rule on purpose, to the rule Fancy Banana's own code uses.
Needs only Python 3 (--sizes also shows the minified size when a `terser` program is on the PATH)."""
import argparse, gzip, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = {
    'even-dt': ('even-dt.js', {
        'options': 'the options object (minGap, maxGap, window, warmup, refreshEvery, maxMultiple, tolerance, payback); cut, the defaults are fixed in the code',
        'stats': 'ev.period, ev.drift and ev.reset()',
        'refreshRule': 'how often the median period is taken again. Full file: every 8th frame. CUT: every frame once the 40-frame window is full (when the window length is a multiple of 8), which is what Fancy Banana\'s own code does',
    }),
    'quality-governor': ('quality-governor.js', {
        'options': 'every option except onChange (levels, thresholds, smoothing, delays, expectedPeriod, level); cut, the defaults are fixed: 5 levels, 22 ms and 18.5 ms, smoothing 0.06, 100 slow frames, 3 s and 10 s delays',
        'control': 'enabled, stepUp, lock(), unlock(), hold(), force()',
        'errors': 'the guard around onChange (onError, lastError); cut, an error thrown by onChange reaches the code that called frame()',
        'flipGuard': 'the flip-flop guard (flipLimit, flipWindow, flips, gaveUp, resetGuard())',
        'stats': 'gov.average',
        'stallRules': 'how long gaps are treated. Full file: a gap over maxGap, or a jump of the clock, ends both streaks, and 4 long gaps in a row count as a slow device. CUT: a gap over maxGap only ends the slow streak and is never measured, which is what Fancy Banana\'s own code does',
        'graceStart': 'the 3 s start-up grace counts from the first frame. CUT: it counts from time 0 of the clock you pass in, which is what Fancy Banana\'s own code does',
    }),
}
PARTS = {}
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


def build(src, without, no_comments=False, name='frame-kit'):
    without = close(without)
    text = lean(src, without)
    ver, api = version_of(src)
    note = 'LEAN BUILD without: ' + (', '.join(sorted(without)) or 'nothing') + '. Made by modules/frame-kit/lean.py; the cut parts are missing on purpose.'
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
    ap = argparse.ArgumentParser(description='Make a smaller frame-kit without the parts a game does not use.')
    ap.add_argument('--list', action='store_true'); ap.add_argument('--without', default=''); ap.add_argument('-o', '--output', default='')
    ap.add_argument('--no-comments', action='store_true', help='drop every comment (a one-line header with the version stays)')
    ap.add_argument('--sizes', action='store_true', help='print the size of the result: bytes, gzipped, and minified when terser is installed')
    ap.add_argument('--file', choices=sorted(FILES), required=True, help='which frame-kit file to cut')
    ap.add_argument('--input', default='')
    a = ap.parse_args()
    fname, FP = FILES[a.file]
    PARTS.update(FP)
    src_path, name = a.input or os.path.join(HERE, fname), a.file
    if a.list:
        for k, v in PARTS.items(): print('%-12s %s' % (k, v))
        return
    asked = set(x for x in a.without.split(',') if x)
    bad = asked - set(PARTS)
    if bad: raise SystemExit('unknown part(s): ' + ', '.join(sorted(bad)) + '. Run with --list.')
    text, without = build(open(src_path, encoding='utf-8').read(), asked, a.no_comments, name)
    path = a.output or os.path.join(HERE, a.file + '-lean.js')
    open(path, 'w', encoding='utf-8').write(text)
    print('wrote %s (%s, without: %s)' % (path, sizes(text) if a.sizes else '%d bytes' % len(text.encode('utf-8')), ', '.join(sorted(without)) or 'nothing'))


if __name__ == '__main__':
    main()
