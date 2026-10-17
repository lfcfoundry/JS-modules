#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""Makes a smaller save-kit by cutting out the parts a game does not use. Version 1.2.1 (API 1)

  python3 modules/save-kit/lean.py --list                              the parts that can be cut, and what each one is
  python3 modules/save-kit/lean.py --without autosave,twoTap,persist   write save-kit-lean.js next to save-kit.js without those parts
  python3 modules/save-kit/lean.py --without raw,compact -o out.js     choose the output file

save-kit.js carries marker lines: "//@begin NAME" ... "//@end" wrap the code of one part, and an optional "//@else" inside it starts code (written as
"//@ code") that replaces the part when it is cut. This script copies the file and leaves the marked parts out. It changes nothing else, so
a part you keep behaves exactly as in the full file; a method you cut is simply missing. Minify the result with your own minifier as usual.
Needs only Python 3."""
import argparse, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PARTS = {
    'autosave': 'kit.autosave(): timer, pagehide and visibilitychange saving',
    'twoTap': 'SaveKit.twoTap(): the "tap again to confirm" button helper',
    'persist': 'kit.persist(): ask the browser not to clear this site\'s storage',
    'onOtherTab': 'kit.onOtherTab(): hear a save written by another tab',
    'stageImport': 'kit.stageImport(): park an imported save for the next page load',
    'migrate': 'options version + migrate: upgrade old saves and codes',
    'skipUnchanged': 'option skipUnchangedMs: skip writing a save nothing changed in',
    'compact': 'option compactCodes: shorter codes',
    'nativeBase64': 'use of the browser\'s own Uint8Array.toBase64/fromBase64 when it has them (the plain loops stay; about 220 bytes smaller)',
    'streamLimit': 'the unpacker that stops a hostile code as soon as it passes the size limit; cut, a simpler unpacker checks the size after unpacking it all',
    'raw': 'schema type raw (and the deep copy that goes with it)',
    'codes': 'exportCode(), importCode() and everything only they use (base64, deflate, checksums, limits)',
}


def lean(src, without):
    out, stack = [], []   # stack of [name, branch]: branch is 'main' or 'else'; parts may sit inside other parts
    for line in src.split('\n'):
        t = line.strip()
        m = re.match(r'^//@begin (\w+)$', t)
        if m:
            if m.group(1) not in PARTS: raise SystemExit('unknown part in save-kit.js: ' + m.group(1))
            stack.append([m.group(1), 'main']); continue
        if t == '//@else' and stack and stack[-1][1] == 'main':
            stack[-1][1] = 'else'; continue
        if t == '//@end' and stack:
            stack.pop(); continue
        if all((br == 'main') != (nm in without) for nm, br in stack):   # a part kept: its main branch; a part cut: its else branch
            if stack and stack[-1][1] == 'else': line = re.sub(r'^(\s*)//@ ?', r'\1', line, count=1)
            out.append(line)
    if stack: raise SystemExit('//@begin without //@end')
    text = '\n'.join(out)
    if without:
        text = re.sub(r'( \* Version [^\n]*\n)', lambda m: m.group(1) + ' * LEAN BUILD without: ' + ', '.join(sorted(without)) + '. Made by modules/save-kit/lean.py; the cut parts are missing on purpose.\n', text, count=1)
    return text


def main():
    ap = argparse.ArgumentParser(description='Make a smaller save-kit without the parts a game does not use.')
    ap.add_argument('--list', action='store_true'); ap.add_argument('--without', default=''); ap.add_argument('-o', '--output', default='')
    ap.add_argument('--input', default=os.path.join(HERE, 'save-kit.js'))
    a = ap.parse_args()
    if a.list:
        for k, v in PARTS.items(): print('%-14s %s' % (k, v))
        return
    without = set(x for x in a.without.split(',') if x)
    bad = without - set(PARTS)
    if bad: raise SystemExit('unknown part(s): ' + ', '.join(sorted(bad)) + '. Run with --list.')
    text = lean(open(a.input, encoding='utf-8').read(), without)
    path = a.output or os.path.join(HERE, 'save-kit-lean.js')
    open(path, 'w', encoding='utf-8').write(text)
    print('wrote %s (%d bytes, without: %s)' % (path, len(text.encode('utf-8')), ', '.join(sorted(without)) or 'nothing'))


if __name__ == '__main__':
    main()
