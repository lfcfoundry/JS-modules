#!/usr/bin/env python3
"""Run a fuzz-kit adapter against a page with Playwright for Python.  Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/JNFoo/JS-modules

  python3 runner/fuzz_playwright.py URL ADAPTER.js [--seeds 1-20] [--ops 400] [--browser chromium|firefox|webkit] [--viewport 412x892]
      [--shrink] [--shrink-tries 200] [--shrink-secs 30]      when a seed fails, cut it down to the shortest replay (same game, recorded) and print it
      [--seed-secs 120]                                        hang guard: a seed with no answer after this long is killed and reported as "hung"
      [--bundle DIR]                                           for a failing seed save a screenshot, the saved-data dump (localStorage, sessionStorage) and the findings
      [--throttle 4]                                           CPU slowdown, Chromium only (Chrome DevTools command; refused for other browsers)
      [--real-input]                                           let operations ask for real mouse and keyboard input (Fuzzer.Real.ops())
      [--junk-text] [--junk-skip "Infinity War,foo"]           add the NaN / undefined / [object ...] visible-text check to every seed
      [--ignore-console REGEX]... [--allow-console-errors]     console.error fails a seed unless it matches an --ignore-console pattern (or all are allowed)
      [--allow-navigation]                                     do not fail when the page moves off the start page (single-page apps that change the path)
      [--hang-trace]                                           print each operation name to the runner so a hang can name the operation it died in (slower)
      [--init "localStorage.setItem('k','v')"]                 JavaScript to run before the page's own scripts (start from a given saved game)
      [--mobile]                                               phone-style page: touch on, mobile viewport (Chromium and WebKit; Playwright's Firefox cannot)

Every seed gets a fresh browser context (clean storage), loads URL, injects src/fuzz-core.js, runner/page-driver.js and ADAPTER.js (which must define
window.__fuzzConfig(seed)), and runs the fuzzer. Prints one line per seed; a failing seed prints its finding(s) with the operation tail.
A page that crashes, is closed, opens a new tab or leaves the start page FAILS the seed (a dead page never reads as green).
Exit code 1 if any seed failed. Needs only: pip install playwright (and a browser installed for it)."""
import argparse, json, pathlib, re, sys, time

HERE = pathlib.Path(__file__).resolve().parent
CORE = (HERE.parent / "src" / "fuzz-core.js").read_text()
DRIVER = (HERE / "page-driver.js").read_text()

DEFAULTS = dict(shrink=False, shrink_tries=200, shrink_secs=30, seed_secs=120, throttle=1, real_input=False, junk_text=False, junk_skip=(),
                ignore_console=(), allow_console_errors=False, allow_navigation=False, bundle=None, hang_trace=False, init=None, mobile=False)
KEY_OK = re.compile(r"^[A-Za-z0-9]{1,12}$")
DUMP_JS = """() => {
  function dump(name) { try { var s = window[name], o = {}, i, k; for (i = 0; i < s.length; i++) { k = s.key(i); o[k] = s.getItem(k); } return o; } catch (e) { return 'unavailable: ' + e; } }
  return { url: location.href, localStorage: dump('localStorage'), sessionStorage: dump('sessionStorage'), cookie: document.cookie };
}"""


class Hung(Exception):
    pass


def strip_hash(u):
    return u.split("#", 1)[0]


def console_ignored(text, patterns):
    """True when a console.error text matches any of the regular expressions (strings or compiled)."""
    return any(re.search(p, text) for p in patterns)


def real_request(req, vw, vh):
    """Check a real-input request from the page; return ('click'|'move', x, y) / ('press', key) or None when it is not acceptable."""
    if not isinstance(req, dict):
        return None
    t = req.get("t")
    if t in ("click", "move"):
        x, y = req.get("x"), req.get("y")
        if isinstance(x, (int, float)) and isinstance(y, (int, float)) and x == x and y == y and abs(x) < 1e6 and abs(y) < 1e6:
            return (t, min(max(float(x), 0.0), vw - 1.0), min(max(float(y), 0.0), vh - 1.0))
    if t == "press" and isinstance(req.get("key"), str) and KEY_OK.match(req["key"]):
        return ("press", req["key"])
    return None


