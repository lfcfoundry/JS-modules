#!/usr/bin/env python3
"""Run a fuzz-kit adapter against a page with Playwright for Python.  MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/JNFoo/JS-modules

  python3 runner/fuzz_playwright.py URL ADAPTER.js [--seeds 1-20] [--ops 400] [--browser chromium|firefox|webkit] [--viewport 412x892]

Every seed gets a fresh browser context (clean storage), loads URL, injects src/fuzz-core.js and ADAPTER.js (which must define
window.__fuzzConfig(seed)), and runs the fuzzer. Prints one line per seed; a failing seed prints its finding(s) with the operation tail.
Exit code 1 if any seed failed. Needs only: pip install playwright (and a browser installed for it)."""
import argparse, json, pathlib, sys, time

CORE = (pathlib.Path(__file__).resolve().parent.parent / "src" / "fuzz-core.js").read_text()


def run_seed(browser, url, adapter_js, seed, ops, viewport=(412, 892), stop_at=None):
    ctx = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]}, accept_downloads=True)
    page = ctx.new_page(); page.set_default_timeout(240000)
    perr = []
    page.on("pageerror", lambda e: perr.append("pageerror: " + str(e)))
    page.on("console", lambda m: perr.append("console.error: " + m.text) if m.type == "error" else None)
    t0 = time.perf_counter()
    try:
        page.goto(url)
        page.evaluate(CORE + "\n;window.Fuzzer = Fuzzer;0")   # a classic script: Fuzzer becomes a global (the trailing 0 matters: Playwright CALLS a string that evaluates to a function)
        page.evaluate(adapter_js + "\n;0")
        r = page.evaluate("async ([s, n, o]) => await new Fuzzer(window.__fuzzConfig(s)).run(n, o)", [seed, ops, {"stopAt": stop_at} if stop_at is not None else {}])
    except Exception as e:
        r = {"seed": seed, "ops": 0, "fails": [{"i": -1, "op": "harness", "what": "EXC " + str(e)[:300], "tail": []}], "visited": {}}
    for e in perr[:3]:
        r["fails"].append({"i": -1, "op": "pageerror", "what": e[:300], "tail": []})
    r["secs"] = time.perf_counter() - t0
    ctx.close()
    return r


def parse_seeds(s):
    a, _, b = s.partition("-")
    return range(int(a), int(b or a) + 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url"); ap.add_argument("adapter"); ap.add_argument("--seeds", default="1-10"); ap.add_argument("--ops", type=int, default=400)
    ap.add_argument("--browser", default="chromium"); ap.add_argument("--viewport", default="412x892")
    a = ap.parse_args()
    adapter_js = pathlib.Path(a.adapter).read_text()
    vw, vh = (int(x) for x in a.viewport.split("x"))
    from playwright.sync_api import sync_playwright
    bad = total = 0; t0 = time.perf_counter()
    with sync_playwright() as p:
        br = getattr(p, a.browser).launch()
        for seed in parse_seeds(a.seeds):
            r = run_seed(br, a.url, adapter_js, seed, a.ops, (vw, vh)); total += r["ops"]
            if r["fails"]:
                bad += 1
                print(f" FAIL seed {seed}: {len(r['fails'])} finding(s) after {r['ops']} ops", flush=True)
                for f in r["fails"][:3]: print("      ", json.dumps({**f, "tail": f["tail"][-14:]})[:700], flush=True)
            else:
                print(f" ok   seed {seed}: {r['ops']} ops {r['secs']:.1f}s visited={json.dumps(r['visited'])}", flush=True)
        br.close()
    print(f"fuzz: {len(parse_seeds(a.seeds))} seeds, {total} ops, {bad} seeds with findings, wall {time.perf_counter()-t0:.0f}s")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
