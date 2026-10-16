#!/usr/bin/env python3
"""lzma-pack: turn one HTML file into a smaller self-unpacking HTML file.  MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/lfcfoundry/JS-modules

  python3 tools/lzma-pack/pack.py INPUT.html OUTPUT.html [--title T] [--head HTML] [--encoding bytes|base64] [--tune]
                                  [--minifier auto|terser|esbuild|none] [--bg auto|none|COLOR] [--skip-node-check]

The output is a tiny page that holds the LZMA-compressed input and a small decoder (modules/lzma-decode/lzma-decode.js). When opened it
unpacks the input, checks a hash of the result, and replaces itself with it (document.write). If the hash does not match
(for example the file was opened and saved as text, or cut short) it shows a plain message instead of running anything.

--encoding bytes   (default) store the compressed bytes raw and declare the page windows-1252 so each byte is one character.
                   Smallest. Works from file:// and from servers that send no charset. Does NOT work from a server that sends
                   'Content-Type: text/html; charset=utf-8' (GitHub Pages does): the header overrides the page's own charset.
--encoding base64  store the bytes as base64 text. About a third bigger, but safe on any server and any editor.
--tune             try a few LZMA settings (lc 0-4, pb 0-2) and keep the smallest result (slower).
--bg               while the page unpacks, the wrapper shows a small "Opening..." line on this background color, so a dark page never
                   flashes white. auto (default) reads the color from the input (an inline body style, a body/html/:root rule, or a
                   theme-color meta tag; white if none is found), none shows nothing, or give a color such as "#101018".

After packing, the tool checks its own work twice: Python's lzma unpacks the data, and then (if Node.js is installed) the page's own
JavaScript loader runs in Node and must produce the input again. Without Node it says so and skips the second check
(--skip-node-check turns it off on purpose). The input must be valid UTF-8, because the loader decodes the page as UTF-8; anything else
is refused. A leading byte order mark is allowed, but the unpacked page comes back without it (the browser had already used it).
How much smaller the result is depends on the file: 10 to 25 percent smaller than ordinary deflate has been seen.
Needs only Python 3 (standard library). A minifier (terser or esbuild: on PATH, in a node_modules/.bin, or named by the TERSER or ESBUILD environment variable) shrinks the loader by about 5 KB; without one the loader is embedded as is.
"""
import argparse, base64, json, lzma, pathlib, re, shutil, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
DECODER = HERE.parent.parent / "modules" / "lzma-decode" / "lzma-decode.js"
# What a browser makes of the bytes 0x80-0x9F when a page is read as windows-1252 (the WHATWG table; the five gaps map to the same-numbered control characters)
CP1252_HI = [8364, 129, 8218, 402, 8222, 8230, 8224, 8225, 710, 8240, 352, 8249, 338, 141, 381, 143, 144, 8216, 8217, 8220, 8221, 8226, 8211, 8212, 732, 8482, 353, 8250, 339, 157, 382, 376]

# The compressed text is stored in a global with this long name, copied into a local by the loader and deleted at once,
# so nothing is left behind that a game could clash with (a top-level "let s" in the unpacked page, for example).
PAYLOAD_NAME = "__lzmaPackedPayload_7f3a9c21"

NAMED = {"black": (0, 0, 0), "white": (255, 255, 255), "gray": (128, 128, 128), "grey": (128, 128, 128), "navy": (0, 0, 128), "red": (255, 0, 0),
         "green": (0, 128, 0), "blue": (0, 0, 255), "purple": (128, 0, 128), "teal": (0, 128, 128), "maroon": (128, 0, 0), "silver": (192, 192, 192)}
COLOR_RE = re.compile(r"#[0-9a-fA-F]{8}(?![0-9a-fA-F])|#[0-9a-fA-F]{6}(?![0-9a-fA-F])|#[0-9a-fA-F]{3,4}(?![0-9a-fA-F])|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:" + "|".join(NAMED) + r")\b", re.I)
SAFE_COLOR_RE = re.compile(r"^(#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\([0-9.,%\s/]+\)|[a-zA-Z]{3,20})$")
RULE_RE = re.compile(r"(?<![\w.#-])(?:html|body|:root)(?:\s*,\s*(?:html|body|:root))*\s*\{([^{}]*)\}", re.I)
BG_RE = re.compile(r"background(?:-color)?\s*:\s*([^;}]+)", re.I)


