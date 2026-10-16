"""Checks for ppmd-pack that need no browser: Python 3 and (for the decoder and loader checks) Node.js.  Copyright (c) 2026 LFC Foundry. MIT License.
Run: python3 tools/ppmd-pack/test/run.py        (the browser checks are in browser.py)
Set PPMD_REF_ENCODER to the path of a compiled 7-Zip C encoder (see test/make_fixtures.py) to also compare the Python encoder with the real thing on a wider set;
without it the committed fixtures (made with that C encoder) are the reference.
Set PPMD_PACK_DIR to another folder holding pack.py to check a different copy."""
import contextlib, io, json, os, pathlib, random, re, shutil, subprocess, sys, tempfile

HERE = pathlib.Path(os.environ.get("PPMD_PACK_DIR") or pathlib.Path(__file__).resolve().parent.parent)
sys.path.insert(0, str(HERE))
import pack  # noqa: E402
import ppmd7_encode  # noqa: E402

FIX = HERE / "test" / "fixtures"
NODE = shutil.which("node")
REF = os.environ.get("PPMD_REF_ENCODER")
DECODER = pack.DECODER
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


def skip(name, why):
    global skipped
    skipped += 1
    print("skip " + name + " (" + why + ")")


def needs_node(name, fn):
    if NODE:
        check(name, fn)
    else:
        skip(name, "Node.js not found; install it to run this check")


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
MANIFEST = json.loads((FIX / "manifest.json").read_text())


# ---- the encoder against the C reference ------------------------------------------------------------------------------------------
def t_fixtures():
    bad = []
    for c in MANIFEST:
        data = (FIX / c["input"]).read_bytes()
        want = (FIX / c["expected"]).read_bytes()
        got = ppmd7_encode.encode(data, c["order"], c["mem"])
        if got != want:
            bad.append("%s order %d mem %d (%d bytes, want %d)" % (c["input"], c["order"], c["mem"], len(got), len(want)))
    assert not bad, "differs from the C encoder's output: " + "; ".join(bad)
    assert any(c["mem"] <= 4096 for c in MANIFEST), "no fixture forces the model to restart"


check("the Python encoder writes byte for byte what the 7-Zip C encoder wrote (%d committed fixtures, restarts included)" % len(MANIFEST), t_fixtures)


def t_reference_binary():
    cases = []
    for name in ("tiny.html", "notes.md", "pattern.txt", "noise.bin"):
        for order in (3, 6, 12, 32):
            for mem in (2048, 30001, 1 << 20):
                cases.append((name, order, mem))
    with tempfile.TemporaryDirectory() as d:
        for name, order, mem in cases:
            out = pathlib.Path(d) / "ref.bin"
            subprocess.run([REF, str(FIX / name), str(out), str(order), str(mem)], check=True, stdout=subprocess.DEVNULL)
            got = ppmd7_encode.encode((FIX / name).read_bytes(), order, mem)
            assert got == out.read_bytes(), "differs from the C encoder: %s order %d mem %d" % (name, order, mem)


if REF and os.path.exists(REF):
    check("the encoder matches the C encoder program at PPMD_REF_ENCODER on 48 more settings", t_reference_binary)
else:
    skip("comparison with the C encoder program", "set PPMD_REF_ENCODER to a compiled copy to run it; the committed fixtures cover the basics")


def t_determinism():
    d = (FIX / "notes.md").read_bytes()
    assert ppmd7_encode.encode(d, 12, 1 << 20) == ppmd7_encode.encode(d, 12, 1 << 20)
    a, _ = pack.pack(APP, check_node=False)
    b, _ = pack.pack(APP, check_node=False)
    assert a == b, "the same input gave two different pages"


check("determinism: the same input packs to the identical bytes twice", t_determinism)


def t_encoder_arguments():
    for bad in ((b"x", 1, 1 << 20), (b"x", 65, 1 << 20), (b"x", 12, 1000), (b"x", 12, 1 << 31)):
        try:
            ppmd7_encode.encode(*bad)
        except ValueError:
            continue
        raise AssertionError("accepted %r" % (bad,))
    assert ppmd7_encode.encode(b"", 12, 1 << 20) == (FIX / "empty.ppmd").read_bytes()


check("the encoder refuses a model order or memory size the decoder cannot use", t_encoder_arguments)


