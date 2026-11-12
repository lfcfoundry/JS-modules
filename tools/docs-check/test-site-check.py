#!/usr/bin/env python3
"""Self-test for site_check.py: a good fixture passes, and each broken variant is caught.  Copyright (c) 2026 LFC Foundry. MIT License.
Run: python3 tools/docs-check/test-site-check.py   (a second, no network, standard library only)"""
import os, sys, tempfile, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import site_check

GOOD = {
 "play/index.html": "<html><head><title>Thumb Circuit v7.03</title></head></html>",
 "index.html": '<p>test build</p><a href="play/">Play v7.03</a><h2>Screenshots of the sample build v7.03</h2><img src="docs/img/shot-v7.03.png"><a href="README.md">r</a>',
 "README.md": "Status: v7.03 test build\n[play](play/)\n",
 "CHANGELOG.md": "## v7.03\nx\n## v7.02\nx\n## v7.01\nx\n## v7.00\nx\n",
 "docs/img/shot-v7.03.png": "x",
 ".github/workflows/pages.yml": "cp -r play _site/play\ncp -r docs _site/docs\ncp README.md _site/\n",
}
def make(over):
    d = tempfile.mkdtemp()
    f = dict(GOOD); f.update(over)
    for p, t in f.items():
        if t is None: continue
        os.makedirs(os.path.dirname(os.path.join(d, p)) or d, exist_ok=True)
        open(os.path.join(d, p), "w").write(t)
    return d
def errs(over, **kw):
    d = make(over)
    try: return site_check.run_site(d, **kw).errors
    finally: shutil.rmtree(d)
fails = []
def expect(name, e, frag):
    ok = (frag is None and not e) or (frag is not None and any(frag in x for x in e))
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else ": " + repr(e)))
    if not ok: fails.append(name)
expect("good fixture", errs({}), None)
expect("play version lags landing", errs({"play/index.html": "<title>T v7.04</title>"}), "does not mention the play page version v7.04")
expect("Play link label old", errs({"index.html": GOOD["index.html"].replace("Play v7.03", "Play v7.02")}), "Play link says v7.02")
expect("badge old", errs({"README.md": GOOD["README.md"] + "![b](https://img.shields.io/badge/build-v7.02-blue)\n"}), "badge says v7.02")
expect("status line old", errs({"README.md": "Status: v7.02 test build\nv7.03\n"}), "status line says v7.02")
expect("changelog top old", errs({"CHANGELOG.md": "## v7.02\n## v7.01\n"}), "top version is v7.02")
expect("changelog gap", errs({"CHANGELOG.md": "## v7.03\n## v7.00\n"}), "no line for v7.01, v7.02")
expect("caption old", errs({"index.html": GOOD["index.html"].replace("sample build v7.03", "sample build v7.01")}), "screenshots say v7.01")
expect("picture two builds old", errs({"index.html": GOOD["index.html"].replace("shot-v7.03", "shot-v7.01"), "docs/img/shot-v7.01.png": "x"}), "builds older")
expect("dead link", errs({"index.html": GOOD["index.html"] + '<a href="nope.html">x</a>'}), "does not exist")
expect("asset not published", errs({"index.html": GOOD["index.html"] + '<img src="extra/a.png">', "extra/a.png": "x"}), "not copied by pages.yml")
expect("no test-build note", errs({"index.html": GOOD["index.html"].replace("test build", "beta")}), "does not say so")
d = tempfile.mkdtemp(); nf = os.path.join(d, "names.txt"); open(nf, "w").write("zzprivatename\n")
expect("name scan hit", errs({"README.md": GOOD["README.md"] + "by ZZPrivateName\n"}, names=nf), "private list")
expect("name scan clean", errs({}, names=nf), None)
b = tempfile.mkdtemp(); os.makedirs(os.path.join(b, "sample-page")); open(os.path.join(b, "sample-page", "thumb-circuit-sample-v7.09-x.html"), "w").write("x")
expect("newer build exists", errs({}, builds=b), "newer build v7.09 exists, live is v7.03")
shutil.rmtree(d); shutil.rmtree(b)
print("site-check self-test: %d failure(s)" % len(fails)); sys.exit(1 if fails else 0)