def _color_in(value, text):
    """The first plain color in a CSS value; a var(--name) is looked up in the page. None if there is none."""
    value = re.sub(r"url\([^)]*\)", " ", value)
    v = re.search(r"var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)", value)
    if v:
        d = re.search(re.escape(v.group(1)) + r"\s*:\s*([^;}]+)", text)
        found = COLOR_RE.search(d.group(1)) if d else (COLOR_RE.search(v.group(2)) if v.group(2) else None)
        return found.group(0) if found else None
    m = COLOR_RE.search(value)
    return m.group(0) if m else None


def detect_bg(html):
    """The page's own background color, read from its text: an inline body style, then the last html/body/:root rule that sets one,
    then a theme-color meta tag. Returns a CSS color string, or None. A guess for the 'Opening...' wrapper only; --bg overrides it."""
    m = re.search(r"<body[^>]*\sstyle\s*=\s*[\"']([^\"']*)", html, re.I)
    if m:
        for b in reversed(BG_RE.findall(m.group(1))):
            c = _color_in(b, html)
            if c: return c
    for rule in reversed(RULE_RE.findall(html)):
        for b in reversed(BG_RE.findall(rule)):
            c = _color_in(b, html)
            if c: return c
    m = re.search(r"<meta[^>]+name\s*=\s*[\"']?theme-color[\"']?[^>]*content\s*=\s*[\"']?([^\"'>]+)", html, re.I) or \
        re.search(r"<meta[^>]+content\s*=\s*[\"']?([^\"'>]+)[\"']?[^>]*name\s*=\s*[\"']?theme-color", html, re.I)
    if m:
        return _color_in(m.group(1), html)
    return None


def luminance(color):
    """0 (black) .. 1 (white) for #hex, rgb() and a few names; None when unknown (hsl, other names)."""
    c = color.strip().lower()
    if c in NAMED:
        r, g, b = NAMED[c]
    elif c.startswith("#"):
        h = c[1:]
        if len(h) in (3, 4): h = "".join(ch * 2 for ch in h[:3])
        if len(h) not in (6, 8): return None
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    elif c.startswith("rgb"):
        parts = re.findall(r"[0-9.]+%?", c)[:3]
        if len(parts) < 3: return None
        r, g, b = [float(p[:-1]) * 2.55 if p.endswith("%") else float(p) for p in parts]
    else:
        return None
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0


def opening_style(bg, html):
    """(color, style attribute) for the wrapper's body, or None when no 'Opening...' line is wanted."""
    if bg == "none":
        return None
    color = detect_bg(html) if bg == "auto" else bg
    if not color or not SAFE_COLOR_RE.match(color):
        if bg != "auto":
            raise SystemExit("--bg must be auto, none, or a plain color like #101018, rgb(16,16,24) or black")
        color = "#fff"
    lum = luminance(color)
    text = "#888" if lum is None else ("#ccc" if lum < 0.5 else "#444")
    return color, "margin:0;padding:24px;font:16px system-ui,sans-serif;background:%s;color:%s" % (color, text)


# Runs the page's two scripts exactly as shipped, in a bare Node sandbox, and reports what the loader did. Reads JSON on stdin.
NODE_HARNESS = r"""
const fs = require('fs'), vm = require('vm');
const j = JSON.parse(fs.readFileSync(0, 'utf8')), q = [];
const doc = { written: null, body: { textContent: '' }, open() {}, write(t) { this.written = (this.written === null ? '' : this.written) + t; }, close() {} };
const ctx = vm.createContext({ document: doc, setTimeout(f) { q.push(f); return 0; }, atob: globalThis.atob, TextDecoder: TextDecoder });
vm.runInContext('var window = this;', ctx);
const out = { ok: false, reason: '' };
try {
  j.scripts.forEach(function (s) { vm.runInContext(s, ctx); });
  while (q.length) q.shift()();
  if (doc.body.textContent) out.reason = 'the loader showed its error message: ' + doc.body.textContent.slice(0, 60);
  else if (doc.written === null) out.reason = 'the loader never wrote the page';
  else if (doc.written !== j.expected) out.reason = 'the unpacked page differs from the input (' + doc.written.length + ' vs ' + j.expected.length + ' characters)';
  else if (vm.runInContext('typeof s + typeof lzmaDecode + typeof ' + j.name, ctx) !== 'undefinedundefinedundefined') out.reason = 'the loader left a global variable behind';
  else out.ok = true;
} catch (e) { out.reason = 'the loader threw: ' + String(e && e.message || e).slice(0, 120); }
process.stdout.write(JSON.stringify(out));
"""


