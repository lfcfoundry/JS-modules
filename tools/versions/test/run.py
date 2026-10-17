#!/usr/bin/env python3
"""Checks for tools/versions: builds a tiny repository in a temp folder, labels it, changes a version, and breaks one copy on purpose.
Copyright (c) 2026 LFC Foundry. MIT License.   Run: python3 tools/versions/test/run.py   (no packages, under a second)"""
import json, os, subprocess, sys, tempfile, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "..", "versions.py")
fail = 0

def check(name, ok, extra=""):
    global fail
    if not ok:
        fail += 1
        print("FAIL " + name + " " + extra)

def run(root, *args):
    p = subprocess.run([sys.executable, TOOL, "--root", root] + list(args), capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr

def w(root, rel, text):
    p = os.path.join(root, rel); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "w").write(text)

def r(root, rel):
    return open(os.path.join(root, rel)).read()

root = tempfile.mkdtemp()
try:
    reg = {"name": "x", "modules": [{"id": "alpha", "global": "Alpha", "summary": "A.", "file": "modules/alpha/alpha.js", "readme": "modules/alpha/README.md"},
                                    {"id": "beta", "global": "Beta", "summary": "B.", "file": "modules/beta/beta.js", "readme": "modules/beta/README.md"}],
           "tools": [{"id": "gamma", "summary": "G.", "folder": "tools/gamma", "readme": "tools/gamma/README.md"}]}
    w(root, "modules.json", json.dumps(reg, indent=2) + "\n")
    w(root, "modules/alpha/alpha.js", "/*!\n * alpha\n * Copyright (c) 2026 LFC Foundry. MIT License\n */\nvar Alpha = {};\n")
    w(root, "modules/beta/beta.js", "/* beta: one-line header. Copyright (c) 2026 LFC Foundry. MIT License. */\nvar Beta = { version: '1.0.0' };\n")
    w(root, "modules/alpha/README.md", "# alpha\n\ntext\n")
    w(root, "modules/beta/README.md", "# beta\n\ntext\n")
    w(root, "tools/gamma/pack.py", '"""gamma. Copyright (c) 2026 LFC Foundry. MIT License\n   Version 2026.10.15.2215\n"""\n')
    w(root, "tools/gamma/README.md", "# gamma\n\ntext\n")
    w(root, "README.md", "| Module | One line | Global |\n|---|---|---|\n| [alpha](modules/alpha/README.md) | A. | `Alpha` |\n| [beta](modules/beta/README.md) | B. | `Beta` |\n\n| Tool | One line |\n|---|---|\n| [gamma](tools/gamma/README.md) | G. |\n")
    w(root, "llms.txt", "- [alpha](u): A. (global Alpha)\n- [beta](u): B. (global Beta)\n- [gamma](u): G.\n")
    w(root, "index.html", '<li id="m-alpha"><a href="x"><b>alpha</b></a>: A.</li><li id="m-beta"><a href="x"><b>beta</b></a>: B.</li><li id="t-gamma"><a href="x"><b>gamma</b></a>: G.</li>')
    rc, out = run(root, "check"); check("unlabelled repo fails the check", rc == 1 and "no valid version" in out, out)
    rc, out = run(root, "init"); check("init labels all three", rc == 0 and "labelled 3" in out, out)
    rc, out = run(root, "check"); check("after init everything agrees", rc == 0, out)
    check("a block-comment header gets the line", " * Version 1.0.0 (API 1)" in r(root, "modules/alpha/alpha.js"))
    check("a one-line header gets the label inside it", "MIT License. Version 1.0.0 (API 1) */" in r(root, "modules/beta/beta.js"))
    check("a date stamp in a tool header is replaced", "Version 1.0.0 (API 1)" in r(root, "tools/gamma/pack.py") and "2026.10.15" not in r(root, "tools/gamma/pack.py"))
    check("README line goes under the title", r(root, "modules/alpha/README.md").startswith("# alpha\n\n**Version 1.0.0 · API 1**\n"))
    check("root README tables get a column", "| Global | Version |" in r(root, "README.md") and "| 1.0.0 · API 1 |" in r(root, "README.md") and "| Tool | One line | Version |" in r(root, "README.md"))
    check("llms and the front page show it", "Version 1.0.0, API 1." in r(root, "llms.txt") and '<small class="v">1.0.0 · API 1</small>' in r(root, "index.html"))
    check("init writes a CHANGELOG.md for each, and a root one", all(os.path.exists(os.path.join(root, p)) for p in ("modules/alpha/CHANGELOG.md", "modules/beta/CHANGELOG.md", "tools/gamma/CHANGELOG.md", "CHANGELOG.md")))
    check("the first entry is the 1.0.0 baseline", "## 1.0.0 · API 1 · 2026-10-16" in r(root, "modules/alpha/CHANGELOG.md") and "(../../tools/versions/README.md)" in r(root, "modules/alpha/CHANGELOG.md"))
    rc, out = run(root, "set", "alpha", "2.3.4"); check("set without a note is refused", rc != 0)
    rc, out = run(root, "set", "alpha", "2.3.4", "--note", "Renamed the `go` option to `start`."); check("set works", rc == 0 and "2.3.4 · API 2" in out, out)
    cl = r(root, "modules/alpha/CHANGELOG.md")
    check("set puts the new entry above the old one", cl.index("## 2.3.4 · API 2") < cl.index("## 1.0.0") and "Renamed the `go` option" in cl)
    check("the root changelog lists the change", "**alpha** 2.3.4 · API 2: Renamed the `go` option to `start`." in r(root, "CHANGELOG.md") and "First labeled" not in r(root, "CHANGELOG.md"))
    reg = json.load(open(os.path.join(root, "modules.json")))
    check("set writes version and api, next to the id", reg["modules"][0]["version"] == "2.3.4" and reg["modules"][0]["api"] == 2 and list(reg["modules"][0])[:3] == ["id", "version", "api"])
    check("set replaces rather than stacks", r(root, "llms.txt").count("Version") == 3 and r(root, "README.md").count("2.3.4") == 1 and r(root, "modules/alpha/alpha.js").count("Version") == 1)
    rc, out = run(root, "check"); check("still agrees after set", rc == 0, out)
    w(root, "modules/alpha/README.md", r(root, "modules/alpha/README.md").replace("2.3.4", "2.3.5"))
    rc, out = run(root, "check"); check("a README that disagrees is caught", rc == 1 and "alpha" in out and "2.3.5" in out, out)
    run(root, "set", "alpha", "2.3.4", "--note", "again")
    rc, out = run(root, "check"); check("set twice to the same number still agrees", rc == 0, out)
    os.remove(os.path.join(root, "modules/beta/CHANGELOG.md")); rc, out = run(root, "check"); check("a missing changelog is caught", rc == 1 and "CHANGELOG.md is missing" in out, out)
    w(root, "modules/beta/CHANGELOG.md", r(root, "modules/alpha/CHANGELOG.md")); rc, out = run(root, "check"); check("a changelog whose newest entry disagrees is caught", rc == 1 and "newest entry" in out, out)
    w(root, "modules/beta/CHANGELOG.md", "# beta changelog\n\n## 1.0.0 · API 1 · 2026-10-16\nFirst labeled version.\n")
    w(root, "modules/beta/beta.js", r(root, "modules/beta/beta.js").replace("version: '1.0.0'", "version: '9.9.9'"))
    rc, out = run(root, "check"); check("a version exposed in code that disagrees is caught", rc == 1 and "9.9.9" in out, out)
    rc, out = run(root, "set", "nope", "1.0.0"); check("an unknown id is refused", rc != 0)
    rc, out = run(root, "set", "alpha", "1.2", "--note", "x"); check("a malformed number is refused", rc != 0)
    rc, out = run(root, "list"); check("list prints the labels", rc == 0 and "alpha" in out and "2.3.4 · API 2" in out, out)
finally:
    shutil.rmtree(root, ignore_errors=True)
print("versions: " + ("%d FAILED" % fail if fail else "all checks passed"))
sys.exit(1 if fail else 0)
