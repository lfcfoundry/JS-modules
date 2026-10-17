#!/usr/bin/env python3
"""versions: one place for every module's and tool's version label.  Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/lfcfoundry/JS-modules

A label is a classic number plus an API number:   1.2.3 · API 1
  - 1.2.3: major.minor.patch. Patch = a fix, minor = a new option or feature that does not break anyone, major = something an existing user
    could trip over (an option removed or renamed, a result that now means something else).
  - API n: always equals the major number. It is shown on its own so that "can I drop in the new file?" reads as one small number:
    same API as your copy = safe, higher API = read the README first.

Every module and tool also has a CHANGELOG.md in its folder (newest entry first, plain words), and the root CHANGELOG.md lists the latest
version of each plus recent changes. Entries look like:   ## 1.2.0 · API 1 · 2026-10-16

The label lives in modules.json (the source of truth), and is copied by this script into the module's header comment (so a single copied
file carries it), the first lines of its README, the root README tables, the front page and llms.txt.

  python3 tools/versions/versions.py list                 print every label
  python3 tools/versions/versions.py check [--staged]     every copy agrees? (--staged: also warn when staged code has no new version)
  python3 tools/versions/versions.py set ID X.Y.Z --note "what changed, in plain words"
                                                          change one label everywhere and add its CHANGELOG.md entry
  python3 tools/versions/versions.py changelog            rebuild the root CHANGELOG.md
  python3 tools/versions/versions.py init                 first-time labels for entries that have none (1.0.0)

Run from anywhere inside the repository, or point it elsewhere with --root DIR (the tests do).
"""
import datetime, json, os, re, subprocess, sys

SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
HEAD_LINES = 15
SKIP_DIRS = ("test", "tests", "example", "examples", "fixtures", "node_modules", "__pycache__")


def load(root):
    with open(os.path.join(root, "modules.json"), encoding="utf-8") as f:
        return json.load(f)


