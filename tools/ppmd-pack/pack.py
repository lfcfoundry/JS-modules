#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
"""ppmd-pack: turn one HTML file into a smaller self-unpacking HTML file with PPMd.  MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/lfcfoundry/JS-modules
Version 1.0.0 (API 1)

  python3 tools/ppmd-pack/pack.py INPUT.html OUTPUT.html [--title T] [--head HTML] [--encoding bytes|base64] [--order N] [--mem BYTES] [--tune] [--compare]
                                  [--minifier auto|terser|esbuild|none] [--minify-page] [--bg auto|none|COLOR] [--skip-node-check]

The output is a small page that holds the PPMd-compressed input (PPMd variant H, "PPMd7" as 7-Zip writes it, with the 7z range coder) and a decoder
(modules/ppmd-decode/ppmd-decode.js). When opened it checks a hash of the compressed bytes, unpacks the input, checks a hash of the result too, and replaces itself with it (document.write). If a hash
does not match (for example the file was opened and saved as text, or cut short) it shows a plain message instead of running anything. The page is built exactly
like the one tools/lzma-pack makes (same wrapper, same 'Opening...' line, same options), and this tool reuses that packer's helpers.

PPMd usually beats LZMA by 5 to 20 percent on pages of text and code of 20 KB and up, but its decoder is about 5 KB bigger and 4 to 8 times slower, so it pays
off only for larger pages (roughly 60 KB of compressed data and up). Below that, use tools/lzma-pack. --compare shows both sizes for your file.

MEMORY NOTE: the unpacking page allocates --mem bytes (the model memory) at start, plus the size of the page itself, and frees them afterwards. The default is
the smallest power of two that is at least 8 times the input size, kept between 1 MB and 16 MB, which was within about 1 to 5 percent of the best setting when measured.
The decoder must use the same order and memory as the encoder, so both are written into the loader; a phone that cannot find that memory shows the
'This file was changed' message instead of the page.

--order N          model order, 2 to 64 (default 12). Higher orders help on repetitive pages (code, data) and cost time.
--mem BYTES        model memory, 2048 and up (default as above; a K or M suffix is accepted: 4M). Bigger is better until the model stops filling it.
--tune             try orders 4, 6, 8, 12, 16, 24, 32 with memory 1, 2, 4, 8, 16 MB (capped by the input size) and keep the smallest result. Replaces --order and
                   --mem. Slow: about 35 pure-Python encodings, spread over all processors.
--compare          also build the LZMA packer's page for the same input and report both payloads and both net page sizes (payload plus loader).
--encoding bytes   (default) store the compressed bytes raw and declare the page windows-1252 so each byte is one character. Smallest. Works from file:// and from
                   servers that send no charset. Does NOT work from a server that sends 'Content-Type: text/html; charset=utf-8' (GitHub Pages does).
--encoding base64  store the bytes as base64 text. About a third bigger, but safe on any server and any editor.
--bg               the color behind the 'Opening...' line shown while the page unpacks: auto (default, read from the input), none, or a color such as "#101018".
--minify-page      first minify the page's own inline classic scripts (terser or esbuild needed), then pack.

After packing, the tool runs the page's own scripts (the shipped decoder, the byte reader and the hash) in a bare Node.js sandbox and requires the original page back,
with no error message and no global variable left behind. That is the check that matters; it needs Node.js (without it the packer says so and the result is NOT
verified; --skip-node-check turns it off on purpose). The input must be valid UTF-8, because the loader decodes the page as UTF-8; anything else is refused.
A leading byte order mark is allowed, but the unpacked page comes back without it. The encoder is pure Python (ppmd7_encode.py, about 90 to 100 KB of input per second).
Needs only Python 3 (standard library). A minifier (terser or esbuild: on PATH, in a node_modules/.bin, or named by the TERSER or ESBUILD environment variable) shrinks the loader.
"""
import argparse, base64, importlib.util, json, pathlib, re, shutil, subprocess, sys

sys.dont_write_bytecode = True   # importing lzma-pack's pack.py and the encoder should not leave __pycache__ folders behind
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ppmd7_encode  # noqa: E402


