# Copyright (c) 2026 LFC Foundry. MIT License.
# usage: python3 b20-patch-json-cells.py built/lfc-pack.js out.js
# research: fast path for JSON-per-cell ('j') columns: exact 'null', and numbers whose canonical text round-trips (String(x) === s), skip JSON.parse
import sys
src, dst = sys.argv[1], sys.argv[2]; s = open(src, encoding='latin-1').read()
old = "for (i = 0; i < n; i++) o[i] = JSON.parse(js[i]); return o;"
assert s.count(old) == 1
new = "if (V8 || GECKO) { for (i = 0; i < n; i++) o[i] = jcell(js[i]); return o; } for (i = 0; i < n; i++) o[i] = JSON.parse(js[i]); return o;"
s = s.replace(old, new)
old2 = "var js = n ? tdr.decode(frames[0]).split('\\n') : [];"
assert s.count(old2) == 1, s.count(old2)
s = s.replace(old2, "if (n && jnulls(frames[0], n)) { o = new Array(n); for (i = 0; i < n; i++) o[i] = null; return o; } " + old2)
k = "  // returns null when the input is not flat rows"
assert s.count(k) == 1
s = s.replace(k, "  // 'j' cells: most are null, true, false or whole numbers; JSON.parse per cell costs about 80 ns, so read those by hand (whole numbers of up to 15 characters, digits only, no leading zero, are exact in a double); anything else goes to JSON.parse. Chromium and Firefox only: in WebKitGTK the per-cell reader was slower than JSON.parse (cloud WebKitGTK 2.52.6, 100,000 orders: unpackColumns 1.08 to 1.20 of the time), so it keeps JSON.parse there; the all-null check runs in every engine\n  function jnulls(f, n) { if (f.length !== n * 5 - 1) return false; for (var i = 0; i < f.length; i += 5) if (f[i] !== 110 || f[i + 1] !== 117 || f[i + 2] !== 108 || f[i + 3] !== 108 || (i + 4 < f.length && f[i + 4] !== 10)) return false; return true; }\n  function jcell(s) { var c0 = s.charCodeAt(0), L = s.length, i, v, d; if (c0 === 110 && s === 'null') return null; if (c0 === 116 && s === 'true') return true; if (c0 === 102 && s === 'false') return false; if (L <= 15) { i = c0 === 45 ? 1 : 0; if (i < L && (s.charCodeAt(i) !== 48 || L === i + 1)) { v = 0; for (; i < L; i++) { d = s.charCodeAt(i) - 48; if (d < 0 || d > 9) break; v = v * 10 + d; } if (i === L) return c0 === 45 ? -v : v; } } return JSON.parse(s); }\n" + k)
open(dst, 'w', encoding='latin-1').write(s)
