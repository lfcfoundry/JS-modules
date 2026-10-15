#!/usr/bin/env python3
"""lzma-pack: turn one HTML file into a smaller self-unpacking HTML file.  MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/JNFoo/JS-modules

  python3 tools/pack.py INPUT.html OUTPUT.html [--title T] [--head HTML] [--encoding bytes|base64] [--tune] [--minifier auto|terser|esbuild|none]

The output is a tiny page that holds the LZMA-compressed input and a small decoder (modules/lzma-decode/lzma-decode.js). When opened it
unpacks the input, checks a hash of the result, and replaces itself with it (document.write). If the hash does not match
(for example the file was opened and saved as text, or cut short) it shows a plain message instead of running anything.

--encoding bytes   (default) store the compressed bytes raw and declare the page windows-1252 so each byte is one character.
                   Smallest. Works from file:// and from servers that send no charset. Does NOT work from a server that sends
                   'Content-Type: text/html; charset=utf-8' (GitHub Pages does): the header overrides the page's own charset.
--encoding base64  store the bytes as base64 text. About a third bigger, but safe on any server and any editor.
--tune             try a few LZMA settings (lc 0-4, pb 0-2) and keep the smallest result (slower).
Needs only Python 3 (standard library). A minifier (terser or esbuild: on PATH, in a node_modules/.bin, or named by the TERSER or ESBUILD environment variable) shrinks the loader by about 5 KB; without one the loader is embedded as is.
"""
import argparse, base64, json, lzma, pathlib, shutil, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
DECODER = HERE.parent.parent / "modules" / "lzma-decode" / "lzma-decode.js"
# What a browser makes of the bytes 0x80-0x9F when a page is read as windows-1252 (the WHATWG table; the five gaps map to the same-numbered control characters)
CP1252_HI = [8364, 129, 8218, 402, 8222, 8230, 8224, 8225, 710, 8240, 352, 8249, 338, 141, 381, 143, 144, 8216, 8217, 8220, 8221, 8226, 8211, 8212, 732, 8482, 353, 8250, 339, 157, 382, 376]


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


def minify(src, which):
    m = find_minifier(which)
    if not m:
        if which not in ("auto", "none"):
            raise SystemExit("minifier not found: " + which)
        return src.encode("utf-8")
    name, path = m
    cmd = [path, "--ecma", "2020", "--compress", "passes=3,toplevel=true", "--mangle", "toplevel=true"] if name == "terser" else [path, "--minify", "--target=es2020"]
    r = subprocess.run(cmd, input=src, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(name + " failed: " + r.stderr[:300])
    out = r.stdout.strip()
    try:
        return out.encode("ascii")
    except UnicodeEncodeError:   # the loader must be pure ASCII because the page is read as windows-1252
        return out.encode("ascii", "backslashreplace")


def decoder_source():
    s = DECODER.read_text(encoding="utf-8")
    cut = s.index("function lzmaDecodeFile")   # the page does not need the .lzma-file helper or the module export lines
    return s[:cut]


def pack(data, title="", head="", encoding="bytes", minifier="auto", tune=False):
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
    src = ("setTimeout(function(){" + dec + read + "var o,h=0,t;"
           "try{o=lzmaDecode(z,%d,{lc:%d,lp:%d,pb:%d});for(i=0;i<o.length;i++)h=(h*31+o[i])>>>0;if(h!=%d)throw 0;t=new TextDecoder().decode(o);document.open();document.write(t);document.close()}"
           "catch(e){document.body.textContent=\"This file was changed (maybe opened and saved as text, or cut short). Please download it again and open the file itself in a browser.\"}})") % (len(data), lc, lp, pb, chk)
    loader = minify(src, minifier)
    title_html = ("<title>" + title.replace("&", "&amp;").replace("<", "&lt;") + "</title>").encode("ascii", "xmlcharrefreplace") if title else b""
    page = (b'<!doctype html>' + meta + b'<meta name="viewport" content="width=device-width,initial-scale=1">' + head.encode("ascii", "xmlcharrefreplace") + title_html
            + b'<body><script>var s="' + payload + b'"</script><script>' + loader + b'</script>')   # the payload sits in its own script so a minifier cannot fold it
    # self-check with the reference implementation: unpack the payload with Python's lzma and compare
    f = [{"id": lzma.FILTER_LZMA1, "dict_size": 1 << 20, "lc": lc, "lp": lp, "pb": pb}]
    back = lzma.LZMADecompressor(format=lzma.FORMAT_RAW, filters=f).decompress(b"\x00" + z, max_length=len(data))
    if back != data:
        raise SystemExit("self-check failed: the compressed data does not unpack to the input")
    return page, {"lc": lc, "lp": lp, "pb": pb, "compressed": len(z), "loader": len(loader), "encoding": encoding}


def main():
    ap = argparse.ArgumentParser(description="Pack one HTML file into a smaller self-unpacking HTML file.")
    ap.add_argument("input"); ap.add_argument("output")
    ap.add_argument("--title", default=""); ap.add_argument("--head", default="", help="extra HTML for the wrapper's head (for example a Content-Security-Policy meta tag)")
    ap.add_argument("--encoding", default="bytes", choices=["bytes", "base64"]); ap.add_argument("--tune", action="store_true")
    ap.add_argument("--minifier", default="auto", choices=["auto", "terser", "esbuild", "none"])
    a = ap.parse_args()
    data = pathlib.Path(a.input).read_bytes()
    page, info = pack(data, a.title, a.head, a.encoding, a.minifier, a.tune)
    pathlib.Path(a.output).write_bytes(page)
    print("%s: %d bytes -> %d bytes (%.1f%%)  [lzma lc=%d lp=%d pb=%d, payload %d, loader %d, %s]" % (a.output, len(data), len(page), 100.0 * len(page) / max(1, len(data)), info["lc"], info["lp"], info["pb"], info["compressed"], info["loader"], info["encoding"]))


if __name__ == "__main__":
    main()
