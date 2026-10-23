#!/usr/bin/env python3
"""speed-guard: one command that says whether a release got slower.  Copyright (c) 2026 LFC Foundry. MIT License.

  python3 tools/speed-guard/speed-guard.py [--history DIR] [--product js-modules] [--limit 5] [--floor 1] [--ok FILE]
      Reads the speed-history files (one <product>.tsv per product: product, release, date, test, browser, value, unit, better, note), takes the
      newest release of every (test, browser) and the release before it, and marks any step that got more than --limit percent worse as SLOWER
      (direction-aware: "lower" means a bigger number is worse). It runs nothing, so it costs no browser time. Exit 1 when something is SLOWER.
      A step whose two values differ by --floor ms or less is a tie: Firefox and WebKit read whole milliseconds. Releases are put in time order
      by date and stamp, not by their place in the file. Read the note of a SLOWER row: a row timed in a separate run is not a fair comparison.
      --ok FILE lists slowdowns the owner accepted, one per line:  release <TAB> part of the test text.  Those show as OK (accepted).
  python3 tools/speed-guard/speed-guard.py --plan [BASE]
      Prints the browser checks the changed files affect (the same picker as tests/kits.js --changed) and the command that runs only those.
      Run them, add the new rows to the speed history, then run the guard above.
"""
import os, re, subprocess, sys

STAMP = re.compile(r'^\d{4}\.\d\d\.\d\d\.\d{4}$')

def args_value(argv, name, default=None):
    if name in argv:
        i = argv.index(name)
        if i + 1 < len(argv) and not argv[i + 1].startswith('--'):
            return argv[i + 1]
    return default

def read_rows(folder, product=None):
    rows = []
    for name in sorted(os.listdir(folder)):
        if not name.endswith('.tsv') or (product and name != product + '.tsv'):
            continue
        with open(os.path.join(folder, name), encoding='utf8') as f:
            for n, line in enumerate(f):
                p = line.rstrip('\n').split('\t')
                if n == 0 and p[:1] == ['product']:
                    continue
                if len(p) < 8:
                    continue
                try:
                    value = float(p[5])
                except ValueError:
                    continue
                rows.append({'product': p[0], 'release': p[1], 'date': p[2], 'test': p[3], 'browser': p[4], 'value': value, 'unit': p[6], 'better': p[7], 'note': p[8] if len(p) > 8 else ''})
    return rows

def compare(rows, limit=5.0, floor=1.0):
    """One result per (product, test, browser) that has two releases: the newest against the one before it."""
    series = {}
    for r in rows:
        series.setdefault((r['product'], r['test'], r['browser']), []).append(r)
    out = []
    for key, s in sorted(series.items()):
        first = {}
        for i, r in enumerate(s):
            first.setdefault(r['release'], (r['date'], r['release'] if STAMP.match(r['release']) else '', i))
        releases = sorted(first, key=lambda k: first[k])    # oldest first: by date, then by the YYYY.MM.DD.HHMM stamp, then by where it first appears (files are not always in time order)
        if len(releases) < 2:
            continue
        new_rel, old_rel = releases[-1], releases[-2]
        new = [r for r in s if r['release'] == new_rel][-1]
        old = [r for r in s if r['release'] == old_rel][-1]
        change = (new['value'] - old['value']) / old['value'] * 100 if old['value'] else (0 if new['value'] == 0 else float('inf'))
        worse = change if new['better'] == 'lower' else -change
        tie = new['unit'] == 'ms' and abs(new['value'] - old['value']) <= floor
        verdict = 'tie' if tie else 'SLOWER' if worse > limit else 'faster' if worse < -limit else 'level'
        out.append({'product': key[0], 'test': key[1], 'browser': key[2], 'old_release': old_rel, 'new_release': new_rel, 'old': old['value'],
                    'new': new['value'], 'unit': new['unit'], 'better': new['better'], 'change': change, 'verdict': verdict, 'note': new.get('note', '')})
    return out

def accepted(res, ok_lines):
    for line in ok_lines:
        p = line.rstrip('\n').split('\t')
        if len(p) >= 2 and p[0] == res['new_release'] and p[1] and p[1] in res['test']:
            return True
    return False

def table(results):
    head = ['release', 'test', 'browser', 'old', 'new', 'change', 'better', 'verdict', 'note of the new row']
    lines = [head]
    for r in results:
        lines.append([r['new_release'], r['test'][:70], r['browser'], '%g' % r['old'], '%g %s' % (r['new'], r['unit']), '%+.1f%%' % r['change'], r['better'] + ' is better', r['verdict'], r['note'][:80]])
    w = [max(len(l[i]) for l in lines) for i in range(len(head))]
    return '\n'.join('  '.join(c.ljust(w[i]) for i, c in enumerate(l)) for l in lines)

def plan(root, base):
    kits = os.path.join(root, 'tests', 'kits.js')
    lst = subprocess.run(['node', kits, '--list'], cwd=root, capture_output=True, text=True).stdout.split('\n')
    steps, cur = [], None
    for line in lst:
        m = re.match(r'^(browser )?\s*(\S.*?)(\s+\[always\])?$', line)
        if line.strip().startswith('watches:') and cur:
            cur['watch'] = line.split('watches:')[1].split()
        elif line and not line.startswith(' ' * 10) and m:
            cur = {'browser': bool(m.group(1)), 'name': m.group(2).strip(), 'watch': []}
            steps.append(cur)
    base = base or 'origin/main'
    files = set()
    for a in (['diff', '--name-only', base + '...HEAD'], ['diff', '--name-only'], ['diff', '--name-only', '--cached']):
        files.update(subprocess.run(['git'] + a, cwd=root, capture_output=True, text=True).stdout.split())
    hit = [s for s in steps if s['browser'] and any((f.startswith(w) if w.endswith('/') else f == w) for f in files for w in s['watch'])]
    return sorted(files), [s['name'] for s in hit]

def main(argv):
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    if '--plan' in argv:
        files, names = plan(root, args_value(argv, '--plan'))
        print('%d changed file(s); %d browser check(s) affected:' % (len(files), len(names)))
        for n in names:
            print('  ' + n)
        if names:
            print('run only those:  node tests/kits.js --only "^(%s)$"' % '|'.join(re.escape(n) for n in names))
        return 0
    folder = args_value(argv, '--history', os.environ.get('SPEED_HISTORY', '/mnt/project-files/speed-history'))
    ok_file = args_value(argv, '--ok')
    ok_lines = open(ok_file, encoding='utf8').readlines() if ok_file and os.path.exists(ok_file) else []
    results = compare(read_rows(folder, args_value(argv, '--product')), float(args_value(argv, '--limit', '5')), float(args_value(argv, '--floor', '1')))
    for r in results:
        if r['verdict'] == 'SLOWER' and accepted(r, ok_lines):
            r['verdict'] = 'OK (accepted)'
    shown = [r for r in results if r['verdict'] not in ('level', 'tie', 'faster')] or []
    print('speed-guard: %d step(s) compared with the release before; %d faster, %d level or tie, %d SLOWER, %d accepted'
          % (len(results), sum(r['verdict'] == 'faster' for r in results), sum(r['verdict'] in ('level', 'tie') for r in results),
             sum(r['verdict'] == 'SLOWER' for r in results), sum(r['verdict'].startswith('OK') for r in results)))
    if shown:
        print(table(shown))
    return 1 if any(r['verdict'] == 'SLOWER' for r in results) else 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