# ---- round trip through the JavaScript decoder -------------------------------------------------------------------------------------
ROUNDTRIP_JS = r"""
const fs = require('fs'), dec = require(process.argv[1]);
const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); let bad = [];
jobs.forEach(function (j) {
  const want = fs.readFileSync(j.input), z = fs.readFileSync(j.stream);
  try { const got = dec(new Uint8Array(z), want.length, j.order, j.mem); if (Buffer.compare(Buffer.from(got), want) !== 0) bad.push(j.input + ' order ' + j.order + ' mem ' + j.mem + ': wrong bytes'); }
  catch (e) { bad.push(j.input + ' order ' + j.order + ' mem ' + j.mem + ': ' + e.message); }
});
process.stdout.write(JSON.stringify(bad));
"""


def t_js_roundtrip():
    jobs = []
    with tempfile.TemporaryDirectory() as d:
        for i, (name, order, mem) in enumerate([("tiny.html", 12, 1 << 20), ("notes.md", 32, 1 << 20), ("notes.md", 6, 2048), ("noise.bin", 12, 1 << 20),
                                                ("pattern.txt", 64, 65536), ("pattern.txt", 2, 100003), ("one.bin", 12, 1 << 20)]):
            p = pathlib.Path(d) / ("s%d.bin" % i)
            p.write_bytes(ppmd7_encode.encode((FIX / name).read_bytes(), order, mem))
            jobs.append({"input": str(FIX / name), "stream": str(p), "order": order, "mem": mem})
        (pathlib.Path(d) / "jobs.json").write_text(json.dumps(jobs))
        r = subprocess.run([NODE, "-e", ROUNDTRIP_JS, str(DECODER), str(pathlib.Path(d) / "jobs.json")], capture_output=True, timeout=600)
        assert r.returncode == 0, r.stderr.decode("utf-8", "replace")[:300]
        bad = json.loads(r.stdout.decode())
        assert not bad, "; ".join(bad)


needs_node("streams from the Python encoder unpack to the original in the JavaScript decoder (Node), restarts included", t_js_roundtrip)


# ---- the packer and its self-checks ----------------------------------------------------------------------------------------------------
def t_no_global_s():
    for enc in ("bytes", "base64"):
        page, _ = pack.pack(APP, encoding=enc, check_node=False)
        assert b'var s="' not in page, "the payload is stored in a global 'var s'"
        assert pack.PAYLOAD_NAME.encode() in page and len(pack.PAYLOAD_NAME) >= 16


check("payload is not stored in a global named s", t_no_global_s)


def t_node_ok():
    for enc in ("bytes", "base64"):
        page, info = pack.pack(APP, encoding=enc)   # the Node harness also fails if a global is left behind
        assert info["node"] == "ok", info


needs_node("packing runs the embedded decoder and hash in Node: original page back, no error, no leaked global", t_node_ok)


def t_node_catches_decoder_bug():
    real = pack.decoder_source

    def broken():
        s = real()
        s2 = s.replace("MAX_FREQ = 124", "MAX_FREQ = 123", 1)
        assert s2 != s, "the test needs 'MAX_FREQ = 124' in the decoder"
        return s2
    try:
        pack.decoder_source = broken
        raises(lambda: pack.pack(page_text(9000), encoding="base64"), "self-check failed")
    finally:
        pack.decoder_source = real


needs_node("a bug in the shipped JavaScript decoder is caught at pack time", t_node_catches_decoder_bug)


def t_node_catches_bad_payload():
    page, _ = pack.pack(APP, encoding="base64", check_node=False)
    i = page.index(pack.PAYLOAD_NAME.encode() + b'="') + len(pack.PAYLOAD_NAME) + 30
    bad = page[:i] + (b"A" if page[i:i + 1] != b"A" else b"B") + page[i + 1:]
    raises(lambda: pack.node_roundtrip(bad, APP), "self-check failed")


needs_node("a damaged payload fails the Node round trip", t_node_catches_bad_payload)


def t_scrambled_payload_does_not_hang():
    # a re-saved or cut file gives the decoder garbage; the loader has none of the decoder's own checks, so the compressed bytes must be refused BEFORE decoding
    page, _ = pack.pack(page_text(9000), encoding="base64", check_node=False)
    i = page.index(pack.PAYLOAD_NAME.encode() + b'="') + len(pack.PAYLOAD_NAME) + 2
    j = page.index(b'"</script>', i)
    mid = bytearray(page[i:j])
    for k in range(0, len(mid), 7):
        mid[k] = ord("B") if mid[k] != ord("B") else ord("C")
    scrambled = page[:i] + bytes(mid) + page[j:]
    try:
        pack.node_roundtrip(scrambled, page_text(9000))
    except SystemExit as e:
        assert "did not finish" not in str(e) and "loader showed its error message" in str(e), str(e)
        return
    raise AssertionError("a scrambled payload was accepted")


