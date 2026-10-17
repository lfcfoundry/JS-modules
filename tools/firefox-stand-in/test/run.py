"""Checks for the Firefox stand-in (pwfirefox.py and run-in-firefox.py). Copyright (c) 2026 LFC Foundry. MIT License.
Run: python3 tools/firefox-stand-in/test/run.py     Needs Selenium, Firefox and geckodriver (FIREFOX_PATH, GECKODRIVER_PATH or on the PATH).
Exits 2 with a message when one of those is missing (tests/kits.js shows that as a skip). Takes about 10 seconds."""
import os, pathlib, shutil, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent.parent
try:
    import selenium  # noqa: F401
except ImportError:
    print("skip: Selenium is not installed (pip install selenium)"); sys.exit(2)
if not (os.environ.get("FIREFOX_PATH") or shutil.which("firefox")) or not (os.environ.get("GECKODRIVER_PATH") or shutil.which("geckodriver")):
    print("skip: Firefox or geckodriver not found (set FIREFOX_PATH and GECKODRIVER_PATH)"); sys.exit(2)
sys.path.insert(0, str(HERE))
import pwfirefox  # noqa: E402

passed = failed = 0
def check(name, cond, detail=""):
    global passed, failed
    if cond: passed += 1; print("ok   " + name)
    else: failed += 1; print("FAIL " + name + (" " + str(detail)[:300] if detail else ""))

PAGE = ("<!doctype html><title>t</title><body style='margin:0;height:300px'><script>window.hit=0;"
        "setInterval(function(){document.body.setAttribute('data-hit',String(window.hit))},20);"
        "addEventListener('keydown',function(e){document.body.setAttribute('data-key',e.key)});"
        "addEventListener('click',function(e){document.body.setAttribute('data-click',e.clientX+','+e.clientY+','+e.isTrusted)});"
        "setTimeout(function(){throw new Error('boom from the page')},60)</script><p id=p>hello</p>")

with pwfirefox.sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    try:
        ctx = b.new_context(viewport={"width": 500, "height": 400}); pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.set_content(PAGE)
        check("the browser is Firefox and says its version", b.version.split(".")[0].isdigit() and "Firefox" in pg.evaluate("navigator.userAgent"), b.version)
        check("evaluate: an expression, several statements, and a function called with one argument",
              pg.evaluate("1 + 2") == 3 and pg.evaluate("var q = 4; q * 2") == 8 and pg.evaluate("(x) => x * 2", 21) == 42)
        check("evaluate: a promise is awaited",
              pg.evaluate("new Promise(function (r) { setTimeout(function () { r(7); }, 50); })") == 7)
        try: pg.evaluate("nope()"); ok = False
        except RuntimeError as e: ok = "nope" in str(e)
        check("evaluate: a thrown error raises RuntimeError naming the problem", ok)
        pg.evaluate("window.hit = 5")
        pg.wait_for_function("document.body.getAttribute('data-hit') === '5'", timeout=3000)
        check("evaluate runs in the page's own world: a page global assigned from a test is seen by the page's own script", True)
        pg.mouse.click(30, 40); pg.wait_for_timeout(100)
        check("mouse.click is a real (trusted) click at the point", pg.evaluate("document.body.getAttribute('data-click')") == "30,40,true", pg.evaluate("document.body.getAttribute('data-click')"))
        pg.keyboard.press("Escape"); pg.wait_for_timeout(100)
        check("keyboard.press('Escape') reaches the page", pg.evaluate("document.body.getAttribute('data-key')") == "Escape")
        pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(100)
        check("keyboard.press('ArrowDown') reaches the page", pg.evaluate("document.body.getAttribute('data-key')") == "ArrowDown")
        pg.wait_for_timeout(200); pg.evaluate("0")
        check("on('pageerror') gets an error the page threw after load", any("boom from the page" in e for e in errs), errs)
        check("title, inner_text, viewport", pg.title() == "t" and pg.inner_text("#p") == "hello" and pg.evaluate("innerWidth") in range(450, 520), pg.evaluate("innerWidth"))
        pg.add_script_tag(content="window.added = 'yes'")
        check("add_script_tag(content=) runs in the page", pg.evaluate("window.added") == "yes")
        try: pg.wait_for_function("false", timeout=200); ok = False
        except TimeoutError: ok = True
        check("wait_for_function raises TimeoutError when it runs out", ok)
        for name, call in (("page.on('console')", lambda: pg.on("console", lambda m: 0)), ("webkit", lambda: p.webkit), ("a second page", lambda: ctx.new_page()),
                           ("new_context(is_mobile)", lambda: b.new_context(is_mobile=True)), ("page.screenshot", lambda: pg.screenshot())):
            try: call(); ok = False
            except NotImplementedError as e: ok = "supports:" in str(e)
            check("unsupported call says so in plain words, with what is supported: " + name, ok)
    finally:
        b.close()

# the runner: a tiny Playwright-style test file, run as it is
tmp = pathlib.Path(tempfile.mkdtemp())
(tmp / "t.py").write_text("import sys\nfrom playwright.sync_api import sync_playwright\nwith sync_playwright() as p:\n    b = p.chromium.launch(headless=True)\n    pg = b.new_page()\n"
                          "    pg.set_content('<p id=a>hi</p>')\n    print('RESULT', pg.inner_text('#a'), sys.argv[1:])\n    b.close()\nsys.exit(3)\n")
r = subprocess.run([sys.executable, str(HERE / "run-in-firefox.py"), str(tmp / "t.py"), "x", "y"], capture_output=True, text=True, timeout=120)
check("run-in-firefox runs an unmodified Playwright-style test, passes its arguments, and keeps its exit code", "RESULT hi ['x', 'y']" in r.stdout and r.returncode == 3, (r.stdout, r.stderr[-200:]))
check("run-in-firefox prints a banner saying Firefox ran and that chromium.launch was redirected", "pwfirefox: Firefox " in r.stderr and "both start Firefox" in r.stderr, r.stderr[-300:])
shutil.rmtree(tmp, ignore_errors=True)
print("firefox-stand-in: %d passed, %d failed" % (passed, failed)); sys.exit(1 if failed else 0)
