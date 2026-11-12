#!/usr/bin/env python3
"""site checks for a single-game repo that publishes GitHub Pages.  Copyright (c) 2026 LFC Foundry. MIT License.

Run through docs-check.py (see its header) or directly. Standard library only, no browser, a few seconds.

  python3 tools/docs-check/docs-check.py --site PATH [--builds DIR] [--names FILE] [--sources FILE] [--test-major N] [--live]

PATH is a checkout of the repo (play/index.html, index.html, README.md, CHANGELOG.md, .github/workflows/pages.yml). Nothing in PATH is changed.
  --builds DIR       project folder holding sample-page/thumb-circuit-sample-vX.YY-*.html (check 2; skipped when the folder is not there)
  --names FILE       one name per line, kept OUTSIDE every repo (check 9); also read from the DOCS_CHECK_NAMES_FILE environment variable.
                     Only file and line are printed, never the name. Without a list the check is skipped and a note says so.
  --sources FILE     one phrase per line that a claim may cite (check 8, warnings only); without it the check is skipped
  --test-major N     the pre-release major version (default 7): its landing page must say "test build" (check 6)
  --live             fetch every local link on the Pages site and flag non-200 (check 7, network)

Checks: 1 version labels agree with the play page <title>; 2 newer build exists in the project folder; 3 screenshot caption and picture
versions; 4 changelog gaps; 5 dead links, missing assets and assets pages.yml does not publish; 6 test-build note; 7 live links;
8 numeric claims with no source (warning); 9 owner-name scan of every published file.
"""
import os, re, sys, glob, urllib.request

VER = r"v\d+\.\d+"

def vkey(v):
    return tuple(int(x) for x in v.lstrip("v").split("."))

class Site:
    def __init__(self, root):
        self.root = root
        self.errors = []
        self.warnings = []
        self.notes = []

    def path(self, p):
        return os.path.join(self.root, p)

    def has(self, p):
        return os.path.exists(self.path(p))

    def read(self, p):
        if not self.has(p):
            return ""
        with open(self.path(p), encoding="utf-8", errors="replace") as f:
            return f.read()

    def bad(self, m):
        self.errors.append(m)

    def warn(self, m):
        self.warnings.append(m)

    def note(self, m):
        self.notes.append(m)

def play_version(s):
    m = re.search(r"<title>[^<]*?(%s)" % VER, s.read("play/index.html"))
    return m.group(1) if m else None

def check_versions(s, pv, index, readme, changelog):   # 1
    if not pv:
        s.bad("play/index.html: no version in <title>")
        return
    for name, text in (("index.html", index), ("README.md", readme)):
        if not re.search(re.escape(pv) + r"\b", text):
            s.bad("%s: does not mention the play page version %s" % (name, pv))
    for m in re.finditer(r"<a\b[^>]*>([^<]*play[^<]*)</a>", index, re.I):   # the landing "Play" link label
        for v in re.findall(VER, m.group(1)):
            if v != pv:
                s.bad("index.html: the Play link says %s, play page is %s" % (v, pv))
    for name, text in (("index.html", index), ("README.md", readme)):   # badges
        for m in re.finditer(r"(?:badge|shields\.io)[^\s\"')>]*", text, re.I):
            for v in re.findall(r"v\d+(?:\.|%2E)\d+", m.group(0)):
                v = v.replace("%2E", ".")
                if v != pv:
                    s.bad("%s: a badge says %s, play page is %s" % (name, v, pv))
    for n, line in enumerate(readme.split("\n"), 1):   # the README status line
        if re.match(r"\s*(?:\*\*)?status\b", line, re.I):
            for v in re.findall(VER, line):
                if v != pv:
                    s.bad("README.md:%d: status line says %s, play page is %s" % (n, v, pv))
    top = re.search(r"(?m)^## (%s)" % VER, changelog)
    if not top or top.group(1) != pv:
        s.bad("CHANGELOG.md: top version is %s, play page is %s" % (top.group(1) if top else None, pv))

