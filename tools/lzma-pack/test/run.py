"""Checks for lzma-pack that need no browser: Python 3 and (for the loader checks) Node.js.  Copyright (c) 2026 LFC Foundry. MIT License.
Run: python3 tools/lzma-pack/test/run.py        (the browser checks are in browser.py)
Set LZMA_PACK_DIR to another folder holding pack.py to check an older copy (it should fail the checks that cover the old defects).
Each check names the defect it covers: the global payload variable, the Python-only self-check, accepting non-UTF-8, the white flash,
the wrong usage path and the inconsistent fallback encoding."""
import contextlib, io, os, pathlib, re, shutil, sys, tempfile

HERE = pathlib.Path(os.environ.get("LZMA_PACK_DIR") or pathlib.Path(__file__).resolve().parent.parent)
sys.path.insert(0, str(HERE))
import pack  # noqa: E402

NODE = shutil.which("node")
passed = failed = skipped = 0


def check(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print("ok   " + name)
    except BaseException as e:   # SystemExit counts as a failure of the check, not of the run
        failed += 1
        print("FAIL " + name + "\n       " + (str(e) or type(e).__name__)[:300])


def needs_node(name, fn):
    global skipped
    if NODE:
        check(name, fn)
    else:
        skipped += 1
        print("skip " + name + " (Node.js not found; install it to run this check)")


def raises(fn, text=""):
    try:
        fn()
    except SystemExit as e:
        assert text in str(e), "wrong message: %s" % e
        return
    raise AssertionError("expected the packer to refuse, but it did not")


def page_text(size=6000):
    return ("<!doctype html><meta charset=utf-8><title>t</title><body style='background:#101018;color:#eee'><p id=h>café ☃ hello</p>"
            + "<script>var s=1;let q=2;" + "".join("function f%d(){return %d*%d}\n" % (i, i, i + 1) for i in range(size // 30)) + "</script>").encode("utf-8")


APP = page_text()


# ---- the global payload variable ------------------------------------------------------------------------------------------------
def t_no_global_s():
    for enc in ("bytes", "base64"):
        page, _ = pack.pack(APP, encoding=enc, check_node=False)
        assert b'var s="' not in page, "the payload is still stored in a global 'var s'"
        assert pack.PAYLOAD_NAME.encode() in page and len(pack.PAYLOAD_NAME) >= 16


check("payload is not stored in a global named s", t_no_global_s)


def t_cleared():
    for enc in ("bytes", "base64"):
        page, info = pack.pack(APP, encoding=enc)   # the Node harness also fails if a global is left behind
        assert info["node"] == "ok"


needs_node("the loader deletes its payload global and leaves no globals (checked in Node)", t_cleared)


# ---- Node round trip with the shipped decoder ---------------------------------------------------------------------------------------
def t_node_ok():
    for enc in ("bytes", "base64"):
        page, info = pack.pack(APP, encoding=enc)
        assert info["node"] == "ok", info


needs_node("packing runs the embedded JavaScript decoder and hash in Node and they match", t_node_ok)


def t_node_catches_decoder_bug():
    real = pack.decoder_source
    try:
        pack.decoder_source = lambda: real().replace("a[i] = p + ((2048 - p) >> 5)", "a[i] = p + ((2048 - p) >> 4)", 1)
        raises(lambda: pack.pack(APP, encoding="base64"), "self-check failed")
    finally:
        pack.decoder_source = real


needs_node("a bug in the shipped JavaScript decoder is caught at pack time (Python's decoder alone would not see it)", t_node_catches_decoder_bug)


def t_node_catches_bad_payload():
    page, _ = pack.pack(APP, encoding="base64", check_node=False)
    i = page.index(pack.PAYLOAD_NAME.encode() + b'="') + len(pack.PAYLOAD_NAME) + 30
    bad = page[:i] + (b"A" if page[i:i + 1] != b"A" else b"B") + page[i + 1:]
    raises(lambda: pack.node_roundtrip(bad, APP), "self-check failed")


needs_node("a damaged payload fails the Node round trip", t_node_catches_bad_payload)


def t_skip_message():
    real = shutil.which
    shutil.which = lambda name, *a, **k: None if name == "node" else real(name, *a, **k)
    err = io.StringIO()
    try:
        with contextlib.redirect_stderr(err):
            page, info = pack.pack(APP, encoding="base64")
        assert info["node"] == "skipped" and "Node.js was not found" in err.getvalue(), err.getvalue()
    finally:
        shutil.which = real


check("without Node the packer says so and still packs", t_skip_message)


# ---- UTF-8 -----------------------------------------------------------------------------------------------------------------------------
def t_utf8():
    raises(lambda: pack.pack(b"<p>caf\xe9</p>" * 50, check_node=False), "not valid UTF-8")
    raises(lambda: pack.pack("<p>café</p>".encode("cp1252") * 50, check_node=False), "UTF-8")
    pack.pack("<p>café ☃</p>".encode("utf-8") * 50, check_node=False)


check("input that is not valid UTF-8 is refused", t_utf8)


def t_bom():
    data = b"\xef\xbb\xbf" + APP
    page, info = pack.pack(data, encoding="base64")
    assert info["node"] in ("ok", "skipped")


check("a UTF-8 byte order mark is accepted (and the Node round trip expects it gone)", t_bom)


# ---- the Opening... line --------------------------------------------------------------------------------------------------------------
def t_detect():
    d = pack.detect_bg
    assert d("<style>body{margin:0;background:#101018;color:#fff}</style>") == "#101018"
    assert d("<style>html,body{background-color:rgb(10, 20, 30)}</style>") == "rgb(10, 20, 30)"
    assert d("<style>:root{--bg:#001122}body{background:var(--bg)}</style>") == "#001122"
    assert d("<style>body{background:url(a.png) #222 no-repeat}</style>") == "#222"
    assert d("<body style='background:#000'>") == "#000"
    assert d("<meta name=theme-color content='#123456'>") == "#123456"
    assert d("<meta content=\"#654321\" name=\"theme-color\">") == "#654321"
    assert d("<style>body{background:#fff}</style><style>body{background:#111}</style>") == "#111"
    assert d("<p>no colors here</p><script>document.body{x}</script>") is None
    assert d("<style>.panel{background:#f00}</style>") is None


check("background color is found from body rules, variables, inline styles and theme-color", t_detect)


def t_opening():
    page, _ = pack.pack(APP, check_node=False)
    assert b"Opening..." in page and b"background:#101018" in page and b"color:#ccc" in page, page[:400]
    light, _ = pack.pack(b"<style>body{background:#fafafa}</style><p>hi</p>" * 50, check_node=False)
    assert b"background:#fafafa" in light and b"color:#444" in light
    none, _ = pack.pack(APP, bg="none", check_node=False)
    assert b"Opening..." not in none
    white, _ = pack.pack(b"<p>hello</p>" * 200, check_node=False)
    assert b"background:#fff" in white
    given, _ = pack.pack(APP, bg="#0a0a0a", check_node=False)
    assert b"background:#0a0a0a" in given
    raises(lambda: pack.pack(APP, bg="red;}</style><script>alert(1)</script>", check_node=False), "--bg")


check("the wrapper shows 'Opening...' in the page's own background color (and a given or no color)", t_opening)


def t_opening_message_visible():
    # the damaged-file message replaces the body text, so the colors must sit on the body itself
    page, _ = pack.pack(APP, check_node=False)
    assert re.search(rb'<body style="[^"]*background:#101018[^"]*">Opening\.\.\.<script>', page)


check("colors are on the body element, so the error message stays readable too", t_opening_message_visible)


# ---- smaller fixes ---------------------------------------------------------------------------------------------------------------------
def t_usage():
    doc = pack.__doc__ or ""
    m = re.search(r"python3 (\S+pack\.py)", doc)
    assert m and m.group(1) == "tools/lzma-pack/pack.py", m and m.group(1)


check("the usage line names tools/lzma-pack/pack.py", t_usage)


def t_ascii():
    src = "var a='café';"
    assert pack.minify(src, "none") == b"var a='caf\\xe9';"
    assert pack.to_ascii("abc") == b"abc"
    page, _ = pack.pack(APP, minifier="none", encoding="base64", check_node=False)
    page.decode("ascii")   # the whole wrapper is plain ASCII when the input page is


check("without a minifier the loader is ASCII too (no UTF-8 fallback)", t_ascii)


def t_sizes():
    big = ("<p>" + "line of text for the size check %d\n" % 1 * 1) .encode()
    page, info = pack.pack(page_text(60000), encoding="bytes", check_node=False)
    assert info["compressed"] < 20000 and len(page) < 70000


check("a larger page packs", t_sizes)

print("lzma-pack: %d passed, %d failed, %d skipped" % (passed, failed, skipped))
sys.exit(1 if failed else 0)