needs_node("a scrambled payload is refused with the message at once (the decoder alone would spin forever on it)", t_scrambled_payload_does_not_hang)


def t_skip_message():
    real = shutil.which
    shutil.which = lambda name, *a, **k: None if name == "node" else real(name, *a, **k)
    err = io.StringIO()
    try:
        with contextlib.redirect_stderr(err):
            page, info = pack.pack(APP, encoding="base64")
        assert info["node"] == "skipped" and "Node.js was not found" in err.getvalue() and "NOT" in err.getvalue(), err.getvalue()
    finally:
        shutil.which = real


check("without Node the packer says so (and that the data is unverified) and still packs", t_skip_message)


def t_utf8():
    raises(lambda: pack.pack(b"<p>caf\xe9</p>" * 50, check_node=False), "not valid UTF-8")
    raises(lambda: pack.pack("<p>café</p>".encode("cp1252") * 50, check_node=False), "UTF-8")
    pack.pack("<p>café ☃</p>".encode("utf-8") * 50, check_node=False)


check("input that is not valid UTF-8 is refused", t_utf8)


def t_bom():
    page, info = pack.pack(b"\xef\xbb\xbf" + APP, encoding="base64")
    assert info["node"] in ("ok", "skipped")


check("a UTF-8 byte order mark is accepted (and the Node round trip expects it gone)", t_bom)


def t_options_refused():
    raises(lambda: pack.pack(APP, order=1, check_node=False), "--order")
    raises(lambda: pack.pack(APP, order=65, check_node=False), "--order")
    raises(lambda: pack.pack(APP, mem=100, check_node=False), "--mem")
    raises(lambda: pack.pack(APP, encoding="hex", check_node=False), "--encoding")
    raises(lambda: pack.pack(APP, bg="red;}</style><script>alert(1)</script>", check_node=False), "--bg")
    assert pack.size_arg("4M") == 4 << 20 and pack.size_arg("512k") == 512 << 10 and pack.size_arg("1000") == 1000
    try:
        pack.size_arg("lots")
    except Exception:
        return
    raise AssertionError("--mem lots was accepted")


check("a bad --order, --mem, --encoding or --bg is refused with a message", t_options_refused)


def t_defaults():
    assert pack.default_mem(100) == 1 << 20 and pack.default_mem(100 << 10) == 1 << 20 and pack.default_mem(200 << 10) == 2 << 20
    assert pack.default_mem(431473) == 4 << 20 and pack.default_mem(5 << 20) == 16 << 20 and pack.default_mem(1 << 30) == 16 << 20
    assert pack.tune_grid(3000) == [(o, 1 << 20) for o in pack.ORDERS]
    big = pack.tune_grid(431473)
    assert (12, 8 << 20) in big and (12, 16 << 20) not in big and len(big) == 7 * 4
    _, info = pack.pack(APP, check_node=False)
    assert info["order"] == 12 and info["mem"] == 1 << 20, info


check("defaults: order 12, memory a power of two >= 8x the input between 1 and 16 MB; the tune grid is capped by input size", t_defaults)


def t_tune():
    page = page_text(3000)
    base, binfo = pack.pack(page, check_node=False)
    tuned, tinfo = pack.pack(page, tune=True, check_node=False, jobs=2)   # two processes, so the process-pool path runs too
    assert tinfo["tuned"] and len(tuned) <= len(base), (len(tuned), len(base))
    tuned1, _ = pack.pack(page, tune=True, check_node=False, jobs=1)
    assert tuned == tuned1, "tuning gave different pages with 1 and 2 processes"
    page2, info2 = pack.pack(page, tune=True)
    assert info2["node"] in ("ok", "skipped")


check("--tune picks a result no bigger than the default, the same with one or two processes, and it still unpacks", t_tune)


def t_compare():
    page, info = pack.pack(APP, compare=True, check_node=False)
    c = info["compare"]
    assert c["ppmd_page"] == len(page) and c["ppmd_payload"] == info["compressed"] and c["lzma_page"] > c["lzma_payload"] > 0, c
    assert c["lzma_loader"] < c["ppmd_loader"], c


check("--compare reports the LZMA payload and both net page sizes", t_compare)