def check_lag(s, pv, builds):   # 2
    if not builds or not os.path.isdir(builds):
        s.note("newer-build check skipped (no project folder given or present)")
        return
    found = set()
    for f in glob.glob(os.path.join(builds, "sample-page", "thumb-circuit-sample-v*.html")) + glob.glob(os.path.join(builds, "thumb-circuit-sample-v*.html")):
        m = re.search(r"-sample-(%s)" % VER, os.path.basename(f))
        if m:
            found.add(m.group(1))
    if pv and found:
        newest = max(found, key=vkey)
        if vkey(newest) > vkey(pv):
            s.bad("newer build %s exists, live is %s" % (newest, pv))

def changelog_versions(changelog):
    return re.findall(r"(?m)^## (%s)" % VER, changelog)

def check_pictures(s, pv, index, changelog):   # 3
    cap = re.search(r"Screenshots of the (?:sample )?build (%s)" % VER, index)
    if not cap:
        s.bad("index.html: screenshot caption with a version is missing")
    elif pv and cap.group(1) != pv:
        s.bad("index.html: screenshots say %s, play page is %s" % (cap.group(1), pv))
    heads = changelog_versions(changelog)
    for ref in sorted(set(re.findall(r'src="([^"#?]+\.(?:png|jpe?g|webp|gif|svg))"', index))):
        m = re.search(r"(%s)" % VER, os.path.basename(ref))
        if not m or not pv or not heads:
            continue
        newer = [h for h in heads if vkey(h) > vkey(m.group(1)) and vkey(h) <= vkey(pv)]
        if len(newer) > 1:
            s.bad("index.html: picture %s is from %s, %d builds older than the play page" % (ref, m.group(1), len(newer)))

def check_gaps(s, pv, changelog):   # 4
    heads = changelog_versions(changelog)
    if not pv or not heads:
        return
    have = set(heads)
    lo = min(heads, key=vkey)
    miss = []
    for major in sorted(set(vkey(h)[0] for h in heads + [pv])):
        top = max([vkey(h)[1] for h in heads + [pv] if vkey(h)[0] == major])
        for m in range(0, top + 1):
            v = "v%d.%02d" % (major, m)
            if v not in have and vkey(v) >= vkey(lo) and vkey(v) <= vkey(pv):
                miss.append(v)
    if miss:
        s.bad("CHANGELOG.md: no line for %s (fine if the build did not change; otherwise add one)" % ", ".join(miss))

def local_refs(text):
    out = []
    for ref in re.findall(r'(?:href|src)="([^"#?]+)"', text) + re.findall(r"\]\(([^)#?\s]+)\)", text):
        if ref.startswith(("http:", "https:", "mailto:", "//", "data:", "javascript:")):
            continue
        out.append(ref)
    return sorted(set(out))

def check_links(s, index, readme):   # 5
    wf = s.read(".github/workflows/pages.yml")
    for name, text, base in (("index.html", index, ""), ("README.md", readme, "")):
        for ref in local_refs(text):
            p = ref[2:] if ref.startswith("./") else ref.lstrip("/")
            q = p + "index.html" if p.endswith("/") else p
            if not s.has(q) and not (s.has(p) and os.path.isdir(s.path(p))):
                s.bad("%s: link or image %s does not exist in the repo" % (name, ref))
                continue
            if name == "index.html" and wf:
                top_dir = p.split("/")[0]
                covered = ("cp " + q) in wf or ("cp " + p) in wf or ("cp -r " + top_dir) in wf or ("cp -r " + os.path.dirname(p)) in wf or (os.path.dirname(p) and (os.path.dirname(p) + "/") in wf)
                if not covered:
                    s.bad("index.html: %s is not copied by pages.yml, so it will 404 on the site" % ref)