def do_real(page, req, viewport):
    ok = real_request(req, viewport[0], viewport[1])
    if ok is None:
        return
    if ok[0] == "click":
        page.mouse.click(ok[1], ok[2])
    elif ok[0] == "move":
        page.mouse.move(ok[1], ok[2])
    else:
        page.keyboard.press(ok[1])


def shrink_lines(sh):
    """The plain-words report for the 'shrunk' part of a result."""
    if not sh:
        return []
    if not sh.get("repeats"):
        return ["       shrink: the failure did NOT repeat when the same recorded operations were replayed on a reset app, so it was not shrunk "
                "(the app may not reset fully between tries, or may depend on time or hidden randomness). The seed and the tail above are the evidence."]
    script = json.dumps(sh.get("script", []), separators=(",", ":"))
    if len(script) > 1500:
        script = script[:1500] + "...(cut)"
    cut = " (stopped at the %s cap, so it may not be the shortest)" % sh["stopped"] if sh.get("stopped") else ""
    f = sh.get("finding") or {}
    return ["       shrunk %d -> %d operations in %d tries, %.1fs%s: %s" % (sh["from"], sh["to"], sh["tries"], sh.get("ms", 0) / 1000.0, cut, ", ".join(sh.get("ops", []))),
            "       replay with run(0, { script }): " + script,
            "       it fails with: " + json.dumps({k: f.get(k) for k in ("i", "op", "what")})[:400]]


def save_bundle(page, directory, seed, r, gone):
    """Screenshot, saved-data dump and findings for a failing seed. gone: the page is hung, crashed or closed, so only a short screenshot try is made."""
    d = pathlib.Path(directory)
    d.mkdir(parents=True, exist_ok=True)
    notes = []
    try:
        page.screenshot(path=str(d / ("seed-%s.png" % seed)), timeout=3000 if gone else 8000)
    except Exception as e:
        notes.append("no screenshot: " + str(e).split("\n")[0][:120])
    if gone:
        notes.append("no saved-data dump: the page is hung or gone")
    else:
        try:
            (d / ("seed-%s-storage.json" % seed)).write_text(json.dumps(page.evaluate(DUMP_JS), indent=1, default=str))
        except Exception as e:
            notes.append("no saved-data dump: " + str(e).split("\n")[0][:120])
    (d / ("seed-%s-findings.json" % seed)).write_text(json.dumps({"seed": seed, "ops": r.get("ops"), "fails": r.get("fails"), "shrunk": r.get("shrunk"), "notes": notes}, indent=1, default=str))
    return notes


def pump(page, deadline, viewport):
    """Wait for the page's answer; carry out real-input requests; raise Hung when the deadline passes."""
    while True:
        left = deadline - time.perf_counter()
        if left <= 0:
            raise Hung()
        try:
            page.wait_for_function("window.__fuzzR || window.__fuzzNeed", polling=50, timeout=int(left * 1000) + 1)
        except Exception as e:
            if type(e).__name__ == "TimeoutError":
                raise Hung()
            raise
        need = page.evaluate("window.__fuzzTake()")
        if need:
            do_real(page, need, viewport)
            page.evaluate("window.__fuzzGive()")
            continue
        return page.evaluate("window.__fuzzR")


