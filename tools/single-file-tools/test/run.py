"""Checks for single-file-tools, no browser needed.  Copyright (c) 2026 LFC Foundry. MIT License.
Run: python3 tools/single-file-tools/test/run.py
Needs Python 3. The font checks need the fontTools module (pip install fonttools; they use woff2 if the brotli module is installed,
otherwise woff, and say so). The SVG checks and the loader checks need Node.js; the SVG checks use the real svgo when it can be found
(npm i svgo) and otherwise a small stand-in that only marks each picture it was given, which still tests which pictures get handed over.
Cases whose tools are missing are skipped with a message saying what to install. SFT_DIR=/path points the run at another copy of the tools.

What is built: a small fixture page with an embedded test font (made on the fly), CSS escapes, a JavaScript surrogate pair, several SVG pictures
(one before, one after the biggest script, strings that look like SVG inside scripts) and a comment. Then each tool runs on it."""
import base64, gzip, html.parser, io, json, os, pathlib, re, shutil, subprocess, sys, tempfile

HERE = pathlib.Path(os.environ.get("SFT_DIR") or pathlib.Path(__file__).resolve().parent.parent)
sys.path.insert(0, str(HERE))
NODE = shutil.which("node")
TMP = pathlib.Path(tempfile.mkdtemp(prefix="sft-"))
passed = failed = skipped = 0


