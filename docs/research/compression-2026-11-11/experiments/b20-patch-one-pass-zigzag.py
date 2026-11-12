# Copyright (c) 2026 LFC Foundry. MIT License.
# usage: python3 b20-patch-one-pass-zigzag.py in.js out.js (blocks of 16,384+ values only; owner pick 11.12: fix the small-file cost first)
# research: zigzag number columns (not mono, not delta) decoded in one pass: varint, zigzag with integer ops for values under 2^21, divide by scale, all in one loop (today: three loops over a Float64Array)
import sys
src, dst = sys.argv[1], sys.argv[2]; s = open(src, encoding='latin-1').read()
old = "function colV(frames, n, p) { var i, u, o; u = unvarints(frames[0], n);"
assert s.count(old) == 1
s = s.replace(old, "function colV(frames, n, p) { var i, u, o; if (!p.mono && !p.delta && n >= 16384) { u = colZZ(frames[0], n, p.scale); return p.scale !== 1 ? u : narrow(u); } u = unvarints(frames[0], n);")
k = "  function colV(frames, n, p) {"
s = s.replace(k, """  function colZZ(b, n, sc) { var out = new Float64Array(n), p = 0, i, c, u, m;
    for (i = 0; i < n; i++) { c = b[p++];
      if (c < 128) { out[i] = ((c >>> 1) ^ -(c & 1)) / sc; continue; }
      u = c & 127; c = b[p++]; if (c < 128) { u += c << 7; out[i] = ((u >>> 1) ^ -(u & 1)) / sc; continue; }
      u += (c & 127) << 7; c = b[p++]; if (c < 128) { u += c << 14; out[i] = ((u >>> 1) ^ -(u & 1)) / sc; continue; }
      u += (c & 127) << 14; m = 2097152; do { c = b[p++]; u += (c & 127) * m; m *= 128; } while (c & 128); out[i] = unzz(u) / sc; }
    return out; }
""" + k, 1)
open(dst, 'w', encoding='latin-1').write(s)
