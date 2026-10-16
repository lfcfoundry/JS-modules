"""Checks for the Playwright runner's own logic, with NO browser: a fake page stands in for Playwright's page, so these run anywhere Python 3 runs.
Copyright (c) 2026 LFC Foundry. MIT License.
They cover what the runner adds around the engine: the hang guard, the dead-page guard (crash, close, new tab, leaving the start page), console.error
handling, real-input requests, the --shrink report, the failure bundle, --throttle and the option checks. The engine itself is tested by test/run.js and the
real browser by test/browser.py. Run: python3 tools/fuzz-kit/test/runner_fakes.py"""
import importlib.util, json, pathlib, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("pw_runner", ROOT / "runner" / "fuzz_playwright.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

fails = 0


def check(name, ok, extra=""):
    global fails
    print(("ok   " if ok else "FAIL ") + name + ((" " + str(extra)[:500]) if not ok and extra else ""))
    if not ok:
        fails += 1


class TimeoutError(Exception):   # the runner recognizes Playwright's timeout by this class name
    pass


class Msg:
    def __init__(self, type_, text):
        self.type, self.text = type_, text


class Frame:
    def __init__(self, url):
        self.url = url


class FakePage:
    """result: what window.__fuzzR holds; needs: real-input requests the page will ask for in order; hang: wait_for_function never returns;
    during_start: a function(page) run when the fuzz starts (it may emit events, like a real page would while it runs)."""
    def __init__(self, result=None, needs=(), hang=False, during_start=None, url="file:///game.html"):
        self.handlers, self.url, self.closed = {}, url, False
        self.result, self.needs, self.hang, self.during_start = result, list(needs), hang, during_start
        self.main_frame = Frame(url)
        self.mouse_calls, self.key_calls, self.started, self.evals, self.shots = [], [], None, [], []
        outer = self

        class Mouse:
            def click(self, x, y): outer.mouse_calls.append(("click", x, y))
            def move(self, x, y): outer.mouse_calls.append(("move", x, y))

        class Keyboard:
            def press(self, k): outer.key_calls.append(k)

        self.mouse, self.keyboard = Mouse(), Keyboard()

    def on(self, ev, fn): self.handlers.setdefault(ev, []).append(fn)
    def emit(self, ev, *a): [fn(*a) for fn in self.handlers.get(ev, [])]
    def set_default_timeout(self, ms): pass
    def goto(self, url): pass
    def is_closed(self): return self.closed
    def screenshot(self, path=None, timeout=None): pathlib.Path(path).write_bytes(b"png")
    def add_init_script(self, script=None): self.init_scripts = getattr(self, 'init_scripts', []) + [script]

    def wait_for_function(self, expr, polling=None, timeout=None):
        if self.hang:
            raise TimeoutError("Timeout %sms exceeded" % timeout)

    def evaluate(self, expr, arg=None):
        self.evals.append(expr[:40])
        if expr.endswith(";0"):
            return None
        if "__fuzzStart" in expr:
            self.started = arg
            if self.during_start:
                self.during_start(self)
            return 1
        if "__fuzzTake" in expr:
            return self.needs.pop(0) if self.needs else None
        if "__fuzzGive" in expr:
            return 1
        if "__fuzzR" in expr:
            return json.loads(json.dumps(self.result))
        if "localStorage" in expr:
            return {"url": self.url, "localStorage": {"k": "v"}, "sessionStorage": {}, "cookie": ""}
        raise AssertionError("unexpected evaluate: " + expr[:60])


class FakeCtx:
    def __init__(self, page, owner): self.page, self.owner = page, owner
    def new_page(self): return self.page
    def new_cdp_session(self, page): return self.owner.cdp
    def close(self): self.owner.closed += 1


class FakeBrowser:
    def __init__(self, page):
        self.page, self.closed, self.contexts = page, 0, 0
        outer = self

        class Cdp:
            sent = []
            def send(self, name, args): Cdp.sent.append((name, args))

        self.cdp = Cdp()

    def new_context(self, **kw):
        self.contexts += 1
        self.last_kw = kw
        return FakeCtx(self.page, self)


OK = {"seed": 1, "ops": 40, "fails": [], "visited": {"a": 40}}
FAIL = {"seed": 1, "ops": 12, "fails": [{"i": 11, "op": "buy", "what": "coins went negative: -9", "tail": ["tap", "buy"]}], "visited": {}}


def run(page, **kw):
    return mod.run_seed(FakeBrowser(page), "file:///game.html", "window.__fuzzConfig=function(){};", 1, 40, **kw)


# 1. green and red results pass through unchanged
r = run(FakePage(OK))
check("a clean result is green", r["fails"] == [] and r["ops"] == 40, r)
r = run(FakePage(FAIL))
check("a failing result keeps its finding", r["fails"][0]["what"] == "coins went negative: -9", r)
r = run(FakePage({"error": "could not start: boom"}))
check("an error from the in-page driver is a harness finding", r["fails"][0]["op"] == "harness" and "boom" in r["fails"][0]["what"], r)

# 2. options reach the page driver
p = FakePage(OK)
run(p, shrink=True, shrink_tries=50, shrink_secs=7, junk_text=True, junk_skip=["Infinity War"], real_input=True, hang_trace=True, stop_at=9)
check("options are handed to the in-page driver", p.started == [1, 40, {"shrink": True, "shrinkTries": 50, "shrinkSecs": 7, "junkText": True, "junkSkip": ["Infinity War"], "real": True, "trace": True, "stopAt": 9}], p.started)

# 3. hang guard
b = FakeBrowser(FakePage(hang=True))
r = mod.run_seed(b, "u", "a", 3, 40, seed_secs=1)
check("a hung seed is reported as hung and the context is closed", r["fails"][0]["op"] == "hung" and b.closed == 1 and "--hang-trace" in r["fails"][0]["what"], r["fails"])
p = FakePage(hang=True, during_start=lambda pg: pg.emit("console", Msg("debug", "__fuzz-op 17 pick-stuck")))
r = run(p, seed_secs=1, hang_trace=True)
check("with --hang-trace the hung report names the last operation", "17 pick-stuck" in r["fails"][0]["what"], r["fails"])

# 4. a dead page never reads as green
for label, fn, word in [
    ("crash", lambda pg: pg.emit("crash"), "crashed"),
    ("closed", lambda pg: pg.emit("close"), "closed"),
    ("new tab", lambda pg: pg.emit("popup", type("P", (), {"url": "https://elsewhere.test/"})()), "new tab"),
    ("navigation", lambda pg: (setattr(pg, "url", "https://elsewhere.test/x"), pg.emit("framenavigated", Frame("https://elsewhere.test/x"))), "left the start page"),
]:
    r = run(FakePage(OK, during_start=fn))
    check("guard: %s fails the seed" % label, any(f["op"] == "page-guard" and word in f["what"] for f in r["fails"]), r["fails"])
p = FakePage(OK, during_start=lambda pg: setattr(pg, "closed", True))
r = run(p)
check("guard: a page that is closed when the run ends fails the seed even with no event", any(f["op"] == "page-guard" for f in r["fails"]), r["fails"])
p = FakePage(OK, during_start=lambda pg: setattr(pg, "url", "https://elsewhere.test/"))
r = run(p)
check("guard: a page that is elsewhere when the run ends fails the seed even with no event", any("left the start page" in f["what"] for f in r["fails"]), r["fails"])
p = FakePage(OK, during_start=lambda pg: (setattr(pg, "url", "file:///game.html#level2"), pg.emit("framenavigated", Frame("file:///game.html#level2"))))
check("guard: a change after # is not leaving the page", run(p)["fails"] == [])
p = FakePage(OK, during_start=lambda pg: (setattr(pg, "url", "https://elsewhere.test/"), pg.emit("framenavigated", Frame("https://elsewhere.test/"))))
check("guard: --allow-navigation lets a single-page app move", run(p, allow_navigation=True)["fails"] == [])

# 5. console.error handling
def noisy(pg): pg.emit("console", Msg("error", "deliberate: the demo error")); pg.emit("console", Msg("log", "just a log"))
check("console.error fails a seed by default", any(f["op"] == "pageerror" and "deliberate" in f["what"] for f in run(FakePage(OK, during_start=noisy))["fails"]))
check("--ignore-console REGEX lets a deliberate message pass", run(FakePage(OK, during_start=noisy), ignore_console=["^deliberate"])["fails"] == [])
check("a pattern that does not match still fails", len(run(FakePage(OK, during_start=noisy), ignore_console=["nothing"])["fails"]) == 1)
check("--allow-console-errors lets all pass", run(FakePage(OK, during_start=noisy), allow_console_errors=True)["fails"] == [])
check("a page error is still a finding", any(f["op"] == "pageerror" for f in run(FakePage(OK, during_start=lambda pg: pg.emit("pageerror", Exception("kaput"))))["fails"]))

# 6. real input
p = FakePage(OK, needs=[{"t": "click", "x": 5000, "y": -3}, {"t": "evil"}, {"t": "press", "key": "Enter"}, {"t": "press", "key": "Enter; rm"}, {"t": "move", "x": 10, "y": 20}])
r = run(p, real_input=True)
check("real input: clicks are clamped into the viewport, keys are pressed, odd requests are refused", p.mouse_calls == [("click", 411.0, 0.0), ("move", 10.0, 20.0)] and p.key_calls == ["Enter"] and r["fails"] == [], (p.mouse_calls, p.key_calls, r["fails"]))
check("real_request refuses odd things", mod.real_request({"t": "click", "x": float("nan"), "y": 1}, 100, 100) is None and mod.real_request(None, 1, 1) is None and mod.real_request({"t": "press", "key": 7}, 1, 1) is None)

# 7. the --shrink report
lines = "\n".join(mod.shrink_lines({"repeats": True, "from": 212, "to": 2, "tries": 31, "ms": 1900, "stopped": "", "ops": ["add", "spend"], "script": [{"op": "add", "s": 1}, {"op": "spend", "s": 2}], "finding": {"i": 1, "op": "spend", "what": "n is negative: -4"}}))
check("shrink report: sizes, tries, operations, the replay and the finding", "212 -> 2" in lines and "31 tries" in lines and "add, spend" in lines and '[{"op":"add","s":1},{"op":"spend","s":2}]' in lines and "n is negative" in lines, lines)
lines = "\n".join(mod.shrink_lines({"repeats": True, "from": 50, "to": 9, "tries": 200, "ms": 1000, "stopped": "tries", "ops": ["a"], "script": [], "finding": {}}))
check("shrink report: says when a cap stopped the search", "stopped at the tries cap" in lines, lines)
lines = "\n".join(mod.shrink_lines({"repeats": False, "from": 50, "to": 50, "tries": 1, "ms": 5, "ops": [], "script": [], "finding": None}))
check("shrink report: says plainly when the failure does not repeat", "did NOT repeat" in lines, lines)
check("shrink report: nothing when there is no shrink", mod.shrink_lines(None) == [])

# 8. failure bundle
d = pathlib.Path(tempfile.mkdtemp())
r = run(FakePage(dict(FAIL, shrunk={"repeats": True, "from": 12, "to": 2, "tries": 9, "ms": 10, "stopped": "", "ops": ["tap", "buy"], "script": [], "finding": {}})), bundle=str(d / "b"))
names = sorted(x.name for x in (d / "b").iterdir())
check("bundle: screenshot, saved-data dump and findings are saved for a failing seed", names == ["seed-1-findings.json", "seed-1-storage.json", "seed-1.png"], names)
saved = json.loads((d / "b" / "seed-1-findings.json").read_text())
check("bundle: the findings file holds the finding and the shrink", saved["fails"][0]["op"] == "buy" and saved["shrunk"]["ops"] == ["tap", "buy"], saved)
check("bundle: the storage dump holds what the page had saved", json.loads((d / "b" / "seed-1-storage.json").read_text())["localStorage"] == {"k": "v"})
run(FakePage(OK), bundle=str(d / "none"))
check("bundle: nothing is written for a green seed", not (d / "none").exists())
run(FakePage(hang=True), bundle=str(d / "hung"), seed_secs=1)
hung_saved = json.loads((d / "hung" / "seed-1-findings.json").read_text())
check("bundle: a hung seed gets its findings file and the missing dump is explained", any("no saved-data dump" in n for n in hung_saved["notes"]) and not (d / "hung" / "seed-1-storage.json").exists(), hung_saved)

# 9. throttle and fresh context
b = FakeBrowser(FakePage(OK))
mod.run_seed(b, "u", "a", 1, 5, throttle=4)
mod.run_seed(b, "u", "a", 2, 5)
check("--throttle sends the Chrome DevTools CPU rate", ("Emulation.setCPUThrottlingRate", {"rate": 4}) in b.cdp.sent, b.cdp.sent)
check("every seed gets a fresh context and it is closed", b.contexts == 2 and b.closed == 2, (b.contexts, b.closed))

# 9b. --init and --mobile
p = FakePage(OK); b = FakeBrowser(p)
mod.run_seed(b, "u", "a", 1, 5, init="localStorage.setItem('k','v')", mobile=True)
check("--init is installed to run before the page's own scripts", getattr(p, "init_scripts", None) == ["localStorage.setItem('k','v')"], getattr(p, "init_scripts", None))
check("--mobile turns on touch and the mobile viewport", b.last_kw.get("is_mobile") is True and b.last_kw.get("has_touch") is True, b.last_kw)
b = FakeBrowser(FakePage(OK)); mod.run_seed(b, "u", "a", 1, 5)
check("without --mobile the context is a desktop one", "is_mobile" not in b.last_kw)

# 10. option checks in main()
def main_exits(argv):
    old = sys.argv
    sys.argv = ["fuzz_playwright.py"] + argv
    try:
        mod.main()
    except SystemExit as e:
        return e.code
    finally:
        sys.argv = old
    return None

adapter = d / "a.js"
adapter.write_text("window.__fuzzConfig=function(){};")
check("--throttle with another browser than chromium is refused (exit 2)", main_exits(["u", str(adapter), "--throttle", "4", "--browser", "firefox"]) == 2)
check("a bad --ignore-console regular expression is refused (exit 2)", main_exits(["u", str(adapter), "--ignore-console", "("]) == 2)

# 11. house rule: header
check("the runner and this file carry the header", all("Copyright (c) 2026 LFC Foundry. MIT License" in (ROOT / f).read_text() for f in ("runner/fuzz_playwright.py", "test/runner_fakes.py", "runner/page-driver.js")))

print("fuzz-kit runner (fake page): %s" % ("all passed" if not fails else "%d failed" % fails))
sys.exit(1 if fails else 0)
