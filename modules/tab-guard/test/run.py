#!/usr/bin/env python3
"""tab-guard browser tests. Run: python3 modules/tab-guard/test/run.py [firefox]

Needs Playwright for Python. Fully offline (file:// pages, http requests aborted). Set FIREFOX_PATH to a Firefox
binary to run with --browser firefox. Exits 1 if any check fails.
"""
import os, sys, time
from playwright.sync_api import sync_playwright

def real_chromium(p, **kw):
    """Start the Chromium named in CHROMIUM (the build from the test-browsers branch), never Playwright's own stock one, and print its real version."""
    exe = os.environ.get("CHROMIUM")
    if not exe:
        print("skipped: set CHROMIUM=/path/to/chrome (the ungoogled Chromium from the test-browsers branch); this test does not fall back to Playwright's own Chromium"); sys.exit(2)
    br = p.chromium.launch(executable_path=exe, **kw)
    print("browser: Chromium " + br.version + " (" + exe + ")")
    return br


HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = 'file://' + os.path.join(HERE, 'page.html')
fails, count = [], 0


def check(name, cond, detail=''):
    global count
    count += 1
    if not cond:
        fails.append(name)
        print('  FAIL', name, detail)


def wait_log(page, want, ms=3000):
    end = time.time() + ms / 1000
    while time.time() < end:
        if want in page.evaluate('log'):
            return True
        time.sleep(0.05)
    return False


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else 'chromium'
    with sync_playwright() as p:
        if which == 'firefox':
            browser = p.firefox.launch(headless=True, executable_path=os.environ.get('FIREFOX_PATH'))
        else:
            browser = real_chromium(p, headless=True)
        ctx = browser.new_context()
        ctx.route('**/*', lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
        errors = []

        def open_page(hash_):
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.goto(PAGE + '#' + hash_)
            return pg

        a = open_page('t1')
        check('supported in this browser', a.evaluate('TabGuard.supported') is True)
        check('first copy claims', wait_log(a, 'claimed'))
        check('first copy is not a twin', a.evaluate('!g.twin && g.holding'))

        b = open_page('t1')
        check('second copy is told it is a twin (after the retry)', wait_log(b, 'twin'))
        check('first copy hears nothing', a.evaluate('log.join()') == 'claimed')

        c = open_page('other')
        check('a different name is guarded separately', wait_log(c, 'claimed'))

        b.evaluate('g.takeOver()')
        check('takeOver reports onTakeOver on the new copy', wait_log(b, 'takeover'))
        check('old copy is told it lost the lock', wait_log(a, 'twin'))
        check('old copy flags: not holding, twin', a.evaluate('!g.holding && g.twin'))

        # stop() gives the lock back, so a fresh copy can claim at once
        b.evaluate('g.stop()')
        d = open_page('t1')
        check('after stop() a new copy claims', wait_log(d, 'claimed'))

        # closing the holder frees the lock (no stale flag)
        d.close()
        e = open_page('t1')
        check('after the holder closes a new copy claims', wait_log(e, 'claimed'))

        # a reload: the page comes back to claim while the old one is going away
        e.reload()
        check('a reload claims again (retry covers the old page lingering)', wait_log(e, 'claimed'))

        check('no page errors', not errors, str(errors))
        browser.close()
    print('tab-guard (%s): %d checks, %d failed' % (which, count, len(fails)))
    sys.exit(1 if fails else 0)


main()
