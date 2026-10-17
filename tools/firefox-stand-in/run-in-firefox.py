#!/usr/bin/env python3
"""run-in-firefox.py: run a Playwright-for-Python test file in stock Firefox instead.
Part of JS-modules, https://github.com/lfcfoundry/JS-modules
Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).

    python3 tools/firefox-stand-in/run-in-firefox.py modules/pad-nav/test/run.py [the test's own arguments]

Needs: pip install selenium, plus Firefox and geckodriver (FIREFOX_PATH, GECKODRIVER_PATH). The test file is run as it is; its
`from playwright.sync_api import sync_playwright` is served by pwfirefox.py, and both p.firefox.launch() and p.chromium.launch() start Firefox.
Read README.md in this folder first to decide whether the test fits. A banner on stderr says which Firefox ran, so a result can be labeled.
"""
import os, runpy, sys, types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True   # no __pycache__ next to the tool


def main(argv):
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__); return 2
    sys.path.insert(0, HERE)
    import pwfirefox
    pkg = types.ModuleType("playwright"); pkg.__path__ = []
    api = types.ModuleType("playwright.sync_api")
    api.sync_playwright, api.TimeoutError = pwfirefox.sync_playwright, pwfirefox.TimeoutError
    pkg.sync_api = api
    sys.modules["playwright"], sys.modules["playwright.sync_api"] = pkg, api
    test = os.path.abspath(argv[1])
    sys.argv = [test] + argv[2:]
    print("run-in-firefox: %s through pwfirefox (Selenium + geckodriver). Playwright's chromium.launch() and firefox.launch() both start Firefox here; "
          "route() blocks nothing." % os.path.relpath(test), file=sys.stderr)
    sys.path.insert(0, os.path.dirname(test))
    runpy.run_path(test, run_name="__main__")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
