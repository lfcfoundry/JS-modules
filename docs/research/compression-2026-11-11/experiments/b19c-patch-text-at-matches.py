# Copyright (c) 2026 LFC Foundry. MIT License.
# usage: python3 b19c-patch-text-at-matches.py in.js out.js (after b19c-patch-common-values.py)
# research B19c: B19b text columns: walk the separators with the engine's indexOf on the decoded text (all-ASCII frames), instead of a JavaScript loop over every byte (microbench, 200k GitHub actors at 8% matches: 6.3 -> 3.7 ms; repos 10.9 -> 5.5 ms)
import sys
src, dst = sys.argv[1], sys.argv[2]; s = open(src, encoding='latin-1').read()
a = s.index("    if (t === 's') { f = frames[0]; k = 0; q = 0; a = 0; var hi = 0,"); b = s.index("      return o; }", a) + len("      return o; }")
new = """    if (t === 's') { f = frames[0]; var big = tdr.decode(f), x; k = 0; q = 0; a = 0;
      if (big.length === f.length) { while (q < m) { x = big.indexOf('\\0', a); if (x < 0) x = big.length; if (k === vi[q]) o[q++] = big.substring(a, x); else if (x === big.length) return null; k++; a = x + 1; } return o; }   // all ASCII: one character per byte
      var sp = big.split('\\0'); if (sp.length < n) return null; for (q = 0; q < m; q++) o[q] = sp[vi[q]]; return o; }"""
s = s[:a] + new + s[b:]
open(dst, 'w', encoding='latin-1').write(s)
