"""Browser test for lzma-pack: packs the example page both ways, opens each from file:// and over HTTP (with and without a charset header),
clicks the page, then damages a packed copy and checks the loader refuses to run it.
Run: python3 tools/lzma-pack/test/browser.py   (Python 3 + Playwright for Python with Chromium; no network)
Copyright (c) 2026 LFC Foundry. MIT License."""
import http.server, os, pathlib, sys, tempfile, threading
from playwright.sync_api import sync_playwright

def real_chromium(p, **kw):
    """Start the Chromium named in CHROMIUM (the build from the test-browsers branch), never Playwright's own stock one, and print its real version."""
    exe = os.environ.get("CHROMIUM")
    if not exe:
        print("skipped: set CHROMIUM=/path/to/chrome (the ungoogled Chromium from the test-browsers branch); this test does not fall back to Playwright's own Chromium"); sys.exit(2)
    br = p.chromium.launch(executable_path=exe, **kw)
    print("browser: Chromium " + br.version + " (" + exe + ")")
    return br


ROOT = pathlib.Path(__file__).resolve().parent.parent   # tools/lzma-pack
sys.path.insert(0, str(ROOT))
import pack  # noqa: E402

app = (ROOT / "example" / "app.html").read_bytes()
tmp = pathlib.Path(tempfile.mkdtemp())
files = {}
for enc in ("bytes", "base64"):
    page, info = pack.pack(app, title="t", encoding=enc)
    files[enc] = page
    (tmp / (enc + ".html")).write_bytes(page)
bad = bytearray(files["bytes"]); i = bad.index(pack.PAYLOAD_NAME.encode() + b'="') + len(pack.PAYLOAD_NAME) + 42; bad[i] ^= 0x55   # damage the payload
(tmp / "damaged.html").write_bytes(bytes(bad))
# a copy "opened and saved as text": the bytes re-encoded as UTF-8, which is exactly what an editor does to a windows-1252 file
(tmp / "resaved.html").write_text(files["bytes"].decode("cp1252", errors="replace"), encoding="utf-8")

def serve(charset):
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k): super().__init__(*a, directory=str(tmp), **k)
        def end_headers(self): self.send_header("Cache-Control", "no-store"); super().end_headers()
        def guess_type(self, path): return "text/html; charset=utf-8" if charset else "text/html"
        def log_message(self, *a): pass
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=s.serve_forever, daemon=True).start(); return s

fails = 0
def check(name, ok, extra=""):
    global fails
    print(("ok   " if ok else "FAIL ") + name + (" " + str(extra) if ok is False and extra else ""))
    if not ok: fails += 1

def state(pg):
    # wait until the page reaches an end state (unpacked, or refused with the message), then two painted frames, instead of sleeping a fixed time
    try: pg.wait_for_function("() => document.title === 'unpacked ok' || (document.body && /was changed/.test(document.body.textContent))", timeout=5000)
    except Exception: pass   # report whatever state the page is in
    pg.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    return pg.evaluate("() => ({ title: document.title, h: (document.getElementById('h') || {}).textContent || '', body: document.body ? document.body.textContent.slice(0, 80) : '', text: document.body ? document.body.innerText : '' })")

with sync_playwright() as p:
    br = real_chromium(p); ctx = br.new_context(); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    plain, utf8 = serve(False), serve(True)
    urls = {
        "bytes from file://": (tmp / "bytes.html").as_uri(), "base64 from file://": (tmp / "base64.html").as_uri(),
        "bytes over HTTP (no charset header)": f"http://127.0.0.1:{plain.server_address[1]}/bytes.html",
        "base64 over HTTP (no charset header)": f"http://127.0.0.1:{plain.server_address[1]}/base64.html",
        "base64 over HTTP (charset=utf-8 header)": f"http://127.0.0.1:{utf8.server_address[1]}/base64.html",
    }
    for name, u in urls.items():
        pg.goto(u); s = state(pg)
        ok = s["title"] == "unpacked ok" and s["h"] == "Hello from a packed page" and "café ☃" in s["text"]
        check(name + ": page unpacks and shows Unicode correctly", ok, s)
        if ok:
            pg.click("#b"); pg.click("#b"); check(name + ": the unpacked page's script runs (button counts)", pg.inner_text("#b") == "Count clicks: 2")
    # the documented limitation: the charset header wins over the page's own declaration, so the bytes encoding is refused (and says so)
    pg.goto(f"http://127.0.0.1:{utf8.server_address[1]}/bytes.html"); s = state(pg)
    check("bytes over HTTP with charset=utf-8: refused with the message, never half-run (documented limitation)", "was changed" in s["body"] and s["title"] != "unpacked ok", s)
    pg.goto((tmp / "damaged.html").as_uri()); s = state(pg); check("a damaged payload is refused with the message", "was changed" in s["body"], s)
    pg.goto((tmp / "resaved.html").as_uri()); s = state(pg); check("a file re-saved as text is refused with the message", "was changed" in s["body"], s)
    check("no page errors", not errs, errs)
    br.close()
print("lzma-pack browser: %s" % ("all passed" if not fails else "%d failed" % fails))
sys.exit(1 if fails else 0)
