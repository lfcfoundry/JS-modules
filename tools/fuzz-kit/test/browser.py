"""Browser test for fuzz-kit: the example app (example/app.html) with the fuzz adapter, through runner/fuzz_playwright.py's engine.
Copyright (c) 2026 LFC Foundry. MIT License.
Checks: the clean app survives, the planted bug (#bug) is found and described, the same seed gives the same result, and the stripped copy of the app
has no test handle. Run: python3 fuzz-kit/test/browser.py   (Python 3 + Playwright for Python with Chromium; no network)"""
import json, pathlib, subprocess, sys, tempfile
ROOT = pathlib.Path(__file__).resolve().parent.parent
import importlib.util
spec = importlib.util.spec_from_file_location("pw_runner", ROOT / "runner" / "fuzz_playwright.py"); mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
from playwright.sync_api import sync_playwright

adapter = (ROOT / "example" / "adapter.js").read_text()
app_url = (ROOT / "example" / "app.html").as_uri()
fails = 0
def check(name, ok, extra=""):
    global fails
    print(("ok   " if ok else "FAIL ") + name + ((" " + str(extra)[:600]) if not ok and extra else ""))
    if not ok: fails += 1

with sync_playwright() as p:
    br = p.chromium.launch()
    # 1. the clean app: several seeds, no findings, and the run actually visits every state
    seen = {}; clean_ok = True
    for seed in range(1, 6):
        r = mod.run_seed(br, app_url, adapter, seed, 400)
        if r["fails"]: clean_ok = False; print(r["fails"][:1])
        for k, v in r["visited"].items(): seen[k] = seen.get(k, 0) + v
    check("clean app: 5 seeds x 400 ops, no findings", clean_ok)
    check("the runs visit every state of the app (title, play, paused, over)", all(k in seen for k in ("title", "play", "paused", "over")), seen)
    # 2. the planted bug is found, quickly, with a useful description and tail
    found = None
    for seed in range(1, 11):
        r = mod.run_seed(br, app_url + "#bug", adapter, seed, 400)
        if r["fails"]: found = (seed, r); break
    check("planted bug (#bug) is found within 10 seeds", found is not None)
    if found:
        f = found[1]["fails"][0]
        check("the finding names the broken rule", "coins went negative" in f["what"], f)
        check("the finding's tail shows the paused buy that did it", "buy" in f["tail"][-1] or "click-anything-visible" in f["tail"][-1], f["tail"][-6:])
        # 3. determinism: the same seed on a fresh page gives the same finding
        again = mod.run_seed(br, app_url + "#bug", adapter, found[0], 400)
        check("same seed reproduces the same first finding", (again["fails"][0]["i"], again["fails"][0]["what"]) == (f["i"], f["what"]), again["fails"][:1])
        # 4. stopAt replays up to the failure
        stop = mod.run_seed(br, app_url + "#bug", adapter, found[0], 400, stop_at=f["i"])
        check("stopAt stops at the failing operation", stop["ops"] == f["i"] + 1, stop["ops"])
        # 5. --shrink: the failing seed is cut down to a few operations that still break the rule (same game, recorded in the page)
        sh = mod.run_seed(br, app_url + "#bug", adapter, found[0], 400, shrink=True)
        s = sh.get("shrunk") or {}
        check("--shrink: the failing seed is cut to a short replay", s.get("repeats") is True and 3 <= s.get("to", 99) <= 6 and s.get("to") < s.get("from"), s)
        check("--shrink: the short replay still ends in the broken rule", "coins went negative" in json.dumps(s.get("finding")), s.get("finding"))
        # 6. failure bundle: screenshot, saved-data dump, findings
        bundle = pathlib.Path(tempfile.mkdtemp()) / "bundle"
        mod.run_seed(br, app_url + "#bug", adapter, found[0], 400, bundle=str(bundle))
        check("--bundle: screenshot, saved-data dump and findings are written", sorted(x.name for x in bundle.iterdir()) == ["seed-%d-findings.json" % found[0], "seed-%d-storage.json" % found[0], "seed-%d.png" % found[0]], sorted(x.name for x in bundle.iterdir()) if bundle.exists() else "no folder")
    # 7. the junk-text check and the dead-page guard run on a real page too
    r = mod.run_seed(br, app_url, adapter, 1, 120, junk_text=True)
    check("--junk-text: the clean example app shows no NaN or undefined", r["fails"] == [], r["fails"][:1])
    br.close()

# 8. the stripped copy of the app has no test handle, and still runs
out = pathlib.Path(tempfile.mkdtemp()) / "shipped.html"
subprocess.run(["node", str(ROOT / "tools" / "strip-test-hooks.js"), str(ROOT / "example" / "app.html"), str(out)], check=True, capture_output=True)
with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(out.as_uri()); pg.click("#tap"); pg.click("#tap")
    check("stripped copy: no window.__app handle", pg.evaluate("typeof window.__app") == "undefined")
    check("stripped copy: the app still works and has no errors", "coins 1" in pg.inner_text("#out") and not errs, [pg.inner_text("#out"), errs])
    br.close()
print("fuzz-kit browser: %s" % ("all passed" if not fails else "%d failed" % fails)); sys.exit(1 if fails else 0)
