#!/usr/bin/env python3
"""storage-probe browser test. Run: python3 tools/storage-probe/test/run.py [firefox|chromium]

Opens the probe from two different folders (file://) in one browser profile and checks what it reports. The expected answer on desktop
Firefox and Chromium (measured 2026-10-14) is "shared". Set FIREFOX_PATH for Firefox. Exits 1 if any check fails.
Waits for the page's own report instead of sleeping, so a run takes about 2 seconds in Chromium.
Checks cover the second press in one copy, the same file with a different ?/# counting as one copy, the age of stored entries, the
"inside another page" line, role="status" on the verdict box, and (1.1.0) the IndexedDB line, the own-history line, the free-space button and
the second-copy button.
Copyright (c) 2026 LFC Foundry. MIT License.
"""
import os, shutil, sys, tempfile
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

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
        p1.click('#go'); p1.wait_for_selector('#copy:not([hidden])')
        check('first copy: says nothing seen from other files yet', 'Nothing seen from other files yet' in p1.inner_text('#verdict'), p1.inner_text('#verdict'))
        check('first copy: gets the lock', 'now holds the lock' in p1.inner_text('#facts'), p1.inner_text('#facts'))
        check('first copy: says it is not inside another page', 'Inside another page: no' in p1.inner_text('#facts'), p1.inner_text('#facts'))
        check('the verdict box is a status region for screen readers', p1.get_attribute('#verdict', 'role') == 'status')
        # pressing the button a second time in the same copy: it must say this copy holds the lock, not that another copy does
        p1.click('#go'); p1.wait_for_selector('#copy:not([hidden])')
        f1 = p1.inner_text('#facts')
        check('second press in the same copy: says this copy holds the lock', 'this copy holds the lock' in f1, f1)
        check('second press in the same copy: does not claim another copy is open', 'another copy is open' not in f1, f1)
        p2 = ctx.new_page(); p2.goto('file://' + os.path.join(b, 'probe-copy.html'))
        p2.click('#go'); p2.wait_for_selector('#copy:not([hidden])')
        v2 = p2.inner_text('#verdict')
        check('second copy (other folder): reports shared storage', v2.startswith('Shared'), v2)
        check('second copy: sees the lock is taken by the first', 'holds the lock' in p2.inner_text('#facts') and 'another copy is open' in p2.inner_text('#facts'), p2.inner_text('#facts'))
        try: p1.wait_for_function("document.getElementById('facts').innerText.includes('another copy wrote')", timeout=4000)
        except PWTimeout: pass   # the check below then fails with the page text
        check('second copy: says how long ago the other copy was pressed', 'last pressed' in p2.inner_text('#facts') and ('ago' in p2.inner_text('#facts') or 'just now' in p2.inner_text('#facts')), p2.inner_text('#facts'))
        check('first copy: told live that another copy wrote', 'another copy wrote' in p1.inner_text('#facts'), p1.inner_text('#facts'))
        check('a report is offered and names the verdict', 'shared' in p2.inner_text('#report') and p2.is_visible('#copy'), p2.inner_text('#report')[:200])
        # a fresh profile sees nothing
        ctx2 = br.new_context(); p3 = ctx2.new_page(); p3.goto('file://' + os.path.join(b, 'probe-copy.html')); p3.click('#go'); p3.wait_for_selector('#copy:not([hidden])')
        check('a different browser profile sees nothing', 'Nothing seen from other files yet' in p3.inner_text('#verdict'), p3.inner_text('#verdict'))
        # the same file opened with a different query and hash is still one copy (own profile, so no other copy is around)
        ctx4 = br.new_context(); pa = ctx4.new_page(); pa.goto('file://' + os.path.join(a, 'probe.html')); pa.click('#go'); pa.wait_for_selector('#copy:not([hidden])')
        pb = ctx4.new_page(); pb.goto('file://' + os.path.join(a, 'probe.html') + '?level=2#top'); pb.click('#go'); pb.wait_for_selector('#copy:not([hidden])')
        check('the same file with a different ? and # is not counted as another copy', 'Nothing seen from other files yet' in pb.inner_text('#verdict'), pb.inner_text('#verdict'))
        # 1.1.0: IndexedDB line, own history, free-space button, second-copy button (its own profile, so nothing else is around)
        dl = os.path.join(tmp, 'dl'); os.makedirs(dl)
        errs = []
        ctx5 = br.new_context(accept_downloads=True)
        q1 = ctx5.new_page(); q1.on('pageerror', lambda e: errs.append(str(e)))
        q1.goto('file://' + os.path.join(a, 'probe.html')); q1.click('#go'); q1.wait_for_selector('#copy:not([hidden])')
        f = q1.inner_text('#facts')
        check('IndexedDB line: nothing seen from other files yet', 'IndexedDB: nothing seen from other files yet' in f, f)
        check('the second-copy and free-space buttons appear with the report', q1.is_visible('#dl') and q1.is_visible('#space'))
        q1.click('#go'); q1.wait_for_selector('#copy:not([hidden])'); f = q1.inner_text('#facts')
        check('second press: own history line says it was pressed before and survived', 'has been pressed 1 time(s) before' in f and 'survived' in f, f)
        q1.click('#space'); q1.wait_for_function("document.getElementById('facts').innerText.includes('Saved data (localStorage)')", timeout=20000); f = q1.inner_text('#facts')
        check('free-space button: names entries, the largest, and the free room', 'entr' in f and 'million more characters free' in f and 'storage-probe:v1' in f, f)
        check('free-space button: the test key is cleaned up', q1.evaluate("localStorage.getItem('storage-probe:fill')") is None)
        with q1.expect_download() as d: q1.click('#dl')
        got = os.path.join(dl, 'got.html'); d.value.save_as(got); txt = open(got, encoding='utf-8').read()
        check('second copy: keeps the license comment and the doctype', '<!doctype html>' in txt[:3000] and 'FORGED BY' in txt[:3000] and 'Storage probe' in txt, txt[:200])
        check('second copy: has the script and starts without a report', 'storage-probe:v1' in txt and 'id="report" hidden' in txt)
        check('second copy: suggested file name', d.value.suggested_filename == 'storage-probe-copy.html', d.value.suggested_filename)
        q2 = ctx5.new_page(); q2.on('pageerror', lambda e: errs.append(str(e)))
        q2.goto('file://' + got); q2.click('#go'); q2.wait_for_selector('#copy:not([hidden])')
        check('second copy opens from another folder and reports Shared', q2.inner_text('#verdict').startswith('Shared'), q2.inner_text('#verdict'))
        check('and shows the IndexedDB line as shared', 'IndexedDB: shared' in q2.inner_text('#facts'), q2.inner_text('#facts'))
        ctx6 = br.new_context(); ctx6.add_init_script("Storage.prototype.setItem = function () { throw new DOMException('blocked', 'SecurityError'); }; delete window.indexedDB;")
        q3 = ctx6.new_page(); q3.goto('file://' + os.path.join(a, 'probe.html')); q3.click('#go'); q3.wait_for_selector('#copy:not([hidden])')
        check('blocked storage with no IndexedDB is still explained', 'would not let the page save' in q3.inner_text('#verdict'), q3.inner_text('#verdict'))
        check('no page errors in the new checks', not errs, errs)
        # blocked storage
        ctx3 = br.new_context(); ctx3.add_init_script("Storage.prototype.setItem = function () { throw new DOMException('blocked', 'SecurityError'); };")
        p4 = ctx3.new_page(); p4.goto('file://' + os.path.join(a, 'probe.html')); p4.click('#go'); p4.wait_for_selector('#copy:not([hidden])')
        check('blocked storage is explained', 'would not let the page save' in p4.inner_text('#verdict'), p4.inner_text('#verdict'))
        br.close()
    shutil.rmtree(tmp, ignore_errors=True)
    print('storage-probe (%s): %d checks, %d failed' % (which, count, len(fails)))
    sys.exit(1 if fails else 0)


main()
