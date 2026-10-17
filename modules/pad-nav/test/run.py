#!/usr/bin/env python3
"""pad-nav browser tests. Run: python3 pad-nav/test/run.py

Needs Playwright for Python and an installed Chromium. Fully offline: the page is a file:// URL and every
http(s) request is aborted. A fake gamepad is injected through the getPads option (and once through
navigator.getGamepads), and time is a virtual clock passed to step(), so key-repeat timing is exact.
Exits 1 if any check fails.
"""
import os
import sys
import time
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
fails = []
count = 0


def check(name, cond, detail=''):
    global count
    count += 1
    if not cond:
        fails.append(name)
        print('  FAIL', name, detail)


def main():
    t0 = time.time()
    with sync_playwright() as p:
        browser = real_chromium(p, headless=True)
        ctx = browser.new_context(viewport={'width': 800, 'height': 600})
        ctx.route('**/*', lambda route: route.abort() if route.request.url.startswith('http') else route.continue_())
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(PAGE)

        def ev(js, *a):
            return page.evaluate(js, *a) if a else page.evaluate(js)

        def begin(extra='{}', scope='grid', default_pads=False):
            ev("(() => { reset(); window.SCOPE = document.getElementById('%s'); make(%s, %s); })()" % (scope, extra, 'true' if default_pads else 'false'))

        def tap(name, dt=16):
            """Press, let the frame see it, release, let the frame see that."""
            ev("hold(['%s'])" % name)
            s = ev("tick(%d)" % dt)
            ev("hold([])")
            ev("tick(%d)" % dt)
            return s

        def ring():
            return ev("state().ring")

        def log():
            return ev("LOG.slice()")

        # ---------------------------------------------------------------- 1. waking, four directions, edges
        print('1. wake and move in four directions')
        begin()
        check('no ring before any pad input', ring() is None)
        ev("tick(16)")
        check('hint hidden before pad use', ev("state().hint") == '')
        tap('right')
        check('first press only shows focus (no move)', ring() == 'g00', ring())
        check('ring element really has DOM focus', ev("state().active") == 'g00')
        tap('right'); check('right: g01', ring() == 'g01', ring())
        tap('right'); check('right: g02', ring() == 'g02', ring())
        tap('right'); check('right at the edge stays (no wrap)', ring() == 'g02', ring())
        tap('down'); check('down: g12', ring() == 'g12', ring())
        tap('down'); check('down: g22', ring() == 'g22', ring())
        tap('down'); check('down at the edge stays', ring() == 'g22', ring())
        tap('left'); check('left: g21', ring() == 'g21', ring())
        tap('left'); check('left: g20', ring() == 'g20', ring())
        tap('left'); check('left at the edge stays', ring() == 'g20', ring())
        tap('up'); check('up: g10', ring() == 'g10', ring())
        tap('up'); check('up: g00', ring() == 'g00', ring())
        tap('right'); tap('down'); check('diagonal neighbor is not preferred over straight ones', ring() == 'g11', ring())
        check('only one element wears the ring', ev("document.querySelectorAll('.pad-focus').length") == 1)
        begin(); tap('left'); tap('down'); tap('down'); tap('down')   # wake on g00, then g10, g20, and a third down
        check('off-scope button (outside the scope) is never focused', ring() == 'g20' and ev("state().active") == 'g20', ring())

        # ---------------------------------------------------------------- 2. A, B, Start
        print('2. A clicks, B calls onBack, Start calls onStart')
        begin(); tap('right'); tap('right'); tap('down')   # g00 -> g01 -> g11
        tap('a'); check('A clicks the focused element', log() == ['click:g11'], log())
        tap('b'); check('B calls onBack', log() == ['click:g11', 'back'], log())
        tap('start'); check('Start calls onStart', log() == ['click:g11', 'back', 'start'], log())
        ev("hold(['a']); tick(16); tick(500); tick(500)")
        check('A held down clicks only once (edge detected)', log().count('click:g11') == 2, log())
        ev("hold([]); tick(16)")
        begin(); tap('a')
        check('A with no ring and several candidates only wakes the focus', log() == [] and ring() == 'g00', (log(), ring()))
        tap('a'); check('second A clicks it', log() == ['click:g00'], log())
        begin("{ filter: function (el) { return el.id === 'g11'; } }"); tap('a')
        check('A clicks a lone candidate even before any focus ring', log() == ['click:g11'], log())
        begin("{ onA: function (el) { LOG.push('onA:' + el.id); return false; } }"); tap('right'); tap('a')
        check('onA(el) runs and returning false cancels the click', log() == ['onA:g00'], log())
        begin("{ onA: function (el) { LOG.push('onA:' + el.id); } }"); tap('right'); tap('a')
        check('onA without false still clicks', log() == ['onA:g00', 'click:g00'], log())
        begin("{ onBack: function (s) { LOG.push('back:' + (s && s.id)); }, onStart: null }"); tap('b')
        check('onBack receives the scope', log() == ['back:grid'], log())
        tap('start'); check('missing onStart is harmless', log() == ['back:grid'], log())

        # ---------------------------------------------------------------- 3. key repeat
        print('3. key repeat timing')
        begin(scope='panel'); tap('down')
        check('panel wake shows p0', ring() == 'p0', ring())
        ev("hold(['down'])"); ev("tick(16)")
        check('held down: first move at once (p1)', ring() == 'p1', ring())
        ev("tick(379)"); check('no repeat before 380 ms', ring() == 'p1', ring())
        ev("tick(1)"); check('first repeat at 380 ms (p2)', ring() == 'p2', ring())
        ev("tick(119)"); check('no repeat before +120 ms', ring() == 'p2', ring())
        ev("tick(1)"); check('next repeat at +120 ms skips disabled/hidden/invisible (p6)', ring() == 'p6', ring())
        ev("tick(120)"); check('repeat keeps going every 120 ms (p7)', ring() == 'p7', ring())
        ev("tick(240)"); check('two missed frames still move once per step', ring() == 'p8', ring())
        ev("hold([]); tick(16)"); s0 = ring()
        ev("tick(1000)"); check('released: no more movement', ring() == s0, ring())
        ev("hold(['down']); tick(16)"); check('a fresh press moves immediately', ring() == 'p9', ring())
        begin("{ repeatDelay: 100, repeatRate: 50 }", scope='panel'); tap('down'); ev("hold(['down']); tick(16)")
        ev("tick(99)"); a = ring(); ev("tick(1)"); b = ring(); ev("tick(49)"); c = ring(); ev("tick(1)"); d = ring()
        check('custom repeatDelay/repeatRate', (a, b, c, d) == ('p1', 'p2', 'p2', 'p6'), (a, b, c, d))

        # ---------------------------------------------------------------- 4. deadzone and sticks
        print('4. deadzone and stick handling')
        begin()
        ev("hold([], [0.3, 0, 0, 0]); tick(16)"); check('stick inside deadzone does nothing', ring() is None)
        ev("hold([], [0.44, 0, 0, 0]); tick(16)"); check('0.44 is still inside the default 0.45 deadzone', ring() is None)
        ev("hold([], [0.6, 0, 0, 0]); tick(16)"); check('stick beyond deadzone wakes the focus', ring() == 'g00', ring())
        ev("hold([], [0, 0, 0, 0]); tick(16); hold([], [0.6, 0, 0, 0]); tick(16)"); check('stick right moves right', ring() == 'g01', ring())
        ev("hold([], [0, 0, 0, 0]); tick(16); hold([], [0.3, 0, 0, 0]); tick(16)"); check('small push does not move', ring() == 'g01', ring())
        ev("hold([], [0, 0, 0, 0]); tick(16); hold([], [-0.2, 0.9, 0, 0]); tick(16)"); check('stick down moves down (axis 1)', ring() == 'g11', ring())
        ev("hold([], [0, 0, 0, 0]); tick(16); hold([], [-0.9, -0.2, 0, 0]); tick(16)"); check('stick left moves left', ring() == 'g10', ring())
        ev("hold([], [0, 0, 0, 0]); tick(16); hold([], [0, -0.9, 0, 0]); tick(16)"); check('stick up moves up', ring() == 'g00', ring())
        ev("hold([], [0, 0, 0, 0]); tick(16); hold([], [0.8, 0.9, 0, 0]); tick(16)"); check('diagonal push moves along the stronger axis only', ring() == 'g10', ring())
        ev("hold([], [0, 0, 0, 0]); tick(16); hold([], [0, 0, 0.9, 0.9]); tick(16)"); check('right stick (axes 2,3) is ignored', ring() == 'g10', ring())
        begin("{ deadzone: 0.8 }"); ev("hold([], [0.6, 0, 0, 0]); tick(16)"); check('custom deadzone 0.8 ignores 0.6', ring() is None)
        ev("hold([], [0.85, 0, 0, 0]); tick(16)"); check('custom deadzone 0.8 accepts 0.85', ring() == 'g00', ring())
        begin(); ev("hold([], [0.5, 0, 0, 0]); tick(16)"); ev("hold([], [0.5, 0, 0, 0]); tick(379)")
        check('stick repeat honors the 380 ms delay', ring() == 'g00', ring())
        ev("tick(1)"); check('stick repeat fires at 380 ms', ring() == 'g01', ring())
        ev("hold([])"); ev("tick(16)")

        # ---------------------------------------------------------------- 5. scroll into view
        print('5. scrolling keeps the focus visible')
        begin(scope='panel'); tap('down')
        rec = []
        for _ in range(6):
            tap('down'); rec.append(ring())
        check('walks the visible/enabled buttons only', rec == ['p1', 'p2', 'p6', 'p7', 'p8', 'p9'], rec)
        inside = ev("""(() => { const p = document.getElementById('panel').getBoundingClientRect(), b = document.getElementById('p9').getBoundingClientRect();
                        return b.top >= p.top - 0.5 && b.bottom <= p.bottom + 0.5; })()""")
        check('focused button was scrolled inside the panel', inside)
        st = ev("document.getElementById('panel').scrollTop")
        check('panel scrolled', st > 0, st)
        check('page itself did not scroll', ev("window.scrollY") == 0)
        tap('down'); st2 = ev("document.getElementById('panel').scrollTop")
        check('down with nothing further scrolls the panel by half a page', st2 > st and ring() == 'p9', (st, st2, ring()))
        for _ in range(10):
            tap('up')
        check('walking back up returns to p0 and scrolls back', ring() == 'p0' and ev("document.getElementById('panel').scrollTop") < st, (ring(), ev("document.getElementById('panel').scrollTop")))
        ev("document.getElementById('panel').scrollTop = 200")
        tap('up'); check('up with nothing above scrolls up', ev("document.getElementById('panel').scrollTop") < 200)
        begin("{ scroll: false }", scope='panel'); tap('down')
        for _ in range(6):
            tap('down')
        check('scroll:false leaves scrolling alone', ev("document.getElementById('panel').scrollTop") == 0)

        # ---------------------------------------------------------------- 6. disabled / hidden
        print('6. disabled, hidden and off-scope elements are skipped')
        begin(); ev("document.getElementById('g11').disabled = true"); tap('left'); tap('down'); tap('right')
        check('disabled center skipped: g10 -> g12', ring() == 'g12', ring())
        begin(); ev("document.getElementById('g12').style.display = 'none'"); tap('left'); tap('down'); tap('right')
        check('with g11 disabled and g12 hidden, right never lands on them (falls to a diagonal neighbor)', ring() in ('g01', 'g21'), ring())
        begin(); ev("document.getElementById('g12').style.visibility = 'hidden'"); tap('left'); tap('down'); tap('right'); tap('right')
        check('visibility:hidden skipped (g12 never focused)', ring() == 'g02', ring())
        ev("document.getElementById('g12').style.visibility = ''; document.getElementById('g11').disabled = false")
        begin(); ev("document.getElementById('g12').setAttribute('aria-disabled', 'true')"); tap('left'); tap('down'); tap('right'); tap('right')
        check('aria-disabled="true" skipped', ring() == 'g02', ring())
        ev("document.getElementById('g12').removeAttribute('aria-disabled'); document.getElementById('g12').style.display = ''")
        begin(); ev("document.getElementById('g12').style.display = 'none'"); tap('left'); tap('down'); tap('right'); tap('right'); tap('right')
        check('nothing further right of g02: stays', ring() == 'g02', ring())
        ev("document.getElementById('g12').style.display = ''")
        begin(); ev("document.getElementById('g11').setAttribute('inert', '')"); tap('left'); tap('down'); tap('right')
        check('inert skipped', ring() == 'g12', ring())
        ev("document.getElementById('g11').removeAttribute('inert')")
        begin(); tap('left'); tap('down'); tap('down')
        check('a button below the scope (the "outside" button) is not reachable', ring() == 'g20', ring())

        # ---------------------------------------------------------------- 7. scope switching
        print('7. scope switching')
        begin(); tap('right'); tap('right')   # g00 -> g01
        ev("window.SCOPE = document.getElementById('panel')"); ev("tick(16)")
        check('new scope within the wake window gets focus on its first button', ring() == 'p0', ring())
        check('old scope lost its ring', ev("document.getElementById('g01').classList.contains('pad-focus')") is False)
        ev("hold(['a']); tick(16)")
        check('A inside the 450 ms guard after a scope appears is ignored', log() == [], log())
        ev("hold([]); tick(16); tick(500)")
        tap('a'); check('after the guard, A clicks', log() == ['click:p0'], log())
        tap('down'); check('moves inside the new scope only', ring() == 'p1', ring())
        ev("window.SCOPE = null"); ev("tick(16)")
        check('no scope: ring cleared', ring() is None)
        n = len(log()); tap('down'); tap('a')
        check('no scope: direction and A do nothing', len(log()) == n and ring() is None, (log(), ring()))
        tap('b'); tap('start'); check('no scope: B and Start still reach callbacks', log()[-2:] == ['back', 'start'], log())
        check('no scope: hint hidden', ev("state().hint") == '')
        ev("window.SCOPE = document.getElementById('grid')"); ev("tick(16)")
        check('returning to a scope restores its remembered focus', ring() == 'g01', ring())
        ev("window.SCOPE = document.getElementById('panel')"); ev("tick(9000)")
        check('scope appearing long after pad use does not grab focus', ring() is None, ring())
        tap('right'); check('first press after that just shows focus', ring() == 'p1', ring())   # remembered p1
        begin("{ getScope: null, scopeSelector: '#panel, #grid' }", scope='grid'); tap('down')
        check('scopeSelector: last visible match wins (panel)', ring() == 'p0', ring())
        ev("document.getElementById('panel').style.display = 'none'"); ev("tick(16)")
        check('scopeSelector: falls back to the other match when the last is hidden', ring() == 'g00', ring())
        ev("document.getElementById('panel').style.display = ''")
        begin("{ getScope: null }"); tap('down')
        check('no scope option at all: whole body is the scope', ring() == 'g00', ring())
        tap('down'); tap('down'); tap('down')
        check('body scope reaches the outside button', ring() == 'outside', ring())

        # ---------------------------------------------------------------- 8. hint
        print('8. hint line')
        begin(); ev("tick(16)"); check('no hint before pad use', ev("state().hint") == '')
        tap('right')
        h = ev("state().hint")
        check('hint appears after pad use and lists wired buttons', 'D-pad' in h and 'A: pick' in h and 'B: back' in h and 'Start' in h, h)
        ev("tick(3400)"); check('hint still visible before hintMs', ev("state().hint") != '')
        ev("tick(200)"); check('hint hides after 3.5 s', ev("state().hint") == '', ev("state().hint"))
        ev("window.SCOPE = document.getElementById('panel'); tick(16)")
        check('hint comes back on a scope change', ev("state().hint") != '')
        begin("{ onBack: null, onStart: null }"); tap('right')
        check('hint omits buttons that are not wired', ev("state().hint") == 'D-pad: move    A: pick', ev("state().hint"))
        begin("{ hintText: function (s) { return 'Scope ' + s.id; } }"); tap('right')
        check('hintText function', ev("state().hint") == 'Scope grid', ev("state().hint"))
        begin("{ hintText: 'Custom' }"); tap('right')
        check('hintText string', ev("state().hint") == 'Custom')

        # ---------------------------------------------------------------- 9. controllers that do not qualify
        print('9. non-standard, disconnected and missing pads')
        begin(); ev("FAKE.mapping = ''"); tap('right')
        check('non-standard mapping is ignored', ring() is None and ev("state().hint") == '')
        ev("hold(['a']); tick(16); hold([]); tick(16)"); check('non-standard pad cannot click', log() == [])
        begin("{ requireStandard: false }"); tap('right')
        check('requireStandard:false reads it anyway', ring() == 'g00', ring())
        ev("FAKE.mapping = 'standard'; FAKE.connected = false")
        begin(); tap('right'); check('disconnected pad ignored', ring() is None)
        ev("FAKE.connected = true")
        r = ev("""(() => { make({ getPads: function () { return null; } }); const a = pn.step(5);
                            make({ getPads: function () { return [null, undefined, {}]; } }); const b = pn.step(10);
                            make({ getPads: function () { return []; } }); return [a, b, pn.step(15)]; })()""")
        check('null/empty pad lists are fine and step() reports no pad', r == [False, False, False], r)

        # ---------------------------------------------------------------- 10. default getPads, rAF loop
        print('10. default navigator.getGamepads and start()/stop()')
        ev("navigator.getGamepads = function () { return [FAKE]; }")
        begin(default_pads=True); tap('right')
        check('default getPads uses navigator.getGamepads', ring() == 'g00', ring())
        begin(default_pads=True); ev("hold([]); pn.start()")
        ev("hold(['right'])")
        page.wait_for_function("document.querySelector('.pad-focus') && document.querySelector('.pad-focus').id === 'g00'", timeout=3000)
        check('start() polls with requestAnimationFrame', True)
        ev("hold([])"); page.wait_for_timeout(60)
        ev("pn.stop(); hold(['right'])"); page.wait_for_timeout(150)
        check('stop() stops polling', ring() == 'g00', ring())
        ev("hold([])")

        # ---------------------------------------------------------------- 11. misc
        print('11. blur, destroy, nearest()')
        begin(); tap('right'); ev("document.activeElement.blur()")
        check('losing focus removes the ring', ring() is None)
        begin(); tap('right'); ev("pn.destroy()")
        check('destroy() clears ring and hint', ring() is None and ev("state().hint") == '')
        r = ev("""(() => { const f = { left: 0, top: 0, width: 10, height: 10 };
          return [ PadNav.nearest(f, [{ left: 60, top: 0, width: 10, height: 10 }, { left: 20, top: 40, width: 10, height: 10 }], 'r'),
                   PadNav.nearest(f, [{ left: 0, top: 0, width: 10, height: 10 }], 'r'),
                   PadNav.nearest(f, [{ left: 0, top: -50, width: 10, height: 10 }, { left: 0, top: 50, width: 10, height: 10 }], 'u'),
                   PadNav.nearest(f, [], 'd') ]; })()""")
        check('nearest(): straight neighbor beats nearer diagonal; nothing in that direction gives -1', r == [0, -1, 0, -1], r)

        check('no page errors', not errors, errors)
        browser.close()

    print('%d checks, %d failed, %.1f s' % (count, len(fails), time.time() - t0))
    if fails:
        print('FAILED:', ', '.join(fails))
        sys.exit(1)
    print('OK')


if __name__ == '__main__':
    main()