def _load_lzma_pack():
    path = HERE.parent / "lzma-pack" / "pack.py"
    if not path.exists():
        raise SystemExit("ppmd-pack reuses tools/lzma-pack/pack.py, which was not found at " + str(path))
    spec = importlib.util.spec_from_file_location("_lzma_pack_helpers", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


lz = _load_lzma_pack()
DECODER = HERE.parent.parent / "modules" / "ppmd-decode" / "ppmd-decode.js"
PAYLOAD_NAME = "__ppmdPackedPayload_5c2e8d14"   # a global, copied into a local by the loader and deleted at once (see tools/lzma-pack)
FAIL_MESSAGE = ("This file was changed (maybe opened and saved as text, or cut short) or the device has too little free memory. "
                "Please download it again and open the file itself in a browser.")
MB = 1 << 20
ORDERS = (4, 6, 8, 12, 16, 24, 32)
MEMS = tuple(m * MB for m in (1, 2, 4, 8, 16))
DEFAULT_ORDER = 12


# Courtesy credit, written into every packed page (PPMd is public domain, so this is not a legal duty).
CREDIT = (b"<!-- Compressed with PPMd, algorithm by Dmitry Shkarin (PPMd variant H), public-domain code by Igor Pavlov (7-Zip), "
          b"JavaScript and Python port by LFC Foundry (MIT License). -->")


def default_mem(size):
    """The smallest power of two that is at least 8 times the input size, kept between 1 MB and 16 MB."""
    m = MB
    while m < 8 * size and m < 16 * MB:
        m *= 2
    return m


def tune_grid(size):
    """Orders x memory sizes to try: memory is capped at the smallest power of two that is at least 16 times the input size (never below 1 MB, never above 16 MB)."""
    cap = MB
    while cap < 16 * size and cap < 16 * MB:
        cap *= 2
    return [(o, m) for o in ORDERS for m in MEMS if m <= cap]


def best_of(data, grid, jobs=None):
    """Encode `data` with every (order, mem) in the grid, spread over the processors, and return (stream, order, mem) of the smallest."""
    import os
    jobs = jobs or os.cpu_count() or 1
    work = [(data, o, m) for o, m in grid]
    results = None
    if jobs > 1 and len(work) > 1:
        try:
            from concurrent.futures import ProcessPoolExecutor
            with ProcessPoolExecutor(max_workers=min(jobs, len(work))) as ex:
                results = list(ex.map(ppmd7_encode.encode_job, work))
        except Exception:   # no process pool here (restricted system): fall back to one process
            results = None
    if results is None:
        results = [ppmd7_encode.encode_job(w) for w in work]
    best = min(results, key=lambda r: (len(r[2]), r[0], r[1]))   # ties go to the smaller order, then the smaller memory
    return best[2], best[0], best[1]


# the same Node sandbox as lzma-pack's, with the decoder's name swapped in for the leak check
NODE_HARNESS = lz.NODE_HARNESS.replace("lzmaDecode", "ppmd7Decode")
assert "ppmd7Decode" in NODE_HARNESS


def node_roundtrip(page, data):
    """Run the packed page's own scripts in Node and compare with the input. Returns 'ok', or 'skipped' when Node is not installed."""
    node = shutil.which("node")
    if not node:
        print("note: Node.js was not found, so the packed page's own JavaScript decoder and hash were NOT run here, and nothing has verified the packed data. "
              "Install Node to turn this check on.", file=sys.stderr)
        return "skipped"
    scripts = re.findall(r"<script>(.*?)</script>", lz.cp1252_text(page), re.S)
    if len(scripts) != 2:
        raise SystemExit("self-check failed: expected 2 scripts in the packed page, found %d" % len(scripts))
    text = data.decode("utf-8")
    if text.startswith("﻿"):
        text = text[1:]   # the loader's TextDecoder drops a byte order mark
    payload = json.dumps({"scripts": scripts, "expected": text, "name": PAYLOAD_NAME}, ensure_ascii=False).encode("utf-8")
    try:
        r = subprocess.run([node, "-e", NODE_HARNESS], input=payload, capture_output=True, timeout=900)
    except subprocess.TimeoutExpired:
        raise SystemExit("self-check failed: the packed page's decoder did not finish in Node within 15 minutes")
    if r.returncode != 0:
        raise SystemExit("the Node check could not run: " + r.stderr.decode("utf-8", "replace")[:300])
    res = json.loads(r.stdout.decode("utf-8"))
    if not res["ok"]:
        raise SystemExit("self-check failed with the page's own JavaScript decoder: " + res["reason"])
    return "ok"


def sum31(bs):
    """The 32-bit 'multiply by 31' sum the loader computes (it catches accidents, not tampering)."""
    h = 0
    for b in bs:
        h = (h * 31 + b) & 0xFFFFFFFF
    return h


def decoder_source():
    """The decoder for the page: modules/ppmd-decode/ppmd-decode.js cut at the export block, without its checks for outside files and with bare throws."""
    s = DECODER.read_text(encoding="utf-8")
    if "\nif (typeof module" not in s:
        raise SystemExit("pack.py: " + str(DECODER) + " has no export block starting with 'if (typeof module'")
    s = s[:s.index("\nif (typeof module")]
    # The packer made the stream itself, so the loader skips the checks meant for outside files (lines marked "lean-cut"), and the page shows its own
    # message for any failure, so each long error message becomes a bare throw.
    s = "\n".join(l for l in s.split("\n") if not l.rstrip().endswith("// lean-cut"))
    s = re.sub(r"throw new Error\((?:[^()]|\([^()]*\))*\)", "throw 0", s)
    s = re.sub(r"\A\s*/\*.*?\*/\s*", "", s, count=1, flags=re.S)   # the long header comment (a minifier would drop it too)
    if "Error(" in s or "lean-cut" in s:
        raise SystemExit("pack.py: an error message or a lean-cut line in ppmd-decode.js was not removed; update the patterns in decoder_source()")
    return s


def pack(data, title="", head="", encoding="bytes", minifier="auto", tune=False, bg="auto", check_node=True, minify_pg=False,
         order=None, mem=None, compare=False, jobs=None):
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as e:
        raise SystemExit("the input is not valid UTF-8 (first bad byte at offset %d). Save the page as UTF-8 and pack it again: the loader "
                         "decodes the unpacked page as UTF-8, so any other encoding would come out garbled." % e.start)
    if encoding not in ("bytes", "base64"):
        raise SystemExit("--encoding must be bytes or base64")
    if order is not None and not (2 <= order <= 64):
        raise SystemExit("--order must be a whole number from 2 to 64")
    if mem is not None and not (2048 <= mem <= 2147483600):
        raise SystemExit("--mem must be at least 2048 bytes (and below 2 GB)")
    page_note = ""
    if minify_pg:   # smaller input, so a smaller payload; the checks below then compare against the minified page, which is what gets unpacked
        text2, done, skipped = lz.minify_page(text, minifier)
        page_note = "%d script(s) minified, %d left alone, %d bytes saved before packing" % (done, skipped, len(data) - len(text2.encode("utf-8")))
        data = text2.encode("utf-8")
    if tune:
        z, order, mem = best_of(data, tune_grid(len(data)), jobs)
    else:
        order = DEFAULT_ORDER if order is None else order
        mem = default_mem(len(data)) if mem is None else mem
        z = ppmd7_encode.encode(data, order, mem)
    chk, chkz = sum31(data), sum31(z)
    dec = decoder_source()
    if encoding == "bytes":
        key = min(range(256), key=lambda k: len(lz.js_escape(bytes(b ^ k for b in z))))
        payload = lz.js_escape(bytes(b ^ key for b in z))
        read = ("var T=%s,i=0,z=new Uint8Array(s.length),c;for(;i<s.length;i++){c=s.charCodeAt(i);z[i]=(c<256?c:128+T.indexOf(c))^%d}" % (json.dumps(lz.CP1252_HI, separators=(",", ":")), key))
        meta = b'<meta charset="windows-1252">'
    else:
        payload = base64.b64encode(z)
        read = "var i=0,z=Uint8Array.from(atob(s),function(c){return c.charCodeAt(0)});"
        meta = b'<meta charset="utf-8">'
    # The loader copies the payload into a local variable and deletes the global at once; the decoder and every other name live inside the timer function.
    # The compressed bytes are checked BEFORE decoding: the loader leaves out the decoder's checks for outside input, and a damaged PPMd stream can make the
    # decoder spin forever instead of failing, so a re-saved or cut file must be refused first. The unpacked page is checked as well.
    src = ("setTimeout(function(){" + dec + "\nvar s=" + PAYLOAD_NAME + ";delete window." + PAYLOAD_NAME + ";" + read + "var o,t;"
           "function H(a){for(var h=0,i=0;i<a.length;i++)h=(h*31+a[i])>>>0;return h}"
           "try{if(H(z)!=%d)throw 0;o=ppmd7Decode(z,%d,%d,%d);if(H(o)!=%d)throw 0;t=new TextDecoder().decode(o);document.open();document.write(t);document.close()}"
           "catch(e){document.body.textContent=%s}},30)") % (chkz, len(data), order, mem, chk, json.dumps(FAIL_MESSAGE))
    loader = lz.minify(src, minifier)
    title_html = ("<title>" + title.replace("&", "&amp;").replace("<", "&lt;") + "</title>").encode("ascii", "xmlcharrefreplace") if title else b""
    op = lz.opening_style(bg, text)   # the "Opening..." line, in the page's own background color, so a dark page never flashes white
    body = (b'<body style="' + op[1].encode("ascii") + b'">Opening...') if op else b'<body>'
    page = (b'<!doctype html>' + meta + b'<meta name="viewport" content="width=device-width,initial-scale=1">' + CREDIT + head.encode("ascii", "xmlcharrefreplace") + title_html
            + body + b'<script>' + PAYLOAD_NAME.encode() + b'="' + payload + b'"</script><script>' + loader + b'</script>')   # the payload sits in its own script so a minifier cannot fold it
    # the check that matters: run what actually ships (JavaScript decoder, byte reader and hash) in Node
    node = node_roundtrip(page, data) if check_node else "off"
    info = {"order": order, "mem": mem, "compressed": len(z), "loader": len(loader), "encoding": encoding, "node": node,
            "bg": op[0] if op else "none", "page": page_note, "tuned": bool(tune)}
    if compare:   # the LZMA packer's page for the same input, built with the same wrapper options
        lpage, linfo = lz.pack(data, title, head, encoding, minifier, False, bg, False, False)
        info["compare"] = {"lzma_payload": linfo["compressed"], "lzma_loader": linfo["loader"], "lzma_page": len(lpage),
                           "ppmd_payload": len(z), "ppmd_loader": len(loader), "ppmd_page": len(page)}
    return page, info


def size_arg(text):
    """A byte count such as 1048576, 512K or 4M."""
    m = re.fullmatch(r"(\d+)([kKmM]?)", text.strip())
    if not m:
        raise argparse.ArgumentTypeError("a whole number of bytes, optionally with K or M (for example 4M)")
    return int(m.group(1)) * {"": 1, "k": 1024, "m": MB}[m.group(2).lower()]


def main():
    ap = argparse.ArgumentParser(description="Pack one HTML file into a smaller self-unpacking HTML file with PPMd. "
                                 "The unpacking page allocates the model memory (--mem bytes) at start and frees it afterwards.")
    ap.add_argument("input"); ap.add_argument("output")
    ap.add_argument("--title", default=""); ap.add_argument("--head", default="", help="extra HTML for the wrapper's head (for example a Content-Security-Policy meta tag)")
    ap.add_argument("--encoding", default="bytes", choices=["bytes", "base64"])
    ap.add_argument("--order", type=int, default=None, help="model order, 2 to 64 (default 12)")
    ap.add_argument("--mem", type=size_arg, default=None, help="model memory in bytes, K/M suffix allowed (default: smallest power of two >= 8x the input, 1 MB to 16 MB). "
                    "The page allocates this much at start")
    ap.add_argument("--tune", action="store_true", help="try orders 4-32 and memory 1-16 MB (capped by the input size), keep the smallest result; slow, replaces --order and --mem")
    ap.add_argument("--compare", action="store_true", help="also report the LZMA packer's payload and net page size for this input")
    ap.add_argument("--minifier", default="auto", choices=["auto", "terser", "esbuild", "none"])
    ap.add_argument("--bg", default="auto", help="background color of the 'Opening...' line: auto (read it from the input), none, or a color like #101018")
    ap.add_argument("--minify-page", action="store_true", help="first minify the page's own inline classic scripts (terser or esbuild needed); top-level names are kept")
    ap.add_argument("--skip-node-check", action="store_true", help="do not run the packed page's own decoder in Node after packing")
    a = ap.parse_args()
    data = pathlib.Path(a.input).read_bytes()
    if a.tune:
        print("tuning: %d settings, one pure-Python encoding each (this takes a while)..." % len(tune_grid(len(data))), file=sys.stderr)
    page, info = pack(data, a.title, a.head, a.encoding, a.minifier, a.tune, a.bg, not a.skip_node_check, a.minify_page, a.order, a.mem, a.compare)
    pathlib.Path(a.output).write_bytes(page)
    print("%s: %d bytes -> %d bytes (%.1f%%)  [ppmd order=%d mem=%d%s, payload %d, loader %d, %s, opening bg %s, node check %s]" % (
        a.output, len(data), len(page), 100.0 * len(page) / max(1, len(data)), info["order"], info["mem"], " (tuned)" if info["tuned"] else "",
        info["compressed"], info["loader"], info["encoding"], info["bg"], info["node"]))
    if info.get("page"):
        print("page minifier: " + info["page"])
    c = info.get("compare")
    if c:
        d = c["ppmd_page"] - c["lzma_page"]
        print("compare: LZMA payload %d + loader %d = page %d; PPMd payload %d + loader %d = page %d; PPMd page is %d bytes %s (%.1f%%)" % (
            c["lzma_payload"], c["lzma_loader"], c["lzma_page"], c["ppmd_payload"], c["ppmd_loader"], c["ppmd_page"], abs(d),
            "smaller" if d < 0 else "bigger", 100.0 * abs(d) / c["lzma_page"]))
        print("         PPMd also decodes about 4 to 8 times slower and allocates %d bytes of model memory; see the README before choosing it." % info["mem"])


if __name__ == "__main__":
    main()
