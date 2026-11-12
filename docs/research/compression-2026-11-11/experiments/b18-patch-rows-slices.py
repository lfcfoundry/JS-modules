# Copyright (c) 2026 LFC Foundry. MIT License.
# research prototype B18: packRows on a big array stringifies it in slices that fit the tokenizer buffer, so each slice takes the wasm comma scan instead of the JavaScript scan of one huge text. Same bytes. usage: python3 patch_b18.py <module dir>
import sys, os
p = os.path.join(sys.argv[1], 'src/api.js'); s = open(p).read()
a = "  function rowsBytes(rows) {\n    var n = rows.length, i, r, t;"
assert s.count(a) == 1
b = """  function rowsBytes(rows) {   // research B18: a big array goes in slices that each fit the tokenizer buffer (same bytes as one pass)
    var n = rows.length, X = S.sh && S.sh.x, ip = n > 4096 && X ? X.in_reserve(16) : 0;
    if (!ip) return rowsBytes1(rows);
    var room = Math.max(S.sh.mem.buffer.byteLength - ip - 16, BLOCK_BYTES + (BLOCK_BYTES >> 2)), est = JSON.stringify(rows.slice(0, 1024)).length / 1024 + 1;
    if (est * n * 1.25 <= room) return rowsBytes1(rows);
    var step = Math.max(1024, Math.floor(room / 3 / est)), parts = [], tot = 0, a, q, o;
    for (a = 0; a < n; a += step) { q = rowsBytes1(rows.slice(a, a + step)); parts.push(q); tot += q.length; }
    o = new Uint8Array(tot); for (a = 0, tot = 0; a < parts.length; a++) { o.set(parts[a], tot); tot += parts[a].length; }
    return o;
  }
  function rowsBytes1(rows) {
    var n = rows.length, i, r, t;"""
s = s.replace(a, b); open(p, 'w').write(s)
