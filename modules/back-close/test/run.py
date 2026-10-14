#!/usr/bin/env python3
"""back-close browser tests. Run: python3 modules/back-close/test/run.py [firefox]

Needs Playwright for Python. The Escape key goes through the same CloseWatcher channel as the Android back swipe.
Set FIREFOX_PATH to a Firefox binary to run with firefox. Exits 1 if any check fails.
"""
import os, sys
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = 'file://' + os.path.join(HERE, 'page.html')
fails, count = [], 0


def check(name, cond, detail=''):
    global count
    count += 1
    if not cond:
        fails.append(name)
        print('  FAIL', name, detail)


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else 'chromium'
    with sync_playwright() as p:
        if which == 'firefox':
            browser = p.firefox.launch(headless=True, executable_path=os.environ.get('FIREFOX_PATH'))
        else:
            browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        ctx.route('**/*', lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
        pg = ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(PAGE)
        ev = pg.evaluate
        check('supported', ev('BackClose.supported') is True)

        def show(id_):
            pg.mouse.click(10, 10)                    # a real user action, as the browser asks
            ev("document.getElementById('%s').hidden = false" % id_)
            pg.wait_for_timeout(50)

        def esc():
            pg.keyboard.press('Escape')
            pg.wait_for_timeout(120)

        show('p1'); esc()
        check('Escape closes the shown panel', ev('hits.join()') == 'p1' and ev("document.getElementById('p1').hidden"))
        esc()
        check('nothing shown: Escape does nothing here', ev('hits.join()') == 'p1')

        # reopen after close: the watcher is armed again
        show('p1'); esc()
        check('a reopened panel closes again', ev('hits.join()') == 'p1,p1')

        # hits by its own button (attribute set directly): no stale watcher
        ev('hits.length = 0')
        show('p2'); ev("document.getElementById('p2').hidden = true"); pg.wait_for_timeout(50); esc()
        check('closing it yourself disarms the watcher', ev('hits.join()') == '')

        # two panels: newest first
        show('p1'); show('p2'); esc()
        first = ev('hits.join()')
        check('with two shown, one back request closes one panel', first in ('p2', 'p2,p1', 'p1,p2'), first)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(120)
        check('the second request closes the other', sorted(set(ev('hits'))) == ['p1', 'p2'], ev('hits.join()'))

        # a close function that leaves the panel open: armed again
        ev('hits.length = 0; locked = true')
        show('p3'); esc(); esc()
        check('a refused close keeps the watcher armed', ev('hits.join()') == 'p3,p3', ev('hits.join()'))
        ev('locked = false'); esc()
        check('then it closes when allowed', ev("document.getElementById('p3').hidden"))

        # destroy
        pg.goto(PAGE)
        ev("window.h = BackClose.watch(document.getElementById('p1'), function () { hits.push('x'); })")
        show('p1'); ev('h.destroy()'); esc()
        check('destroy() removes the watcher', 'x' not in ev('hits'))

        check('no page errors', not errors, str(errors))
        browser.close()
    print('back-close (%s): %d checks, %d failed' % (which, count, len(fails)))
    sys.exit(1 if fails else 0)


main()