def run_seed(browser, url, adapter_js, seed, ops, viewport=(412, 892), stop_at=None, **kw):
    o = dict(DEFAULTS)
    o.update(kw)
    phone = {"is_mobile": True, "has_touch": True} if o["mobile"] else {}
    ctx = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]}, accept_downloads=True, **phone)
    page = ctx.new_page()
    page.set_default_timeout(60000)
    if o["init"]:
        page.add_init_script(script=o["init"])
    perr, guard, st = [], [], {"armed": False, "start": "", "mark": ""}

    def on_console(m):
        if m.type == "error":
            if not o["allow_console_errors"] and not console_ignored(m.text, o["ignore_console"]):
                perr.append("console.error: " + m.text)
        elif m.type == "debug" and m.text.startswith("__fuzz-op "):
            st["mark"] = m.text[10:]

    def on_nav(frame):
        if st["armed"] and frame == page.main_frame and not o["allow_navigation"] and strip_hash(frame.url) != st["start"]:
            guard.append("the page left the start page: now at " + frame.url[:200])

    page.on("pageerror", lambda e: perr.append("pageerror: " + str(e)))
    page.on("console", on_console)
    page.on("crash", lambda *_: guard.append("the page crashed"))
    page.on("close", lambda *_: guard.append("the page was closed") if st["armed"] else None)
    page.on("popup", lambda p: guard.append("the page opened a new tab or window: " + str(p.url)[:200]) if st["armed"] else None)
    page.on("framenavigated", on_nav)
    t0 = time.perf_counter()
    hung = False
    r = None
    try:
        if o["throttle"] and o["throttle"] > 1:
            ctx.new_cdp_session(page).send("Emulation.setCPUThrottlingRate", {"rate": o["throttle"]})
        page.goto(url)
        st["start"] = strip_hash(page.url)
        page.evaluate(CORE + "\n;0")      # a classic script; the trailing 0 matters: Playwright CALLS a string that evaluates to a function
        page.evaluate(DRIVER + "\n;0")
        page.evaluate(adapter_js + "\n;0")
        st["armed"] = True
        drv = {"shrink": o["shrink"], "shrinkTries": o["shrink_tries"], "shrinkSecs": o["shrink_secs"], "junkText": o["junk_text"], "junkSkip": list(o["junk_skip"]),
               "real": o["real_input"], "trace": o["hang_trace"]}
        if stop_at is not None:
            drv["stopAt"] = stop_at
        page.evaluate("([s, n, o]) => window.__fuzzStart(s, n, o)", [seed, ops, drv])
        deadline = time.perf_counter() + o["seed_secs"] + ((o["shrink_secs"] + 5) if o["shrink"] else 0)
        r = pump(page, deadline, viewport)
    except Hung:
        hung = True
        r = {"seed": seed, "ops": 0, "visited": {}, "fails": [{"i": -1, "op": "hung", "what": "no answer after %ds: the page is stuck (an endless loop?). Last operation it reported: %s" % (
            o["seed_secs"], st["mark"] or "unknown (run again with --hang-trace to name it)"), "tail": []}]}
    except Exception as e:
        r = {"seed": seed, "ops": 0, "visited": {}, "fails": [{"i": -1, "op": "harness", "what": "EXC " + str(e)[:300], "tail": []}]}
    if not isinstance(r, dict):
        r = {"seed": seed, "ops": 0, "visited": {}, "fails": [{"i": -1, "op": "harness", "what": "no result from the page", "tail": []}]}
    if r.get("error"):
        r = {"seed": seed, "ops": 0, "visited": {}, "fails": [{"i": -1, "op": "harness", "what": str(r["error"])[:300], "tail": []}]}
    if st["armed"] and not hung:
        try:
            if page.is_closed() and "the page was closed" not in guard:
                guard.append("the page was closed")
            elif not page.is_closed() and not o["allow_navigation"] and strip_hash(page.url) != st["start"]:
                guard.append("the page left the start page: now at " + page.url[:200])
        except Exception:
            pass
    for g in sorted(set(guard), key=guard.index):
        r["fails"].append({"i": -1, "op": "page-guard", "what": g, "tail": []})
    for e in perr[:3]:
        r["fails"].append({"i": -1, "op": "pageerror", "what": e[:300], "tail": []})
    r["secs"] = time.perf_counter() - t0
    if r["fails"] and o["bundle"]:
        gone = hung or bool(guard)
        try:
            r["bundle_notes"] = save_bundle(page, o["bundle"], seed, r, gone)
        except Exception as e:
            r["bundle_notes"] = ["bundle failed: " + str(e)[:120]]
    st["armed"] = False
    try:
        ctx.close()   # also kills a hung page
    except Exception:
        pass
    return r


