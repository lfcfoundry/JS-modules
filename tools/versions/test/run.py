#!/usr/bin/env python3
"""Checks for tools/versions: builds a tiny repository in a temp folder, labels it, changes a version, and breaks one copy on purpose.
Copyright (c) 2026 LFC Foundry. MIT License.   Run: python3 tools/versions/test/run.py   (no packages, under a second)"""
import json, os, subprocess, sys, tempfile, shutil
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import versions as V0
HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "..", "versions.py")
fail = 0

def check(name, ok, extra=""):
    global fail
    if not ok:
        fail += 1
        print("FAIL " + name + " " + extra)

FULL = tempfile.mkdtemp()   # stands in for /mnt/project-files/changelogs-full/JS-modules

def run(root, *args):
    p = subprocess.run([sys.executable, TOOL, "--root", root] + list(args), capture_output=True, text=True, env=dict(os.environ, CHANGELOGS_FULL=FULL))
    return p.returncode, p.stdout + p.stderr

def w(root, rel, text):
    p = os.path.join(root, rel); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "w").write(text)

def r(root, rel):
    return open(os.path.join(root, rel)).read()

def rf(name):
    return open(os.path.join(FULL, name + ".md")).read()

root = tempfile.mkdtemp()
try:
    reg = {"name": "x", "modules": [{"id": "alpha", "global": "Alpha", "summary": "A.", "short": "A.", "category": "c1", "demo": "modules/alpha/demo.html", "file": "modules/alpha/alpha.js", "readme": "modules/alpha/README.md"},
                                    {"id": "beta", "global": "Beta", "summary": "B.", "short": "B.", "category": "c1", "file": "modules/beta/beta.js", "readme": "modules/beta/README.md"}],
           "categories": {"pieces": {"title": "Pieces", "groups": [{"id": "c1", "title": "First group", "use": "Use one."}, {"id": "t1", "title": "Tool group", "use": "Use two."}]}, "stories": {"title": "Packages", "groups": [{"id": "x", "title": "Pkg group", "use": "Use three."}]}},
           "related": {"repository": "https://example.org/se", "packages": [{"id": "pkg", "short": "P.", "category": "x", "readme": "https://example.org/se/pkg.md", "sizeNote": "documents only"}]},
           "tools": [{"id": "gamma", "summary": "G.", "short": "G.", "category": "t1", "file": ["tools/gamma/pack.py"], "folder": "tools/gamma", "readme": "tools/gamma/README.md"}]}
    w(root, "modules.json", json.dumps(reg, indent=2) + "\n")
    w(root, "modules/alpha/alpha.js", "/*!\n * alpha\n * Copyright (c) 2026 LFC Foundry. MIT License\n */\nvar Alpha = {};\n")
    w(root, "modules/beta/beta.js", "/* beta: one-line header. Copyright (c) 2026 LFC Foundry. MIT License. */\nvar Beta = { version: '1.0.0' };\n")
    w(root, "modules/alpha/README.md", "# alpha\n\ntext\n")
    w(root, "modules/beta/README.md", "# beta\n\ntext\n")
    w(root, "tools/gamma/pack.py", '"""gamma. Copyright (c) 2026 LFC Foundry. MIT License\n   Version 2026.10.15.2215\n"""\n')
    w(root, "tools/gamma/README.md", "# gamma\n\ntext\n")
    w(root, "README.md", "# x\n\n## Pick a piece\n\nold hand-written tables\n\n## How to use\n\ntext\n")
    w(root, "llms.txt", "- [alpha](u): A. (global Alpha)\n- [beta](u): B. (global Beta)\n- [gamma](u): G.\n")
    w(root, "demos.html", '<li id="m-alpha"><a href="x"><b>alpha</b></a>: A.</li><li id="m-beta"><a href="x"><b>beta</b></a>: B.</li><li id="t-gamma"><a href="x"><b>gamma</b></a>: G.</li>')
    rc, out = run(root, "check"); check("unlabelled repo fails the check", rc == 1 and "no valid version" in out, out)
    rc, out = run(root, "init"); check("init labels all three", rc == 0 and "labelled 3" in out, out)
    rc, out = run(root, "check"); check("after init everything agrees", rc == 0, out)
    check("a block-comment header gets the line", " * Version 1.0.0 (API 1)" in r(root, "modules/alpha/alpha.js"))
    check("a one-line header gets the label inside it", "MIT License. Version 1.0.0 (API 1) */" in r(root, "modules/beta/beta.js"))
    check("a date stamp in a tool header is replaced", "Version 1.0.0 (API 1)" in r(root, "tools/gamma/pack.py") and "2026.10.15" not in r(root, "tools/gamma/pack.py"))
    check("README line goes under the title", r(root, "modules/alpha/README.md").startswith("# alpha\n\n**Version 1.0.0 · API 1**\n"))
    rm = r(root, "README.md")
    check("the root README tables are written between markers, the rest is kept", V0.TABLES_START in rm and V0.TABLES_END in rm and "old hand-written" not in rm and "## How to use" in rm)
    check("every table has the same six columns", rm.count("| Name | Version | Size (KB) | Gzipped (KB) | What it does | Demo |") == 3 and "#### First group" in rm and "#### Tool group" in rm and "### Pieces (3)" in rm and "### Packages (1)" in rm)
    check("a row has the version, sizes in KB with one decimal, the short text and the demo link", "| [alpha](modules/alpha/README.md) | 1.0.0 | 0.1 | 0.1 | A. | [Demo](" in rm and "| [gamma](tools/gamma/README.md) *(tool)* | 1.0.0 |" in rm)
    check("a piece with no script says n/a once, with its reason", "*n/a* means there is no script to measure: **pkg** (documents only)." in rm and "| [pkg](https://example.org/se/pkg.md) | \u2014 | n/a | n/a | P. |" in rm)
    rc, out = run(root, "sizes"); check("sizes is a no-op when nothing changed", rc == 0 and "already current" in out, out)
    check("llms and the front page show it", "Version 1.0.0, API 1." in r(root, "llms.txt") and '<small class="v">1.0.0 · API 1</small>' in r(root, "demos.html"))
    w(root, "demos.html", r(root, "demos.html").replace("</small>: A.</li>", "</small>: A. <small>global <code>A</code> \u00b7 99.0 KB \u00b7 <a href=\"d\">docs</a></small></li>"))
    rc, out = run(root, "check"); check("a stale size on the front page is caught", rc == 1 and "front page" in out, out)
    rc, out = run(root, "sizes"); check("sizes rewrites the front-page size to the README table size", rc == 0 and "demos.html sizes refreshed" in out and "99.0 KB" not in r(root, "demos.html") and " \u00b7 0.1 KB \u00b7 " in r(root, "demos.html"), out)
    rc, out = run(root, "check"); check("the front page agrees after sizes", rc == 0, out)
    check("init writes a CHANGELOG.md for each, and a root one", all(os.path.exists(os.path.join(root, p)) for p in ("modules/alpha/CHANGELOG.md", "modules/beta/CHANGELOG.md", "tools/gamma/CHANGELOG.md", "CHANGELOG.md")) and all(os.path.exists(os.path.join(FULL, n + ".md")) for n in ("alpha", "beta", "gamma")))
    check("the first entry is the 1.0.0 baseline", "## 1.0.0 · API 1 · 2026-10-16\n- First labeled version. Nothing in the code changed." in r(root, "modules/alpha/CHANGELOG.md") and "kept privately" in r(root, "modules/alpha/CHANGELOG.md") and "## 1.0.0 · API 1 · 2026-10-16" in rf("alpha"))
    rc, out = run(root, "set", "alpha", "2.3.4"); check("set without a note is refused", rc != 0)
    rc, out = run(root, "set", "alpha", "2.3.4", "--short", "The go option is now called start.", "--note", "Renamed the `go` option to `start`. Seven checks changed."); check("set works", rc == 0 and "2.3.4 · API 2" in out, out)
    cl = r(root, "modules/alpha/CHANGELOG.md")
    check("set puts the short entry above the old one, as a plain line", cl.index("## 2.3.4 · API 2") < cl.index("## 1.0.0") and "\n- The go option is now called start.\n" in cl and "Seven checks" not in cl)
    check("set puts the full entry in the private folder", rf("alpha").index("## 2.3.4 · API 2") < rf("alpha").index("## 1.0.0") and "Renamed the `go` option to `start`. Seven checks changed." in rf("alpha"))
    check("the root changelog lists the short line", "**alpha** 2.3.4 · API 2: The go option is now called start." in r(root, "CHANGELOG.md") and "First labeled" not in r(root, "CHANGELOG.md") and "Seven checks" not in r(root, "CHANGELOG.md"))
    reg = json.load(open(os.path.join(root, "modules.json")))
    check("set writes version and api, next to the id", reg["modules"][0]["version"] == "2.3.4" and reg["modules"][0]["api"] == 2 and list(reg["modules"][0])[:3] == ["id", "version", "api"])
    check("set replaces rather than stacks", r(root, "llms.txt").count("Version") == 3 and r(root, "README.md").count("2.3.4") == 1 and r(root, "modules/alpha/alpha.js").count("Version") == 1)
    rc, out = run(root, "check"); check("still agrees after set", rc == 0, out)
    w(root, "modules/alpha/README.md", r(root, "modules/alpha/README.md").replace("2.3.4", "2.3.5"))
    rc, out = run(root, "check"); check("a README that disagrees is caught", rc == 1 and "alpha" in out and "2.3.5" in out, out)
    rc, out = run(root, "set", "alpha", "2.3.4", "--note", "Again, with `code` and more words. Second sentence.")
    check("without --short the first sentence of --note is used, with a warning", "no --short given" in out and "- Again, with code and more words.\n" in r(root, "modules/alpha/CHANGELOG.md") and "Second sentence" not in r(root, "modules/alpha/CHANGELOG.md"), out)
    rc, out = run(root, "check"); check("set twice to the same number still agrees", rc == 0, out)
    rc, out = run(root, "set", "alpha", "2.4.0", "--tested", "Firefox 158, ungoogled Chromium 155", "--short", "Added a thing.", "--note", "Added a thing with numbers."); check("set with --tested works", rc == 0 and "not recorded" not in out, out)
    check("the full entry carries the Tested in line, the short one does not", "Tested in: Firefox 158, ungoogled Chromium 155" in rf("alpha").split("## 2.3.4")[0] and "Tested in" not in r(root, "modules/alpha/CHANGELOG.md"))
    check("the README carries the Tested in line under the version", "**Version 2.4.0 · API 2**\n\n**Tested in:** Firefox 158, ungoogled Chromium 155" in r(root, "modules/alpha/README.md"))
    check("the root changelog has the short line only", "Added a thing.\n" in r(root, "CHANGELOG.md") and "Tested in" not in r(root, "CHANGELOG.md") and "with numbers" not in r(root, "CHANGELOG.md"))
    rc, out = run(root, "set", "alpha", "2.4.1", "--short", "Small fix.", "--note", "Small fix."); check("set without --tested says not recorded and reminds", rc == 0 and "not recorded" in out and "Tested in: not recorded." in rf("alpha"), out)
    rc, out = run(root, "tested", "alpha", "2.4.0", "WebKitGTK 2.52.6, Firefox 158"); check("tested rewrites an older entry only", rc == 0 and "Tested in: WebKitGTK 2.52.6, Firefox 158" in rf("alpha") and "**Tested in:** not recorded." in r(root, "modules/alpha/README.md"), out)
    rc, out = run(root, "tested", "alpha", "2.4.1", "Firefox 158"); check("tested on the newest entry updates the README", rc == 0 and "**Tested in:** Firefox 158" in r(root, "modules/alpha/README.md"), out)
    rc, out = run(root, "check"); check("everything still agrees with Tested in lines", rc == 0, out)
    os.remove(os.path.join(root, "modules/beta/CHANGELOG.md")); rc, out = run(root, "check"); check("a missing changelog is caught", rc == 1 and "CHANGELOG.md is missing" in out, out)
    w(root, "modules/beta/CHANGELOG.md", r(root, "modules/alpha/CHANGELOG.md")); rc, out = run(root, "check"); check("a changelog whose newest entry disagrees is caught", rc == 1 and "newest entry" in out, out)
    good = "# beta changelog\n\n## 1.0.0 · API 1 · 2026-10-16\n- First labeled version. Nothing in the code changed.\n"
    w(root, "modules/beta/CHANGELOG.md", good + "\nTested in: Firefox 158\n"); rc, out = run(root, "check"); check("a Tested in line in the short changelog is caught", rc == 1 and "private full changelog" in out, out)
    w(root, "modules/beta/CHANGELOG.md", good.replace("Nothing in the code changed.", "x" * 241)); rc, out = run(root, "check"); check("a short line over 240 characters is caught", rc == 1 and "at most 240" in out, out)
    w(root, "modules/beta/CHANGELOG.md", good + "- two\n- three\n- four\n- five\n"); rc, out = run(root, "check"); check("more than 4 lines for one version is caught", rc == 1 and "has 5 lines" in out, out)
    w(root, "modules/beta/CHANGELOG.md", good)
    os.rename(os.path.join(FULL, "beta.md"), os.path.join(FULL, "beta.off")); rc, out = run(root, "check"); check("a missing full changelog is caught when the private folder exists", rc == 1 and "no full changelog" in out, out)
    os.rename(os.path.join(FULL, "beta.off"), os.path.join(FULL, "beta.md")); rc, out = run(root, "check"); check("with the full changelog back, it agrees again", rc == 0, out)
    w(root, "modules/beta/beta.js", r(root, "modules/beta/beta.js").replace("version: '1.0.0'", "version: '9.9.9'"))
    rc, out = run(root, "check"); check("a version exposed in code that disagrees is caught", rc == 1 and "9.9.9" in out, out)
    rc, out = run(root, "set", "beta", "1.0.1", "--short", "A small fix.", "--note", "A small fix.")
    check("set updates a runtime version property too", rc == 0 and "version: '1.0.1'" in r(root, "modules/beta/beta.js"), out)
    rc, out = run(root, "check"); check("the runtime version agrees after set", rc == 0, out)
    rc, out = run(root, "set", "nope", "1.0.0"); check("an unknown id is refused", rc != 0)
    rc, out = run(root, "set", "alpha", "1.2", "--note", "x"); check("a malformed number is refused", rc != 0)
    rc, out = run(root, "list"); check("list prints the labels", rc == 0 and "alpha" in out and "2.4.1 · API 2" in out, out)
    reg2 = json.load(open(os.path.join(root, "modules.json")))
    check("the glance index lists every piece by name, with no sizes (the tables below give them)", "- First group: [alpha](modules/alpha/README.md), [beta](modules/beta/README.md)\n" in rm and "gzipped size in KB" not in rm and "**Pieces (3)**" in rm and "- Tool group: [gamma](tools/gamma/README.md)\n" in rm and "[gamma](tools/gamma/README.md)" in rm and rm.index("## All at a glance") < rm.index("## Pick a piece"))
    rm = r(root, "README.md"); rm2 = V0.set_tables(rm, reg2, root)
    check("the tables and the index are refreshed in place, not stacked", rm2 == rm and rm.count("All at a glance") == 1 and rm.count(V0.TABLES_START) == 1)
    reg2["modules"][1]["short"] = "x" * 101; open(os.path.join(root, "modules.json"), "w").write(json.dumps(reg2, indent=2))
    rc, out = run(root, "check"); check("a description over 100 characters is refused", rc == 1 and "short description is 101 characters" in out, out)
    reg2["modules"][1]["short"] = "B."; reg2["modules"][1]["file"] = "modules/beta/missing.js"; open(os.path.join(root, "modules.json"), "w").write(json.dumps(reg2, indent=2))
    rc, out = run(root, "check"); check("a row with no size and no sizeNote is refused", rc == 1 and "beta: no size" in out, out)
    t0 = "# x\n\n## 1.1.0 \u00b7 API 1 \u00b7 2026-01-02\n- old a\n\n## 1.0.0 \u00b7 API 1 \u00b7 2026-01-01\n- first\n"
    t1 = V0.put_entry(t0, "1.1.0", "## 1.1.0 \u00b7 API 1 \u00b7 2026-01-03\n- new 2\n")
    check("set for an existing version replaces its entry, not a second copy", t1.count("## 1.1.0") == 1 and "- new 2" in t1 and "old a" not in t1 and "- first" in t1, t1)
    t2 = V0.put_entry(t0, "1.0.0", "## 1.0.0 \u00b7 API 1 \u00b7 2026-01-03\n- redo 1\n")
    check("replacing the last entry keeps the others", t2.count("## 1.0.0") == 1 and "old a" in t2 and t2.endswith("- redo 1\n"), t2)
    check("a new version still goes on top", V0.put_entry(t0, "1.2.0", "## 1.2.0 \u00b7 API 1 \u00b7 2026-01-03\n- n 3\n").index("1.2.0") < t0.index("1.1.0") + 30)
    check("faster range from A/B ratios (three corrected lines of 2026.10.31)", V0.faster_range("0.988,0.835,1.040") == "1 to 17% faster" and V0.faster_range("0.797 0.887") == "11 to 20% faster" and V0.faster_range("0.66,0.2") == "34 to 80% faster" and V0.faster_range("0.95") == "5% faster")
    rc, out = run(root, "set", "alpha", "2.4.2", "--ratios", "0.988,0.835", "--short", "Parsing is {faster}.", "--note", "Parsing is {faster} (laptop)."); check("set --ratios fills {faster}", rc == 0 and "Parsing is 1 to 17% faster." in r(root, "modules/alpha/CHANGELOG.md"), out + r(root, "modules/alpha/CHANGELOG.md")[:400])
    rc, out = run(root, "set", "alpha", "2.4.3", "--ratios", "0.9", "--short", "No placeholder.", "--note", "x"); check("--ratios without {faster} is refused", rc != 0 and "{faster}" in out, out)
    rc, out = run(root, "set", "alpha", "2.4.3", "--ratios", "1.02", "--short", "{faster}", "--note", "x"); check("--ratios with nothing under 1 is refused", rc != 0 and "nothing is faster" in out, out)
finally:
    shutil.rmtree(root, ignore_errors=True)
    shutil.rmtree(FULL, ignore_errors=True)
print("versions: " + ("%d FAILED" % fail if fail else "all checks passed"))
sys.exit(1 if fail else 0)