# ---- the Opening... line and the page structure ----------------------------------------------------------------------------------
def t_opening_and_message():
    page, _ = pack.pack(APP, check_node=False)
    assert re.search(rb'<body style="[^"]*background:#101018[^"]*">Opening\.\.\.<script>', page), page[:300]
    none, _ = pack.pack(APP, bg="none", check_node=False)
    assert b"Opening..." not in none
    assert b"This file was changed" in page and page.count(b"<script>") == 2
    assert b'<meta charset="windows-1252">' in page and b'<meta charset="utf-8">' in pack.pack(APP, encoding="base64", check_node=False)[0]


check("the wrapper shows 'Opening...' in the page's own color and carries the 'This file was changed' message", t_opening_and_message)


def t_usage():
    m = re.search(r"python3 (\S+pack\.py)", pack.__doc__ or "")
    assert m and m.group(1) == "tools/ppmd-pack/pack.py", m and m.group(1)
    assert "allocates" in (pack.__doc__ or "") and "MEMORY NOTE" in pack.__doc__


check("the usage line names tools/ppmd-pack/pack.py and the memory note is there", t_usage)


# ---- the loader ---------------------------------------------------------------------------------------------------------------------------
def t_lean_loader():
    src = pack.decoder_source()
    assert "Error(" not in src and "lean-cut" not in src and "\nif (typeof module" not in src and "fromProps" not in src, "the decoder source still has error messages, lean-cut lines or the export block"
    assert "throw 0" in src and "function ppmd7Decode" in src
    page, info = pack.pack(APP, encoding="bytes", minifier="none", check_node=False)
    s = page.decode("latin-1")
    assert "Error(" not in s and "lean-cut" not in s and "PPMd:" not in s, "a long error message or a check for outside files is still in the loader"
    page2, _ = pack.pack(APP, encoding="base64", minifier="none", check_node=False)
    page2.decode("ascii")   # the wrapper is plain ASCII when the input is, minifier or not


check("the loader carries no Error( strings and no lean-cut lines, and is plain ASCII without a minifier", t_lean_loader)


def t_lean_minified():
    if not pack.lz.find_minifier("auto"):
        raise AssertionError("SKIP")
    page, info = pack.pack(APP, encoding="bytes", check_node=bool(NODE))
    s = page.decode("latin-1")
    assert "Error(" not in s and "lean-cut" not in s and info["loader"] < 9500, info
    assert info["node"] in ("ok", "skipped")


def t_lean_minified_runner():
    if not pack.lz.find_minifier("auto"):
        skip("the minified loader", "terser or esbuild not found")
        return
    check("the minified loader unpacks the page (Node), has no Error( strings and stays under 9.5 KB", t_lean_minified)


t_lean_minified_runner()


def t_lean_roundtrip_unminified():
    page, info = pack.pack(page_text(2500), encoding="bytes", minifier="none", check_node=True)
    assert info["node"] == "ok", info["node"]


needs_node("the loader without a minifier still unpacks the page byte for byte (Node)", t_lean_roundtrip_unminified)


MIXED = ("<!doctype html><meta charset=utf-8><title>m</title><body style='background:#111'><button onclick='hello()'>go</button>"
         "<script>function hello(){ var message = 'hi there'; var counter = 0; counter = counter + 1; return message + counter }  // comment\n"
         "window.hello = hello;</script>"
         "<script type=module>import.meta; const longName = 1; console.log(longName)</script>"
         "<script type=application/json>{ \"a\" :  1 }</script>"
         "<script src=other.js></script>").encode("utf-8")


def t_minify_page():
    page, info = pack.pack(MIXED, encoding="bytes", check_node=bool(NODE), minify_pg=True)
    assert "1 script(s) minified" in info["page"], info["page"]
    text, done, skipped_ = pack.lz.minify_page(MIXED.decode("utf-8"))
    assert done == 1 and "const longName = 1" in text and '{ "a" :  1 }' in text and "src=other.js" in text and "onclick='hello()'" in text


if pack.lz.find_minifier("auto"):
    check("--minify-page minifies the classic script and keeps modules, data blocks, src scripts, top-level names; the unpacked page is the minified one", t_minify_page)
else:
    skip("--minify-page", "terser or esbuild not found")


def t_minify_page_needs_tool():
    raises(lambda: pack.pack(MIXED, minify_pg=True, check_node=False), "needs terser or esbuild")


if not pack.lz.find_minifier("auto"):
    check("--minify-page without a minifier says what is missing", t_minify_page_needs_tool)


def t_sizes():
    page, info = pack.pack(page_text(60000), encoding="bytes", check_node=False)
    assert info["compressed"] < 12000, info


check("a larger page packs well", t_sizes)

print("ppmd-pack: %d passed, %d failed, %d skipped" % (passed, failed, skipped))
sys.exit(1 if failed else 0)
