#!/usr/bin/env python3
"""docs-check: catches the docs drift people used to find by hand.  Copyright (c) 2026 LFC Foundry. MIT License.

One command, a few seconds, no browser, standard library only:

  python3 tools/docs-check/docs-check.py            run every check, print problems, exit 1 if any
  python3 tools/docs-check/docs-check.py --terser PATH   use this terser binary for the minified-size check (default: terser on PATH,
                                                         or node_modules/.bin/terser; the check is skipped when none is found)

Checks:
  1. every line of every module CHANGELOG.md is at most 240 characters
  2. the README opening size claim ("N KB gzipped (M KB minified and gzipped)") matches the shipped file (gzip -9; terser 5 -c passes=2 -m)
  3. every module README has "What it is and how it works" first and "Why it exists" second
  4. every tester page that has a Run button also has a Copy results button
"""
import gzip, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
problems = []

def bad(msg):
    problems.append(msg)

def read(p):
    with open(os.path.join(ROOT, p), encoding="latin-1") as f:
        return f.read()

def terser_path():
    if "--terser" in sys.argv:
        return sys.argv[sys.argv.index("--terser") + 1]
    for cand in (os.path.join(ROOT, "node_modules", ".bin", "terser"), "/tmp/cmp/node_modules/.bin/terser"):
        if os.path.exists(cand):
            return cand
    from shutil import which
    return which("terser")

def modules():
    m = json.load(open(os.path.join(ROOT, "modules.json"), encoding="latin-1"))
    m = m.get("modules", m)
    return m if isinstance(m, list) else list(m.values())

def check_changelogs(ms):
    for x in ms:
        p = os.path.join("modules", x["id"], "CHANGELOG.md")
        if not os.path.exists(os.path.join(ROOT, p)):
            continue
        for n, line in enumerate(read(p).split("\n"), 1):
            if len(line) > 240:
                bad("%s:%d changelog line is %d characters (limit 240)" % (p, n, len(line)))

def check_sizes(ms):
    terser = terser_path()
    for x in ms:
        f = x.get("file")
        if not f or not os.path.exists(os.path.join(ROOT, f)):
            continue
        r = read(x["readme"])
        head = r[:r.find("## Why it exists")] if "## Why it exists" in r else r[:3000]
        mm = re.search(r"([\d.]+) KB gzipped(?: \(([\d.]+) KB minified and gzipped\))?", head)
        if not mm:
            continue
        mn = re.match(r"\s*(?:as|for|in|of)\s+`?([\w.-]+\.min\.js)", head[mm.end():])   # "3.1 KB gzipped as `x.min.js`" 
        if mn and os.path.exists(os.path.join(os.path.dirname(os.path.join(ROOT, f)), mn.group(1))):
            f = os.path.join(os.path.dirname(f), mn.group(1))   # the claim is about the shipped .min.js file
        raw = open(os.path.join(ROOT, f), "rb").read()
        gz = len(gzip.compress(raw, 9)) / 1024
        if abs(float(mm.group(1)) - gz) > 0.6:
            bad("%s: opening line says %s KB gzipped, the file is %.1f KB" % (x["readme"], mm.group(1), gz))
        if mm.group(2) and terser:
            out = subprocess.run([terser, os.path.join(ROOT, f), "-c", "passes=2", "-m"], capture_output=True, timeout=120).stdout
            mg = len(gzip.compress(out, 9)) / 1024
            if abs(float(mm.group(2)) - mg) > 0.6:
                bad("%s: opening line says %s KB minified and gzipped, it is %.1f KB" % (x["readme"], mm.group(2), mg))

def check_order(ms):
    for x in ms:
        heads = [h for h in re.findall(r"^## (.+)$", read(x["readme"]), re.M)]
        if heads[:2] != ["What it is and how it works", "Why it exists"]:
            bad("%s: first sections are %r, expected What it is and how it works, then Why it exists" % (x["readme"], heads[:2]))

def check_testers():
    for dp, dn, fn in os.walk(ROOT):
        if "/.git" in dp or "node_modules" in dp:
            continue
        for n in fn:
            if not n.endswith(".html") or n.endswith(".src.html") or n == "index.html":
                continue
            p = os.path.relpath(os.path.join(dp, n), ROOT)
            t = read(p)
            if re.search(r">(Run the (test|check)|Check this device|Run test)<", t) and "Copy results" not in t and "Copy report" not in t:
                bad("%s: has a Run button but no Copy results button" % p)

def main():
    ms = modules()
    check_changelogs(ms)
    check_sizes(ms)
    check_order(ms)
    check_testers()
    for p in problems:
        print("docs-check:", p)
    print("docs-check: %d problem(s)" % len(problems))
    sys.exit(1 if problems else 0)

main()
