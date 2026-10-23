#!/usr/bin/env python3
"""speed-guard checks. Copyright (c) 2026 LFC Foundry. MIT License."""
import importlib.util, os, subprocess, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('sg', os.path.join(here, '..', 'speed-guard.py')); sg = importlib.util.module_from_spec(spec); spec.loader.exec_module(sg)
fails = 0
def check(name, ok):
    global fails
    print(('  ok   ' if ok else '  FAIL ') + name)
    fails += 0 if ok else 1
def row(rel, test, browser, value, unit='ms', better='lower'):
    return {'product': 'p', 'release': rel, 'date': '2026-10-22', 'test': test, 'browser': browser, 'value': value, 'unit': unit, 'better': better}
rows = [row('r1', 'open', 'a', 10), row('r2', 'open', 'a', 12), row('r1', 'open', 'b', 10), row('r2', 'open', 'b', 8),
        row('r1', 'fps', 'a', 60, 'FPS', 'higher'), row('r2', 'fps', 'a', 50, 'FPS', 'higher'), row('r1', 'tiny', 'a', 1), row('r2', 'tiny', 'a', 2),
        row('r1', 'only', 'a', 5)]
res = {(r['test'], r['browser']): r for r in sg.compare(rows)}
check('10 to 12 ms is 20% worse, lower is better: SLOWER', res[('open', 'a')]['verdict'] == 'SLOWER')
check('10 to 8 ms is faster', res[('open', 'b')]['verdict'] == 'faster')
check('60 to 50 FPS is worse when higher is better: SLOWER', res[('fps', 'a')]['verdict'] == 'SLOWER')
check('1 to 2 ms is a tie (within the 1 ms floor, whole-millisecond timers)', res[('tiny', 'a')]['verdict'] == 'tie')
check('a step with one release is not compared', ('only', 'a') not in res)
check('4% worse stays level at the default 5% limit', sg.compare([row('r1', 't', 'a', 100), row('r2', 't', 'a', 104)])[0]['verdict'] == 'level')
check('an accepted slowdown is matched by release and test text', sg.accepted(res[('open', 'a')], ['r2\topen\tthe owner said fine\n']) and not sg.accepted(res[('open', 'a')], ['r9\topen\n']))
with tempfile.TemporaryDirectory() as d:
    open(os.path.join(d, 'p.tsv'), 'w').write('product\trelease\tdate\ttest\tbrowser\tvalue\tunit\tbetter\tnote\n' + ''.join('p\t%s\td\topen\ta\t%s\tms\tlower\tn\n' % (r, v) for r, v in (('r1', 10), ('r2', 12))))
    p = subprocess.run([sys.executable, os.path.join(here, '..', 'speed-guard.py'), '--history', d], capture_output=True, text=True)
    check('the command exits 1 and prints SLOWER for a slower release', p.returncode == 1 and 'SLOWER' in p.stdout)
    open(os.path.join(d, 'ok.txt'), 'w').write('r2\topen\n')
    p = subprocess.run([sys.executable, os.path.join(here, '..', 'speed-guard.py'), '--history', d, '--ok', os.path.join(d, 'ok.txt')], capture_output=True, text=True)
    check('with the slowdown accepted it exits 0', p.returncode == 0 and 'OK (accepted)' in p.stdout)
print('speed-guard: %s' % ('all checks passed' if not fails else '%d failed' % fails))
sys.exit(1 if fails else 0)