def check_test_build(s, pv, index, major):   # 6
    if pv and vkey(pv)[0] == major and "test build" not in index.lower():
        s.bad("index.html: %s is a test build but the landing does not say so" % pv)

def check_live(s, index, name):   # 7
    base = "https://lfcfoundry.github.io/" + name
    for ref in local_refs(index):
        url = base + "/" + (ref[2:] if ref.startswith("./") else ref.lstrip("/"))
        try:
            code = urllib.request.urlopen(url, timeout=20).status
        except Exception as e:
            code = getattr(e, "code", "error")
        if code != 200:
            s.bad("live: %s returned %s" % (url, code))

def check_claims(s, index, readme, sources):   # 8 (warnings)
    if not sources or not os.path.exists(sources):
        s.note("claims check skipped (no --sources list)")
        return
    cites = [l.strip().lower() for l in open(sources, encoding="utf-8", errors="replace") if l.strip()]
    pat = re.compile(r"\b\d[\d,.]*\+?\s*(?:fps|fans|tracks|cars|players|ms|kb|mb)\b", re.I)
    for name, text in (("index.html", index), ("README.md", readme)):
        for n, line in enumerate(re.sub(r"<[^>]+>", " ", text).split("\n"), 1):
            for m in pat.finditer(line):
                if not any(c in line.lower() or c in m.group(0).lower() for c in cites):
                    s.warn("%s: claim %r has no source in the list" % (name, m.group(0).strip()))

def published_files(s):
    out = []
    for dp, dn, fn in os.walk(s.root):
        dn[:] = [d for d in dn if d not in (".git", "node_modules")]
        for n in fn:
            if n.lower().endswith((".html", ".md", ".txt", ".json", ".js", ".css", ".yml", ".svg")):
                out.append(os.path.join(dp, n))
    return out

def check_names(s, names_file):   # 9
    names_file = names_file or os.environ.get("DOCS_CHECK_NAMES_FILE")
    if not names_file or not os.path.exists(names_file):
        s.note("owner-name scan skipped (no list: pass --names FILE or set DOCS_CHECK_NAMES_FILE; keep the list outside the repo)")
        return
    names = [l.strip().lower() for l in open(names_file, encoding="utf-8", errors="replace") if l.strip() and not l.startswith("#")]
    for f in published_files(s):
        try:
            lines = open(f, encoding="utf-8", errors="replace").read().lower().split("\n")
        except OSError:
            continue
        for n, line in enumerate(lines, 1):
            if any(x in line for x in names):
                s.bad("%s:%d: matches a name on the private list (name not printed)" % (os.path.relpath(f, s.root), n))

def run_site(root, builds=None, names=None, sources=None, test_major=7, live=False):
    s = Site(os.path.abspath(root))
    index, readme, changelog = s.read("index.html"), s.read("README.md"), s.read("CHANGELOG.md")
    pv = play_version(s)
    check_versions(s, pv, index, readme, changelog)
    check_lag(s, pv, builds)
    check_pictures(s, pv, index, changelog)
    check_gaps(s, pv, changelog)
    check_links(s, index, readme)
    check_test_build(s, pv, index, test_major)
    if live:
        check_live(s, index, os.path.basename(s.root))
    check_claims(s, index, readme, sources)
    check_names(s, names)
    return s

def main(argv):
    def opt(name, default=None):
        return argv[argv.index(name) + 1] if name in argv else default
    s = run_site(opt("--site"), opt("--builds") or os.environ.get("DOCS_CHECK_BUILDS"), opt("--names"), opt("--sources"), int(opt("--test-major", 7)), "--live" in argv)
    for m in s.notes:
        print("site-check: note:", m)
    for m in s.warnings:
        print("site-check: warning:", m)
    for m in s.errors:
        print("site-check:", m)
    print("site-check: %d problem(s), %d warning(s)" % (len(s.errors), len(s.warnings)))
    return 1 if s.errors else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] if "--site" in sys.argv else ["--site", os.getcwd()] + sys.argv[1:]))
