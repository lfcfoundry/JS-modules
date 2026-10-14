#!/usr/bin/env python3
"""storage-probe browser test. Run: python3 tools/storage-probe/test/run.py [firefox|chromium]

Opens the probe from two different folders (file://) in one browser profile and checks what it reports. The expected answer on desktop
Firefox and Chromium (measured 2026-10-14) is "shared". Set FIREFOX_PATH for Firefox. Exits 1 if any check fails.
"""
import os, shutil, sys, tempfile
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'storage-probe.html')
fails, count = [], 0


def check(name, cond, detail=''):
    global count
    count += 1
    if not cond:
        fails.append(name)
        print('  FAIL', name, detail)


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else 'chromium'
    tmp = tempfile.mkdtemp(prefix='probe-')
    a, b = os.path.join(tmp, 'one'), os.path.join(tmp, 'two')
    os.makedirs(a); os.makedirs(b)
    shutil.copy(SRC, os.path.join(a, 'probe.html')); shutil.copy(SRC, os.path.join(b, 'probe-copy.html'))
    with sync_playwright() as p:
        try:
            br = p.firefox.launch(headless=True, executable_path=os.environ.get('FIREFOX_PATH')) if which == 'firefox' else p.chromium.launch(headless=True)
        except Exception as e:
            # Playwright's Firefox driver needs its own patched Firefox build; a stock Firefox exits at once.
            print('storage-probe (%s): SKIPPED, the browser would not start (%s)' % (which, str(e).splitlines()[0]))
            sys.exit(0)
        ctx = br.new_context()
        p1 = ctx.new_page(); p1.goto('file://' + os.path.join(a, 'probe.html'))
        p1.click('#go'); p1.wait_for_timeout(600)
        check('first copy: says nothing seen from other files yet', 'Nothing seen from other files yet' in p1.inner_text('#verdict'), p1.inner_text('#verdict'))
        check('first copy: gets the lock', 'now holds the lock' in p1.inner_text('#facts'), p1.inner_text('#facts'))
        p2 = ctx.new_page(); p2.goto('file://' + os.path.join(b, 'probe-copy.html'))
        p2.click('#go'); p2.wait_for_timeout(800)
        v2 = p2.inner_text('#verdict')
        check('second copy (other folder): reports shared storage', v2.startswith('Shared'), v2)
        check('second copy: sees the lock is taken by the first', 'holds the lock' in p2.inner_text('#facts') and 'another copy is open' in p2.inner_text('#facts'), p2.inner_text('#facts'))
        p1.wait_for_timeout(500)
        check('first copy: told live that another copy wrote', 'another copy wrote' in p1.inner_text('#facts'), p1.inner_text('#facts'))
        check('a report is offered and names the verdict', 'shared' in p2.inner_text('#report') and p2.is_visible('#copy'), p2.inner_text('#report')[:200])
        # a fresh profile sees nothing
        ctx2 = br.new_context(); p3 = ctx2.new_page(); p3.goto('file://' + os.path.join(b, 'probe-copy.html')); p3.click('#go'); p3.wait_for_timeout(500)
        check('a different browser profile sees nothing', 'Nothing seen from other files yet' in p3.inner_text('#verdict'), p3.inner_text('#verdict'))
        # blocked storage
        ctx3 = br.new_context(); ctx3.add_init_script("Storage.prototype.setItem = function () { throw new DOMException('blocked', 'SecurityError'); };")
        p4 = ctx3.new_page(); p4.goto('file://' + os.path.join(a, 'probe.html')); p4.click('#go'); p4.wait_for_timeout(400)
        check('blocked storage is explained', 'would not let the page save' in p4.inner_text('#verdict'), p4.inner_text('#verdict'))
        br.close()
    shutil.rmtree(tmp, ignore_errors=True)
    print('storage-probe (%s): %d checks, %d failed' % (which, count, len(fails)))
    sys.exit(1 if fails else 0)


main()