def save(root, reg):
    with open(os.path.join(root, "modules.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps(reg, indent=2) + "\n")


def entries(reg):
    for kind in ("modules", "tools"):
        for e in reg.get(kind, []):
            yield kind, e


ENTRY = re.compile(r"^## (\d+\.\d+\.\d+) \u00b7 API (\d+) \u00b7 (\d{4}-\d{2}-\d{2})\s*$")
CL_INTRO = ("What changed in each version, newest first, in plain words. The numbers are explained in "
            "[tools/versions/README.md](%stools/versions/README.md): the API number goes up only when someone using an older copy could be affected.")
FIRST_NOTE = "First labeled version. Nothing in the code changed; everything under \"Before version labels\" is already in it."


def today():
    try:
        from zoneinfo import ZoneInfo
        return datetime.datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d")
    except Exception:
        return datetime.date.today().isoformat()


def changelog_rel(root, e):
    return entry_dir(e, root) + "/CHANGELOG.md"


def changelog_entries(text):
    """[(version, api, date, body)] from the labeled entries, newest first as written."""
    out, cur = [], None
    for line in text.split("\n"):
        m = ENTRY.match(line)
        if m:
            cur = [m.group(1), m.group(2), m.group(3), []]
            out.append(cur)
        elif line.startswith("## "):
            cur = None
        elif cur is not None:
            cur[3].append(line)
    return [(v, a, d, " ".join(x.strip() for x in b if x.strip())) for v, a, d, b in out]


def add_changelog_entry(root, e, v, note, date=None):
    rel = changelog_rel(root, e)
    entry = "## %s \u00b7 API %s \u00b7 %s\n%s\n" % (v, v.split(".")[0], date or today(), note.strip())
    path = os.path.join(root, rel)
    if os.path.exists(path):
        t = rd(root, rel)
        i = t.find("\n## ")
        t = (t[:i + 1] + entry + "\n" + t[i + 1:]) if i >= 0 else (t.rstrip("\n") + "\n\n" + entry)
    else:
        up = "../" * (entry_dir(e, root).count("/") + 1)
        t = "# %s changelog\n\n%s\n\n%s" % (e["id"], CL_INTRO % up, entry)
    wr(root, rel, t)


def root_changelog(root, reg):
    rows, recent = [], []
    for kind, e in entries(reg):
        rel = changelog_rel(root, e)
        rows.append("| [%s](%s) | %s | [changelog](%s) |" % (e["id"], os.path.dirname(rel) + "/README.md", label(e["version"]) if e.get("version") else "-", rel))
        if os.path.exists(os.path.join(root, rel)):
            for v, a, d, body in changelog_entries(rd(root, rel)):
                if not body.startswith("First labeled version"):
                    recent.append((d, e["id"], v, a, body))
    recent.sort(key=lambda r: (r[0], r[1], r[2]), reverse=True)
    lines = ["# Changelog", "",
             "Every module and tool keeps its own `CHANGELOG.md` (in its folder), newest first, in plain words. This page lists where each one stands and the "
             "changes made since version labels began on 2026-10-16. Older history is in each module's changelog under \"Before version labels\".", "",
             "How to read a label: `1.2.3 \u00b7 API 1`. The API number goes up only when someone using an older copy could be affected; see [tools/versions/README.md](tools/versions/README.md).", "",
             "| Module or tool | Version | History |", "|---|---|---|"] + rows + ["", "## Changes since labels began", ""]
    lines += ["- %s \u00b7 **%s** %s \u00b7 API %s: %s" % r for r in recent] or ["- (none yet)"]
    return "\n".join(lines) + "\n"


def label(v):
    return "%s · API %s" % (v, v.split(".")[0])


def rd(root, rel):
    with open(os.path.join(root, rel), encoding="utf-8") as f:
        return f.read()


def wr(root, rel, text):
    with open(os.path.join(root, rel), "w", encoding="utf-8", newline="") as f:
        f.write(text)


def entry_dir(e, root="."):
    if "folder" in e:
        return e["folder"].rstrip("/")
    return e["file"].rstrip("/") if os.path.isdir(os.path.join(root, e["file"])) else os.path.dirname(e["file"])


def source_files(root, e, kind):
    """The shipped source files whose header must carry the label: a module's own file(s). Tools: any file that already has a Version line."""
    d = entry_dir(e, root)
    full = os.path.join(root, d)
    if not os.path.isdir(full):
        return []
    out = []
    for n in sorted(os.listdir(full)):
        p = os.path.join(full, n)
        if os.path.isfile(p) and n.endswith((".js", ".py")) and not n.startswith("test"):
            out.append(os.path.join(d, n))
    if kind == "modules":
        return out
    # tools: only files that already carry a version line
    return [f for f in out if header_version(rd(root, f))]


def header_version(text):
    for line in text.splitlines()[:HEAD_LINES]:
        m = re.search(r"\bVersion (\d+(?:\.\d+)+)(?: \(API (\d+)\))?", line)
        if m:
            return m.group(1), m.group(2)
    return None


def set_header(text, v):
    """Put 'Version X (API N)' in the header comment; replace an existing version line, never touch the body."""
    new = "Version %s (API %s)" % (v, v.split(".")[0])
    lines = text.split("\n")
    for i, line in enumerate(lines[:HEAD_LINES]):
        if re.search(r"\bVersion \d+(?:\.\d+)+(?: \(API \d+\))?", line):
            lines[i] = re.sub(r"\bVersion \d+(?:\.\d+)+(?: \(API \d+\))?", new, line)
            return "\n".join(lines)
    # a one-line /* ... */ header: add the label inside it
    if lines and lines[0].startswith("/*") and lines[0].rstrip().endswith("*/"):
        lines[0] = lines[0].rstrip()[:-2].rstrip() + " " + new + " */"
        return "\n".join(lines)
    for i, line in enumerate(lines[:HEAD_LINES]):
        if "Copyright (c) 2026 LFC Foundry" in line:
            if line.lstrip().startswith("*"):
                pad = line[:len(line) - len(line.lstrip())]
                lines.insert(i + 1, pad + "* " + new)
            elif line.lstrip().startswith("#"):
                lines.insert(i + 1, "# " + new)
            else:
                lines.insert(i + 1, "   " + new)
            return "\n".join(lines)
    return text


README_LINE = re.compile(r"^\*\*Version \d+\.\d+\.\d+ · API \d+\*\*$")


def set_readme(text, v):
    lines = text.split("\n")
    stamp = "**Version %s**" % label(v)
    for i, line in enumerate(lines[:8]):
        if README_LINE.match(line):
            lines[i] = stamp
            return "\n".join(lines)
    for i, line in enumerate(lines[:5]):
        if line.startswith("# "):
            lines[i + 1:i + 1] = ["", stamp]
            return "\n".join(lines)
    return stamp + "\n\n" + text


def readme_version(text):
    for line in text.split("\n")[:8]:
        m = re.match(r"^\*\*Version (\d+\.\d+\.\d+) · API (\d+)\*\*$", line)
        if m:
            return m.group(1), m.group(2)
    return None


def set_root_readme(text, reg):
    """Add or refresh a Version column in the root README's module and tool tables."""
    ver = {e["id"]: e.get("version") for _, e in entries(reg)}
    out, lines = [], text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        if re.match(r"^\| (Module|Tool) \|", line) and i + 1 < len(lines) and lines[i + 1].startswith("|---"):
            hdr, sep = line, lines[i + 1]
            if not hdr.rstrip().endswith("| Version |"):
                hdr += " Version |"
                sep += "---|"
            out += [hdr, sep]
            i += 2
            while i < len(lines) and lines[i].startswith("| ["):
                row = lines[i]
                m = re.match(r"^\| \[([a-z0-9-]+)\]\(", row)
                v = ver.get(m.group(1)) if m else None
                row = re.sub(r" \d+\.\d+\.\d+ · API \d+ \|$", "", row) if row.rstrip().endswith("|") and re.search(r" \d+\.\d+\.\d+ · API \d+ \|$", row) else row
                if v:
                    row = row.rstrip() + " " + label(v) + " |"
                out.append(row)
                i += 1
            continue
        out.append(line)
        i += 1
    return "\n".join(out)


def set_index(text, reg):
    for _, e in entries(reg):
        v = e.get("version")
        if not v:
            continue
        pat = re.compile(r'(<li id="[mt]-%s">.*?<b>%s</b></a>)(?: <small class="v">[^<]*</small>)?' % (re.escape(e["id"]), re.escape(e["id"])))
        text = pat.sub(lambda m: m.group(1) + ' <small class="v">' + label(v) + "</small>", text, count=1)
    return text


def set_llms(text, reg):
    lines = text.split("\n")
    for k, line in enumerate(lines):
        m = re.match(r"^- \[([a-z0-9-]+)\]\(", line)
        if not m:
            continue
        e = next((x for _, x in entries(reg) if x["id"] == m.group(1)), None)
        if not e or not e.get("version"):
            continue
        line = re.sub(r" Version \d+\.\d+\.\d+, API \d+\.$", "", line)
        lines[k] = "%s Version %s, API %s." % (line, e["version"], e["version"].split(".")[0])
    return "\n".join(lines)


def apply(root, reg):
    """Write the registry's labels into every other place."""
    for kind, e in entries(reg):
        v = e.get("version")
        if not v:
            continue
        e["api"] = int(v.split(".")[0])
        for f in source_files(root, e, kind):
            t = rd(root, f)
            n = set_header(t, v)
            if n != t:
                wr(root, f, n)
        rp = e.get("readme")
        if rp and os.path.exists(os.path.join(root, rp)):
            t = rd(root, rp)
            n = set_readme(t, v)
            if n != t:
                wr(root, rp, n)
    wr(root, "CHANGELOG.md", root_changelog(root, reg))
    for rel, fn in (("README.md", set_root_readme), ("index.html", set_index), ("llms.txt", set_llms)):
        if os.path.exists(os.path.join(root, rel)):
            t = rd(root, rel)
            n = fn(t, reg)
            if n != t:
                wr(root, rel, n)
    # keep "version" and "api" next to the id in modules.json
    for _, e in entries(reg):
        if "version" in e:
            rest = {k: val for k, val in e.items() if k not in ("id", "version", "api")}
            items = [("id", e["id"]), ("version", e["version"]), ("api", e["api"])] + list(rest.items())
            e.clear()
            e.update(items)
    save(root, reg)


def check(root, reg):
    bad = []
    for kind, e in entries(reg):
        i, v = e["id"], e.get("version")
        if not v or not SEMVER.match(v):
            bad.append("%s: no valid version in modules.json (expected like 1.2.3)" % i)
            continue
        if e.get("api") != int(v.split(".")[0]):
            bad.append("%s: api is %r but the major number of %s is %s" % (i, e.get("api"), v, v.split(".")[0]))
        for f in source_files(root, e, kind):
            h = header_version(rd(root, f))
            if not h:
                bad.append("%s: %s has no 'Version X.Y.Z (API N)' line in its first %d lines" % (i, f, HEAD_LINES))
            elif h[0] != v or h[1] != str(v.split(".")[0]):
                bad.append("%s: %s says %s (API %s) but modules.json says %s" % (i, f, h[0], h[1], v))
            m = re.search(r"\bversion:\s*'(\d+\.\d+\.\d+)'", rd(root, f))   # a module that also exposes its version in code (sprite-baker)
            if m and m.group(1) != v:
                bad.append("%s: %s exposes version '%s' in code but modules.json says %s" % (i, f, m.group(1), v))
        cl = changelog_rel(root, e)
        if not os.path.exists(os.path.join(root, cl)):
            bad.append("%s: %s is missing" % (i, cl))
        else:
            ce = changelog_entries(rd(root, cl))
            if not ce or ce[0][0] != v:
                bad.append("%s: the newest entry in %s is %s, but modules.json says %s (run versions.py set ID %s --note \"...\")" % (i, cl, ce[0][0] if ce else "missing", v, v))
        rp = e.get("readme")
        if rp:
            h = readme_version(rd(root, rp))
            if not h or h[0] != v:
                bad.append("%s: %s has %s but modules.json says %s" % (i, rp, "no version line" if not h else h[0], v))
        for rel, pat in (("index.html", '<small class="v">%s</small>' % label(v)), ("llms.txt", "Version %s, API %s." % (v, v.split(".")[0]))):
            p = os.path.join(root, rel)
            if os.path.exists(p) and e["id"] in rd(root, rel) and pat not in rd(root, rel):
                bad.append("%s: %s does not show %s" % (i, rel, label(v)))
        t = rd(root, "README.md")
        if re.search(r"^\| \[%s\]\(" % re.escape(i), t, re.M) and (" " + label(v) + " |") not in t:
            bad.append("%s: the README table does not show %s" % (i, label(v)))
    if os.path.exists(os.path.join(root, "CHANGELOG.md")):
        if rd(root, "CHANGELOG.md") != root_changelog(root, reg):
            bad.append("CHANGELOG.md (the root one) is out of date: run versions.py changelog")
    else:
        bad.append("CHANGELOG.md (the root one) is missing: run versions.py changelog")
    return bad


def staged_warnings(root, reg):
    """Staged shipped-code changes with no new version for that module or tool (warning only)."""
    try:
        names = subprocess.check_output(["git", "-C", root, "-c", "core.quotePath=false", "diff", "--cached", "--name-only", "--diff-filter=ACMR"], text=True).split("\n")
        old = json.loads(subprocess.check_output(["git", "-C", root, "show", "HEAD:modules.json"], text=True, stderr=subprocess.DEVNULL))
    except Exception:
        return []
    oldv = {e["id"]: e.get("version") for _, e in entries(old)}
    warn = []
    for kind, e in entries(reg):
        d = entry_dir(e, root) + "/"
        code = [n for n in names if n.startswith(d) and n.endswith((".js", ".py", ".html", ".sh", ".css", ".c"))
                and not any(("/" + s + "/") in ("/" + n[len(d):]) for s in SKIP_DIRS)
                and os.path.basename(n) not in ("demo.html",)]
        if code and e.get("version") == oldv.get(e["id"]):
            warn.append("%s changed (%s) but its version is still %s: run  python3 tools/versions/versions.py set %s X.Y.Z" % (e["id"], os.path.basename(code[0]), e.get("version"), e["id"]))
    return warn


def find_root(start):
    d = os.path.abspath(start)
    while True:
        if os.path.exists(os.path.join(d, "modules.json")):
            return d
        n = os.path.dirname(d)
        if n == d:
            sys.exit("versions: no modules.json found above " + start)
        d = n


def main(argv):
    root = None
    if "--root" in argv:
        k = argv.index("--root")
        root = argv[k + 1]
        del argv[k:k + 2]
    root = root or find_root(os.getcwd())
    cmd = argv[0] if argv else "list"
    reg = load(root)
    if cmd == "list":
        for kind, e in entries(reg):
            print("%-18s %-8s %s" % (e["id"], kind[:-1], label(e["version"]) if e.get("version") else "(no version)"))
        return 0
    if cmd == "check":
        bad = check(root, reg)
        for b in bad:
            print("versions: " + b, file=sys.stderr)
        if "--staged" in argv:
            for w in staged_warnings(root, reg):
                print("versions (warning, not blocking): " + w, file=sys.stderr)
                if os.environ.get("HOOKS_VERSION_STRICT") == "1":
                    bad.append(w)
        if bad or "--staged" not in argv:
            print("versions: all labels agree." if not bad else "versions: %d problem(s)." % len(bad))
        return 1 if bad else 0
    if cmd == "set":
        note = None
        if "--note" in argv:
            k = argv.index("--note")
            note = " ".join(argv[k + 1:]).strip()
            argv = argv[:k]
        if len(argv) != 3 or not SEMVER.match(argv[2]) or not note:
            sys.exit('usage: versions.py set ID X.Y.Z --note "what changed, in plain words"')
        e = next((x for _, x in entries(reg) if x["id"] == argv[1]), None)
        if not e:
            sys.exit("versions: no module or tool called " + argv[1])
        e["version"] = argv[2]
        add_changelog_entry(root, e, argv[2], note)
        apply(root, reg)
        print("%s is now %s (changelog entry added)" % (argv[1], label(argv[2])))
        return 0
    if cmd == "changelog":
        wr(root, "CHANGELOG.md", root_changelog(root, reg))
        print("CHANGELOG.md written")
        return 0
    if cmd == "init":
        n = 0
        for _, e in entries(reg):
            if not e.get("version"):
                e["version"] = "1.0.0"
                n += 1
                if not os.path.exists(os.path.join(root, changelog_rel(root, e))):
                    add_changelog_entry(root, e, "1.0.0", FIRST_NOTE, "2026-10-16")
        apply(root, reg)
        print("labelled %d entries" % n)
        return 0
    sys.exit(__doc__)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