def cp1252_text(bs):
    """What a browser makes of the page bytes when the page is read as windows-1252 (every byte is one character)."""
    return "".join(chr(b) if b < 128 or b >= 160 else chr(CP1252_HI[b - 128]) for b in bs)


def node_roundtrip(page, data):
    """Run the packed page's own scripts in Node and compare with the input. Returns 'ok', or 'skipped' when Node is not installed."""
    node = shutil.which("node")
    if not node:
        print("note: Node.js was not found, so the packed page's own JavaScript decoder and hash were NOT run here. "
              "Only Python's lzma was checked. Install Node to turn this check on.", file=sys.stderr)
        return "skipped"
    scripts = re.findall(r"<script>(.*?)</script>", cp1252_text(page), re.S)
    if len(scripts) != 2:
        raise SystemExit("self-check failed: expected 2 scripts in the packed page, found %d" % len(scripts))
    text = data.decode("utf-8")
    if text.startswith("﻿"):
        text = text[1:]   # the loader's TextDecoder drops a byte order mark
    payload = json.dumps({"scripts": scripts, "expected": text, "name": PAYLOAD_NAME}, ensure_ascii=False).encode("utf-8")
    try:
        r = subprocess.run([node, "-e", NODE_HARNESS], input=payload, capture_output=True, timeout=600)
    except subprocess.TimeoutExpired:
        raise SystemExit("self-check failed: the packed page's decoder did not finish in Node within 10 minutes")
    if r.returncode != 0:
        raise SystemExit("the Node check could not run: " + r.stderr.decode("utf-8", "replace")[:300])
    res = json.loads(r.stdout.decode("utf-8"))
    if not res["ok"]:
        raise SystemExit("self-check failed with the page's own JavaScript decoder: " + res["reason"])
    return "ok"


def lzma_raw(data, lc=4, lp=0, pb=0):
    """Raw LZMA1 without the container header and without the first byte (always zero)."""
    f = [{"id": lzma.FILTER_LZMA1, "dict_size": 1 << 20, "lc": lc, "lp": lp, "pb": pb, "preset": 9 | lzma.PRESET_EXTREME, "nice_len": 273, "mf": lzma.MF_BT4, "depth": 0}]
    z = lzma.compress(data, format=lzma.FORMAT_RAW, filters=f)
    if z[0] != 0:
        raise SystemExit("unexpected LZMA stream start")
    return z[1:]


def js_escape(bs):
    """The bytes as the inside of a double-quoted JS string in a windows-1252 page: only NUL, CR, LF, quote, backslash and a '<' that could begin '</script' or '<!--' need an escape."""
    out = bytearray()
    for i, b in enumerate(bs):
        if b == 0: out += b"\\x00"
        elif b == 10: out += b"\\n"
        elif b == 13: out += b"\\r"
        elif b == 34: out += b'\\"'
        elif b == 92: out += b"\\\\"
        elif b == 60 and i + 1 < len(bs) and bs[i + 1] in (47, 33): out += b"\\x3c"
        else: out.append(b)
    return bytes(out)


def find_minifier(which):
    """terser or esbuild: the environment variable TERSER / ESBUILD (a full path), then PATH, then node_modules/.bin here and in the parent folders."""
    import os
    names = ["terser", "esbuild"] if which == "auto" else [which]
    for n in names:
        if n == "none":
            return None
        cands = [os.environ.get(n.upper()), shutil.which(n)] + [str(d / "node_modules" / ".bin" / n) for d in [pathlib.Path.cwd(), *pathlib.Path.cwd().parents, HERE.parent, *HERE.parent.parents]]
        for c in cands:
            if c and os.path.exists(c):
                return n, c
    return None


def to_ascii(text):
    """The loader must be pure ASCII, whichever way it was made: the page is read as windows-1252 (bytes) or utf-8 (base64), and the bytes must mean the same in both."""
    try:
        return text.encode("ascii")
    except UnicodeEncodeError:
        return text.encode("ascii", "backslashreplace")