def check(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print("ok   " + name)
    except BaseException as e:
        failed += 1
        print("FAIL " + name + "\n       " + (str(e) or type(e).__name__)[:400])


def skip(name, why):
    global skipped
    skipped += 1
    print("skip " + name + " (" + why + ")")


try:
    import fontTools  # noqa: F401
    HAVE_FT = True
except ImportError:
    HAVE_FT = False
try:
    import brotli  # noqa: F401
    HAVE_BROTLI = True
except ImportError:
    HAVE_BROTLI = False
FMT = "woff2" if HAVE_BROTLI else "woff"


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


# ---- the fixture -------------------------------------------------------------------------------------------------------------------------
CHARS = list(range(0x41, 0x5b)) + [0x20, 0xe9, 0x416, 0x2605, 0x2665, 0x1F600, 0x263A]


def make_font(copyright_text, license_text, license_url, family="TestFont"):
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    names = [".notdef"] + ["g%X" % c for c in CHARS]
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap({c: "g%X" % c for c in CHARS})
    pen = TTGlyphPen(None); pen.moveTo((0, 0)); pen.lineTo((0, 500)); pen.lineTo((500, 500)); pen.lineTo((500, 0)); pen.closePath()
    box = pen.glyph()
    fb.setupGlyf({n: box for n in names})
    fb.setupHorizontalMetrics({n: (600, 0) for n in names})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": family, "styleName": "Regular", "copyright": copyright_text, "licenseDescription": license_text, "licenseInfoURL": license_url})
    fb.setupOS2(); fb.setupPost()
    out = io.BytesIO(); fb.save(out)
    return out.getvalue()


OFL_COPY = "Copyright 2020 The Test Authors (https://example.org) with Reserved Font Name Testy"
OFL_TEXT = "This Font Software is licensed under the SIL Open Font License, Version 1.1."
OFL_URL = "https://openfontlicense.org"


def fixture(font_bytes):
    b64 = base64.b64encode(font_bytes).decode()
    big = "var pad=[" + ",".join(str(i) for i in range(1500)) + "];var pic='<svg id=\"in-big-script\" width=\"2\"><g/></svg>';"
    return (
        '<!doctype html><meta charset="utf-8"><title>fixture</title>\n'
        "<style>@font-face{font-family:'TestFont';src:url(data:font/ttf;base64," + b64 + ") format('truetype')}\n"
        'body{font-family:\'TestFont\'}.star::before{content:"\\2605"}</style>\n'
        '<svg id="top" width="10" height="10"><defs><linearGradient id="g1"><stop offset="0" stop-color="#ff0000"/></linearGradient></defs>'
        '<rect id="r1" width="10" height="10" fill="url(#g1)"/></svg>\n'
        '<script>var small=\'<svg id="in-small-script" width="1"><rect/></svg>\';var face="\\uD83D\\uDE00";var e="\\u00e9";</script>\n'
        "<p class=star>Hello \u00e9 BCD</p>\n"
        "<script>/* the biggest script */" + big + "</script>\n"
        '<svg id="after" width="20" height="20"><rect id="r2" width="20" height="20" style="fill:#00ff00"></rect></svg>\n'
        '<!-- <svg id="in-comment" width="3"></svg> -->\n').encode("utf-8")


def font_cmaps(page_text):
    from fontTools.ttLib import TTFont
    out = []
    for b in re.findall(r"base64,([A-Za-z0-9+/=]+)", page_text):
        f = TTFont(io.BytesIO(base64.b64decode(b)))
        out.append(f)
    return out


# ---- optfonts.py ---------------------------------------------------------------------------------------------------------------------------
if not HAVE_FT:
    for n in ("optfonts keeps CSS-escape and surrogate-pair glyphs", "optfonts keeps the copyright and license records and warns for the OFL"):
        skip(n, "fontTools is not installed: pip install fonttools")
else:
    try:
        import optfonts
    except BaseException:   # an older copy runs its command line on import
        optfonts = None

    def t_collect():
        c = optfonts.collect_chars('a \\2605 b \\1F4A9 c \\uD83D\\uDE00 \\u00e9 \\u{1F4A8} &eacute; \\xe8 &#x263A; \u00f1')
        for want in (0x2605, 0x1F4A9, 0x1F600, 0xe9, 0x1F4A8, 0xe8, 0x263A, 0xf1, 0x41, 0x20):
            assert want in c, "missing U+%X" % want
        assert not (c & set(range(0xD800, 0xE000))), "a lone surrogate was collected"
        assert 0x2665 not in c and 0x416 not in c
        assert 0x1F600 not in optfonts.collect_chars("plain text \\uD83D only"), "a lone high surrogate must not make an emoji"

    check("collect_chars reads CSS escapes, surrogate pairs, \\u{...}, \\xNN and entities", t_collect)

    FONT = make_font(OFL_COPY, OFL_TEXT, OFL_URL)
    src = TMP / "page.html"; src.write_bytes(fixture(FONT))

    def run_optfonts(srcfile, dst, *extra):
        return run([sys.executable, str(HERE / "optfonts.py"), str(srcfile), str(dst), "--report", "--format", FMT, *extra])

    def t_glyphs():
        dst = TMP / "page.fonts.html"
        r = run_optfonts(src, dst); assert r.returncode == 0, r.stderr[-400:]
        out = dst.read_text(encoding="utf-8")
        f = font_cmaps(out)[0]; cm = f.getBestCmap()
        for want in (0x2605, 0x1F600, 0xe9, 0x41, 0x42):
            assert want in cm, "glyph U+%X was dropped" % want
        for gone in (0x416, 0x2665, 0x263A):
            assert gone not in cm, "unused glyph U+%X was kept" % gone
        assert re.search(r"font-family:\s*'TestFont'", out) and "format('truetype')" in out
        assert out.count("<svg") == fixture(FONT).decode().count("<svg"), "markup changed"
        assert "characters kept" in r.stdout

    check("optfonts keeps CSS-escape (\\2605) and surrogate-pair (\\uD83D\\uDE00) glyphs and drops unused ones [%s]" % FMT, t_glyphs)

    def t_license():
        dst = TMP / "page.fonts.html"
        r = run_optfonts(src, dst); assert r.returncode == 0, r.stderr[-400:]
        out = dst.read_text(encoding="utf-8")
        f = font_cmaps(out)[0]
        n0, n13 = f["name"].getDebugName(0), f["name"].getDebugName(13)
        assert n0 and "Test Authors" in n0, "copyright record (name ID 0) was dropped: %r" % n0
        assert n13 and "Open Font License" in n13, "license record (name ID 13) was dropped: %r" % n13
        assert "/*! Font: TestFont." in out and "Open Font License" in out.split("@font-face")[0][-700:], "no notice comment before the @font-face rule"
        assert "*/" in out.split("@font-face")[0] and out.split("@font-face")[0].count("*/") == out.split("@font-face")[0].count("/*")
        assert "SIL Open Font License" in r.stderr and "WARNING" in r.stderr, "no OFL warning: " + r.stderr
        assert "Reserved Font Name (Testy)" in r.stderr, r.stderr
        src2 = TMP / "mit.html"; src2.write_bytes(fixture(make_font("Copyright 2021 Someone", "MIT License", "https://opensource.org/licenses/MIT")))
        r2 = run_optfonts(src2, TMP / "mit.out.html"); assert r2.returncode == 0
        assert "Open Font License" not in r2.stderr and "WARNING" not in r2.stderr, "a non-OFL font got an OFL warning: " + r2.stderr
        src3 = TMP / "nolic.html"; src3.write_bytes(fixture(make_font("", "", "")))
        r3 = run_optfonts(src3, TMP / "nolic.out.html"); assert "no copyright or license" in r3.stderr, r3.stderr

    check("optfonts keeps name IDs 0 and 13, writes a notice comment, warns for the OFL (and only then)", t_license)

    def t_extra():
        dst = TMP / "extra.html"
        r = run_optfonts(src, dst, "--extra", "\u0416"); assert r.returncode == 0
        assert 0x416 in font_cmaps(dst.read_text(encoding="utf-8"))[0].getBestCmap(), "--extra no longer keeps a glyph"

    check("optfonts --extra still keeps a glyph", t_extra)

    def t_nobrotli():
        if HAVE_BROTLI:
            return
        r = run([sys.executable, str(HERE / "optfonts.py"), str(src), str(TMP / "x.html")])
        assert r.returncode != 0 and "brotli" in (r.stderr + r.stdout), r.stderr[-300:]

    if not HAVE_BROTLI:
        check("without brotli, optfonts says what to install instead of a traceback", t_nobrotli)
        print("note: brotli is not installed, so the font checks ran with --format woff instead of woff2")


# ---- optsvg.js -----------------------------------------------------------------------------------------------------------------------------
class Counter(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(); self.open = self.close = 0
    def handle_starttag(self, t, a):
        self.open += t == "svg"
    def handle_endtag(self, t):
        self.close += t == "svg"


def script_bodies(t):
    return re.findall(r"<script[^>]*>(.*?)</script>", t, re.S)


if not NODE:
    skip("optsvg.js", "Node.js not found")
else:
    STUB = TMP / "stub" / "node_modules" / "svgo"; STUB.mkdir(parents=True)
    (STUB / "index.js").write_text("exports.optimize=function(s){return {data:s.replace(/\\s+/g,' ').replace('<svg','<svg data-opt=\"1\"')}};")
    real = run([NODE, "-e", "require.resolve('svgo')"], cwd=str(HERE))
    HAVE_SVGO = real.returncode == 0
    page = fixture(make_font("c", "l", "u") if HAVE_FT else b"x").decode("utf-8")
    sp = TMP / "svg.html"; sp.write_text(page, encoding="utf-8")

    def svg_run(dst, *extra, stub=True):
        env = dict(os.environ)
        if stub:
            env["NODE_PATH"] = str(TMP / "stub" / "node_modules")
        return run([NODE, str(HERE / "optsvg.js"), str(sp), str(dst), *extra], env=env)

    def t_svg_logic():
        dst = TMP / "svg.out.html"
        r = svg_run(dst, "--report"); assert r.returncode == 0, r.stderr[-300:]
        out = dst.read_text(encoding="utf-8")
        assert out.count('data-opt="1"') == 2, "expected the two markup pictures to be handed to svgo, got %d" % out.count('data-opt="1"')
        i_after = out.index('id="after"'); assert 'data-opt="1"' in out[i_after - 40:i_after + 5] or 'data-opt="1"' in out[out.rfind("<svg", 0, i_after):i_after], "the picture after the biggest script was skipped"
        assert script_bodies(out) == script_bodies(page), "a script was rewritten"
        assert "<!-- <svg id=\"in-comment\" width=\"3\"></svg> -->" in out, "a comment was rewritten"
        assert "picture 1" in r.stdout and "picture 2" in r.stdout, "--report prints nothing: " + r.stdout
        c = Counter(); c.feed(out); assert c.open == c.close == 2

    check("optsvg: pictures after the largest script are handled, scripts and comments are left alone, --report works", t_svg_logic)

    def t_svg_nested():
        nested = '<p>a</p><svg id="o" width="9"><svg id="i" width="1"></svg><rect/></svg><p>b</p>'
        sp2 = TMP / "nested.html"; sp2.write_text(nested, encoding="utf-8")
        env = dict(os.environ, NODE_PATH=str(TMP / "stub" / "node_modules"))
        r = run([NODE, str(HERE / "optsvg.js"), str(sp2), str(TMP / "nested.out.html")], env=env); assert r.returncode == 0, r.stderr
        out = (TMP / "nested.out.html").read_text(encoding="utf-8")
        assert out.count("<svg") == 2 and out.count("</svg>") == 2 and out.endswith("<p>b</p>") and '<rect/>' in out, out
        assert out.count('data-opt="1"') == 1, "the whole outer picture should be one unit: " + out

    check("optsvg: an svg nested in an svg is one picture", t_svg_nested)

    if HAVE_SVGO:
        def t_svg_real():
            dst = TMP / "svg.real.html"
            r = svg_run(dst, stub=False); assert r.returncode == 0, r.stderr[-300:]
            out = dst.read_text(encoding="utf-8")
            ids = lambda t: sorted(re.findall(r'\bid="([^"]+)"', t))
            assert ids(out) == ids(page), "svg ids changed: %s vs %s" % (ids(out), ids(page))
            c = Counter(); c.feed(out); assert c.open == c.close == 2

        check("optsvg with the real svgo: every id survives and the output parses", t_svg_real)
    else:
        skip("optsvg with the real svgo (ids survive)", "svgo not installed: npm i svgo")
        r = run([NODE, str(HERE / "optsvg.js"), str(sp), str(TMP / "none.html")], cwd="/")

        def t_nosvgo():
            assert r.returncode != 0 and "npm i svgo" in r.stderr, r.stderr[-300:]

        check("without svgo, optsvg says what to install", t_nosvgo)


# ---- build-example.sh ----------------------------------------------------------------------------------------------------------------------
def t_build_script():
    shim = TMP / "shim"; shim.mkdir()
    log = TMP / "shim.log"
    (shim / "python3").write_text('#!/bin/sh\necho "python3 $1" >> "$SHIM_LOG"\ncp "$2" "$3"\n')
    (shim / "node").write_text('#!/bin/sh\necho "node $1" >> "$SHIM_LOG"\ncp "$2" "$3"\n')
    (shim / "npx").write_text('#!/bin/sh\necho "npx $1" >> "$SHIM_LOG"\nprev=""; out=""; for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; last="$a"; done\ncp "$last" "$out"\n')
    for f in shim.iterdir():
        f.chmod(0o755)
    work = TMP / "elsewhere"; (work / "sub").mkdir(parents=True)
    (work / "sub" / "game.html").write_text("<p>hi</p>")
    env = dict(os.environ, PATH=str(shim) + os.pathsep + os.environ["PATH"], SHIM_LOG=str(log))
    r = subprocess.run(["bash", str(HERE / "build-example.sh"), "sub/game.html"], cwd=str(work), env=env, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    lines = log.read_text().splitlines()
    assert len(lines) == 4, lines
    for l in lines:
        tool = l.split(" ", 1)[1]
        if tool.startswith("html-minifier"):
            continue
        assert tool.startswith(str(HERE)) and pathlib.Path(tool).exists(), "a tool was called by a bare or wrong path: " + l
    assert (work / "sub" / "game.slim.html").exists() and (work / "sub" / "game.small.html").exists(), "outputs are not next to the input"
    assert not (work / "sub" / "game.fonts.html").exists() and not (work / "sub" / "game.svg.html").exists(), "intermediate files were left behind"
    bad = subprocess.run(["bash", str(HERE / "build-example.sh"), "nope.html"], cwd=str(work), env=env, capture_output=True, text=True)
    assert bad.returncode != 0 and "usage" in bad.stderr and "nope.html" in bad.stderr, bad.stderr


if shutil.which("bash"):
    check("build-example.sh finds its tools from any folder and writes next to the input (tools replaced by stand-ins)", t_build_script)
else:
    skip("build-example.sh", "bash not found")


# ---- pack.py (Zopfli packer) ---------------------------------------------------------------------------------------------------------------
import importlib
try:
    pk = importlib.import_module("pack")
except BaseException:   # an older copy runs its command line on import
    pk = None
RAW = ("<!doctype html><title>x</title><p>caf\u00e9 \u2603 " + "hello " * 400 + "</p><script>var a=1</script>").encode("utf-8")


def t_title():
    page = pk.build_page(gzip.compress(b"x"), '<b>&"Tom" </title><script>alert(1)</script>')
    head = page.split("</title>")[0]
    assert "<b>" not in head and "<script>alert" not in head, head
    assert "&lt;b&gt;&amp;&quot;Tom&quot;" in head, head
    assert "<title>Loading</title>" in pk.build_page(gzip.compress(b"x"))


check("the page title is escaped", t_title)


def t_es5():
    loader = pk.build_page(b"")
    assert "async" not in loader and "=>" not in loader and "await" not in loader, "the loader uses syntax an older browser cannot read"
    assert "let " not in loader and "const " not in loader and "`" not in loader


check("the loader is plain ES5 (no async, arrow functions, let, const)", t_es5)

def t_waiting():
    gz = gzip.compress(b"x")
    page = pk.build_page(gz)
    body = page.split("<body", 1)[1].split("<script>", 1)[0]
    assert "Loading\u2026" in body and "Opening" not in page, "the waiting line is missing: " + body
    assert "background:#101018" in body and "color:#ccc" in body, "the default dark background and light text are missing: " + body
    assert "justify-content:center" in body and "align-items:center" in body, "the waiting line is not centered"
    assert "background:#fff" not in body, "the waiting page is still white"
    assert "background:#fff8e0" in pk.build_page(gz, "t", "#fff8e0") and "color:#444" in pk.build_page(gz, "t", "#fff8e0"), "--bg color or its dark text is missing"
    assert "background:navy" in pk.build_page(gz, "t", "navy") and "background:rgb(16,16,24)" in pk.build_page(gz, "t", "rgb(16,16,24)")
    bad = pk.build_page(gz, "t", '#fff"><script>alert(1)</script>')
    assert "alert" not in bad and "background:#101018" in bad, "a color that is not plain must fall back to the default"
    for weird in (None, 5, "", "   ", "url(x)"):
        assert "background:#101018" in pk.build_page(gz, "t", weird), "build_page must never throw on bg=%r" % (weird,)
    # the replaced page: document.write swaps the whole document, so the waiting line goes with it (checked in the loader test below)
    old_overhead = 1325   # what the markup and script around the payload weighed before the waiting page existed (the title is "Loading")
    extra = len(page) - len(base64.b64encode(gz).decode()) - old_overhead
    assert extra < 400, "the waiting page added %d bytes beyond the old size; expected a few hundred at most" % extra


check("the waiting page shows a centered Loading line on a dark (or chosen) background, and stays small", t_waiting)

HARNESS = r"""
const fs = require('fs'); const j = JSON.parse(fs.readFileSync(0, 'utf8'));
(async () => {
  const out = [];
  for (const c of j.cases) {
    const els = { m: { textContent: 'Opening', style: {} }, n: { style: {} } }; let written = null;
    const doc = { getElementById: id => els[id], open() {}, write(t) { written = (written || '') + t; }, close() {} };
    const win = c.old ? {} : { DecompressionStream, Response, Blob };
    try { new Function('window', 'document', 'atob', 'Blob', 'Response', 'DecompressionStream', 'Uint8Array', c.script)(win, doc, atob, Blob, Response, DecompressionStream, Uint8Array); }
    catch (e) { out.push({ threw: String(e) }); continue; }
    await new Promise(r => setTimeout(r, 400));
    out.push({ written, message: els.m.textContent, hidden: els.n.style.display });
  }
  process.stdout.write(JSON.stringify(out));
})();
"""


def loader_results(cases, bg="#101018"):
    payload = []
    for gz, old in cases:
        page = pk.build_page(gz, "Loading", bg)
        payload.append({"script": re.findall(r"<script>(.*?)</script>", page, re.S)[0], "old": old})
    r = subprocess.run([NODE, "-e", HARNESS], input=json.dumps({"cases": payload}).encode(), capture_output=True, timeout=120)
    assert r.returncode == 0, r.stderr.decode()[-300:]
    return json.loads(r.stdout.decode())


def t_loader():
    good = gzip.compress(RAW)
    cut = good[: len(good) // 2]
    flipped = bytearray(good); flipped[len(flipped) // 2] ^= 0xFF
    badcrc = bytearray(good); badcrc[-6] ^= 0xFF   # inside the stored checksum
    res = loader_results([(good, False), (bytes(flipped), False), (cut, False), (bytes(badcrc), False), (good, True)])
    assert res[0].get("written") == RAW.decode("utf-8"), "a good file did not unpack: %s" % res[0]
    assert res[0]["message"] == "Opening"
    for k, what in ((1, "changed bytes"), (2, "a cut-off file"), (3, "a bad checksum")):
        assert res[k].get("written") is None and res[k]["message"] == pk.DAMAGED_MSG, "%s: %s" % (what, res[k])
        assert "updated since 2023" not in res[k]["message"], "a damaged file was blamed on an old browser"
    assert res[4]["message"] == pk.OLD_MSG and res[4]["written"] is None, res[4]
    # the unpacked page must be exactly the input, whatever --bg says
    r = loader_results([(good, False)], bg="#ffeedd")
    assert r[0].get("written") == RAW.decode("utf-8"), "--bg changed the unpacked page: %s" % r[0]


if NODE:
    check("the loader unpacks a good file, calls a damaged one damaged and an old browser old (run in Node)", t_loader)
else:
    skip("loader behavior", "Node.js not found")

try:
    import zopfli  # noqa: F401
    def t_cli():
        d = TMP / "z.html"; d.write_bytes(RAW)
        r = run([sys.executable, str(HERE / "pack.py"), str(d), str(TMP / "z.small.html"), "A <B> title"]); assert r.returncode == 0, r.stderr
        assert "&lt;B&gt;" in (TMP / "z.small.html").read_text(encoding="utf-8")
        assert "background:#101018" in (TMP / "z.small.html").read_text(encoding="utf-8"), "the default waiting page is missing from the packed file"
        r = run([sys.executable, str(HERE / "pack.py"), str(d), str(TMP / "z2.small.html"), "T", "--bg", "#223344"]); assert r.returncode == 0, r.stderr
        out = (TMP / "z2.small.html").read_text(encoding="utf-8")
        assert "background:#223344" in out and "Loading\u2026" in out and "<title>T</title>" in out, "--bg was not used"
        r = run([sys.executable, str(HERE / "pack.py"), str(d), str(TMP / "z3.small.html"), "--bg", "red;}</style>"]); assert r.returncode == 0, r.stderr
        assert "not a plain color" in r.stderr and "background:#101018" in (TMP / "z3.small.html").read_text(encoding="utf-8"), "a bad --bg must fall back and say so"
    check("pack.py command line, with zopfli (title, --bg, bad --bg)", t_cli)
except ImportError:
    skip("pack.py command line with zopfli", "zopfli is not installed: pip install zopfli")
    r = run([sys.executable, str(HERE / "pack.py"), str(TMP / "page.html" if (TMP / "page.html").exists() else __file__), str(TMP / "o.html")])

    def t_nozopfli():
        assert r.returncode != 0 and "pip install zopfli" in r.stderr, r.stderr[-300:]

    check("without zopfli, pack.py says what to install", t_nozopfli)

shutil.rmtree(TMP, ignore_errors=True)
print("single-file-tools: %d passed, %d failed, %d skipped" % (passed, failed, skipped))
sys.exit(1 if failed else 0)