def parse_seeds(s):
    a, _, b = s.partition("-")
    return range(int(a), int(b or a) + 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url"); ap.add_argument("adapter"); ap.add_argument("--seeds", default="1-10"); ap.add_argument("--ops", type=int, default=400)
    ap.add_argument("--browser", default="chromium"); ap.add_argument("--viewport", default="412x892")
    ap.add_argument("--shrink", action="store_true"); ap.add_argument("--shrink-tries", type=int, default=DEFAULTS["shrink_tries"]); ap.add_argument("--shrink-secs", type=float, default=DEFAULTS["shrink_secs"])
    ap.add_argument("--seed-secs", type=float, default=DEFAULTS["seed_secs"]); ap.add_argument("--bundle", default=None)
    ap.add_argument("--throttle", type=float, default=1); ap.add_argument("--real-input", action="store_true")
    ap.add_argument("--junk-text", action="store_true"); ap.add_argument("--junk-skip", default="")
    ap.add_argument("--ignore-console", action="append", default=[]); ap.add_argument("--allow-console-errors", action="store_true")
    ap.add_argument("--allow-navigation", action="store_true"); ap.add_argument("--hang-trace", action="store_true")
    ap.add_argument("--init", default=None); ap.add_argument("--mobile", action="store_true")
    a = ap.parse_args()
    if a.throttle > 1 and a.browser != "chromium":
        print("--throttle works only with --browser chromium (it uses a Chrome DevTools command that other browsers do not offer).", file=sys.stderr)
        sys.exit(2)
    for pat in a.ignore_console:
        try:
            re.compile(pat)
        except re.error as e:
            print("--ignore-console %r is not a valid regular expression: %s" % (pat, e), file=sys.stderr)
            sys.exit(2)
    adapter_js = pathlib.Path(a.adapter).read_text()
    vw, vh = (int(x) for x in a.viewport.split("x"))
    kw = dict(shrink=a.shrink, shrink_tries=a.shrink_tries, shrink_secs=a.shrink_secs, seed_secs=a.seed_secs, throttle=a.throttle, real_input=a.real_input, junk_text=a.junk_text,
              junk_skip=[s for s in a.junk_skip.split(",") if s], ignore_console=a.ignore_console, allow_console_errors=a.allow_console_errors, allow_navigation=a.allow_navigation,
              bundle=a.bundle, hang_trace=a.hang_trace, init=a.init, mobile=a.mobile)
    from playwright.sync_api import sync_playwright
    bad = total = 0
    t0 = time.perf_counter()
    with sync_playwright() as p:
        br = getattr(p, a.browser).launch()
        for seed in parse_seeds(a.seeds):
            r = run_seed(br, a.url, adapter_js, seed, a.ops, (vw, vh), **kw)
            total += r["ops"]
            if r["fails"]:
                bad += 1
                print(f" FAIL seed {seed}: {len(r['fails'])} finding(s) after {r['ops']} ops", flush=True)
                for f in r["fails"][:3]:
                    print("      ", json.dumps({**f, "tail": f["tail"][-14:]})[:700], flush=True)
                for line in shrink_lines(r.get("shrunk")):
                    print(line, flush=True)
                for n in r.get("bundle_notes", []):
                    print("       bundle:", n, flush=True)
                if a.bundle:
                    print("       bundle saved in", a.bundle, flush=True)
            else:
                print(f" ok   seed {seed}: {r['ops']} ops {r['secs']:.1f}s visited={json.dumps(r['visited'])}", flush=True)
        br.close()
    print(f"fuzz: {len(parse_seeds(a.seeds))} seeds, {total} ops, {bad} seeds with findings, wall {time.perf_counter()-t0:.0f}s")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