def minify(src, which):
    m = find_minifier(which)
    if not m:
        if which not in ("auto", "none"):
            raise SystemExit("minifier not found: " + which)
        return to_ascii(src)
    name, path = m
    cmd = [path, "--ecma", "2020", "--compress", "passes=3,toplevel=true", "--mangle", "toplevel=true"] if name == "terser" else [path, "--minify", "--target=es2020"]
    r = subprocess.run(cmd, input=src, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(name + " failed: " + r.stderr[:300])
    return to_ascii(r.stdout.strip())


SCRIPT_RE = re.compile(r"(<script\b)([^>]*)(>)(.*?)(</script\s*>)", re.I | re.S)


def minify_page(text, which="auto"):
    """Minify the page's own inline classic scripts (not modules, not scripts with src, not data blocks) with terser or esbuild.
    Names at the top level of a script are NOT renamed (toplevel mangling would break onclick="..." handlers and other scripts), and a script the
    minifier cannot parse, or whose output would contain a closing script tag, stays as it was. Returns (new text, scripts changed, scripts skipped)."""
    m = find_minifier(which)
    if not m:
        raise SystemExit("--minify-page needs terser or esbuild (on the PATH, in node_modules/.bin, or named by TERSER / ESBUILD)")
    name, path = m
    cmd = [path, "--ecma", "2020", "--compress", "--mangle"] if name == "terser" else [path, "--minify", "--target=es2020"]
    stats = [0, 0]

    def one(mo):
        attrs, body = mo.group(2), mo.group(4)
        kind = re.search(r"\btype\s*=\s*[\"']?([^\s\"'>]*)", attrs, re.I)
        classic = kind is None or kind.group(1).lower() in ("", "text/javascript", "application/javascript")
        if not classic or re.search(r"\bsrc\s*=", attrs, re.I) or not body.strip():
            return mo.group(0)
        r = subprocess.run(cmd, input=body, capture_output=True, text=True)
        out = r.stdout.strip()
        if r.returncode != 0 or not out or re.search(r"</script", out, re.I) or len(out) >= len(body):
            stats[1] += 1
            return mo.group(0)
        stats[0] += 1
        return mo.group(1) + attrs + mo.group(3) + "\n" + out + "\n" + mo.group(5)
    return SCRIPT_RE.sub(one, text), stats[0], stats[1]


def decoder_source():
    s = DECODER.read_text(encoding="utf-8")
    cut = s.index("\nfunction lzmaDecodeFile")   # the page does not need the .lzma-file helper or the module export lines
    s = s[:cut]
    # The packer made the stream itself, so the loader skips the checks meant for outside files (lines marked "lean-cut"), and the page shows its own
    # message for any failure, so each long error message becomes a bare throw. Both save a few hundred bytes of loader.
    s = "\n".join(l for l in s.split("\n") if not l.rstrip().endswith("// lean-cut"))
    s = re.sub(r"throw new Error\((?:[^()]|\([^()]*\))*\)", "throw 0", s)
    if "Error(" in s:
        raise SystemExit("pack.py: an error message in lzma-decode.js was not shortened; update the pattern in decoder_source()")
    return s


def pack(data, title="", head="", encoding="bytes", minifier="auto", tune=False, bg="auto", check_node=True, minify_pg=False):
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as e:
        raise SystemExit("the input is not valid UTF-8 (first bad byte at offset %d). Save the page as UTF-8 and pack it again: the loader "
                         "decodes the unpacked page as UTF-8, so any other encoding would come out garbled." % e.start)
    page_note = ""
    if minify_pg:   # smaller input, so a smaller payload; the checks below then compare against the minified page, which is what gets unpacked
        text2, done, skipped = minify_page(text, minifier)
        page_note = "%d script(s) minified, %d left alone, %d bytes saved before packing" % (done, skipped, len(data) - len(text2.encode("utf-8")))
        data = text2.encode("utf-8")
    best = None
    grid = [(4, 0, 0)] if not tune else [(lc, 0, pb) for lc in range(0, 5) for pb in range(0, 3)]
    for lc, lp, pb in grid:
        z = lzma_raw(data, lc, lp, pb)
        if best is None or len(z) < len(best[0]):
            best = (z, lc, lp, pb)
    z, lc, lp, pb = best
    chk = 0
    for b in data:
        chk = (chk * 31 + b) & 0xFFFFFFFF
    dec = decoder_source()
    if encoding == "bytes":
        key = min(range(256), key=lambda k: len(js_escape(bytes(b ^ k for b in z))))
        payload = js_escape(bytes(b ^ key for b in z))
        read = ("var T=%s,i=0,z=new Uint8Array(s.length),c;for(;i<s.length;i++){c=s.charCodeAt(i);z[i]=(c<256?c:128+T.indexOf(c))^%d}" % (json.dumps(CP1252_HI, separators=(",", ":")), key))
        meta = b'<meta charset="windows-1252">'
    elif encoding == "base64":
        payload = base64.b64encode(z)
        read = "var i=0,z=Uint8Array.from(atob(s),function(c){return c.charCodeAt(0)});"
        meta = b'<meta charset="utf-8">'
    else:
        raise SystemExit("--encoding must be bytes or base64")
    # The loader copies the payload into a local variable and deletes the global at once; the decoder and every other name live inside the timer function.
    src = ("setTimeout(function(){" + dec + "var s=" + PAYLOAD_NAME + ";delete window." + PAYLOAD_NAME + ";" + read + "var o,h=0,t;"
           "try{o=lzmaDecode(z,%d,{lc:%d,lp:%d,pb:%d});for(i=0;i<o.length;i++)h=(h*31+o[i])>>>0;if(h!=%d)throw 0;t=new TextDecoder().decode(o);document.open();document.write(t);document.close()}"
           "catch(e){document.body.textContent=\"This file was changed (maybe opened and saved as text, or cut short). Please download it again and open the file itself in a browser.\"}},30)") % (len(data), lc, lp, pb, chk)
    loader = minify(src, minifier)
    title_html = ("<title>" + title.replace("&", "&amp;").replace("<", "&lt;") + "</title>").encode("ascii", "xmlcharrefreplace") if title else b""
    op = opening_style(bg, text)   # the "Opening..." line, in the page's own background color, so a dark page never flashes white
    body = (b'<body style="' + op[1].encode("ascii") + b'">Opening...') if op else b'<body>'
    page = (b'<!doctype html>' + meta + b'<meta name="viewport" content="width=device-width,initial-scale=1">' + head.encode("ascii", "xmlcharrefreplace") + title_html
            + body + b'<script>' + PAYLOAD_NAME.encode() + b'="' + payload + b'"</script><script>' + loader + b'</script>')   # the payload sits in its own script so a minifier cannot fold it
    # self-check 1, with the reference implementation: unpack the payload with Python's lzma and compare
    f = [{"id": lzma.FILTER_LZMA1, "dict_size": 1 << 20, "lc": lc, "lp": lp, "pb": pb}]
    back = lzma.LZMADecompressor(format=lzma.FORMAT_RAW, filters=f).decompress(b"\x00" + z, max_length=len(data))
    if back != data:
        raise SystemExit("self-check failed: the compressed data does not unpack to the input")
    # self-check 2, with what actually ships: run the page's own scripts (JavaScript decoder, byte reader and hash) in Node
    node = node_roundtrip(page, data) if check_node else "off"
    return page, {"lc": lc, "lp": lp, "pb": pb, "compressed": len(z), "loader": len(loader), "encoding": encoding, "node": node, "bg": op[0] if op else "none", "page": page_note}


def main():
    ap = argparse.ArgumentParser(description="Pack one HTML file into a smaller self-unpacking HTML file.")
    ap.add_argument("input"); ap.add_argument("output")
    ap.add_argument("--title", default=""); ap.add_argument("--head", default="", help="extra HTML for the wrapper's head (for example a Content-Security-Policy meta tag)")
    ap.add_argument("--encoding", default="bytes", choices=["bytes", "base64"]); ap.add_argument("--tune", action="store_true")
    ap.add_argument("--minifier", default="auto", choices=["auto", "terser", "esbuild", "none"])
    ap.add_argument("--bg", default="auto", help="background color of the 'Opening...' line: auto (read it from the input), none, or a color like #101018")
    ap.add_argument("--minify-page", action="store_true", help="first minify the page's own inline classic scripts (terser or esbuild needed); top-level names are kept")
    ap.add_argument("--skip-node-check", action="store_true", help="do not run the packed page's own decoder in Node after packing")
    a = ap.parse_args()
    data = pathlib.Path(a.input).read_bytes()
    page, info = pack(data, a.title, a.head, a.encoding, a.minifier, a.tune, a.bg, not a.skip_node_check, a.minify_page)
    pathlib.Path(a.output).write_bytes(page)
    print("%s: %d bytes -> %d bytes (%.1f%%)  [lzma lc=%d lp=%d pb=%d, payload %d, loader %d, %s, opening bg %s, node check %s]" % (a.output, len(data), len(page), 100.0 * len(page) / max(1, len(data)), info["lc"], info["lp"], info["pb"], info["compressed"], info["loader"], info["encoding"], info["bg"], info["node"]))
    if info.get("page"):
        print("page minifier: " + info["page"])


if __name__ == "__main__":
    main()
