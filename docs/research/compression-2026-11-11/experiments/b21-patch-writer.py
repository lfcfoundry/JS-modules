#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
# B21 (research): the general flat writer (writeFlatBlock0), same bytes.
#  a) one pass over the rows instead of two (key discovery and scatter together), guessing each key's column from its
#     position in the previous row (a string compare) before falling back to the Map lookup
#  c) number columns (numbers and nulls) are gathered straight into a Float64Array plus a null bit plane during the scatter, so
#     doubles are not boxed into a generic array and the null-plane pass (nullNumbers) and the number checks do not run again
#     (needs a; a column that meets any other kind of value turns into a generic array at that point)
#  b) an all-null column's 'j' frame ("null\n" repeated) is filled from bytes instead of n JSON.stringify calls
# usage: b21-patch-writer.py in.js out.js [a,b,c]
import sys
src, dst = sys.argv[1], sys.argv[2]; parts = (sys.argv[3] if len(sys.argv) > 3 else 'a,b').split(',')
s = open(src, encoding='utf-8').read()
def rep(old, new):
    global s
    assert s.count(old) == 1, ('anchor', old[:80], s.count(old)); s = s.replace(old, new)
if 'a' in parts:
    rep("""    for (i = 0; i < n; i++) { r = rows[i]; for (k in r) if (!seen.has(k)) { seen.set(k, keys.length); keys.push(k); cols.push([]); } }
    var pb = (n + 7) >> 3, planes = new Uint8Array(pb * keys.length), ord = opts.exact ? { map: new Map(), list: [], ids: new Array(n) } : null, sq;
    for (i = 0; i < n; i++) {
      r = rows[i]; sq = ord ? [] : null;
      for (k in r) { jx = seen.get(k); planes[jx * pb + (i >> 3)] |= 1 << (i & 7); cols[jx].push(r[k]); if (sq) sq.push(jx); }
      if (ord) {""",
"""    var pb = (n + 7) >> 3, ord = opts.exact ? { map: new Map(), list: [], ids: new Array(n) } : null, sq, pk = [], px = [], q, pls = [];
    for (i = 0; i < n; i++) {   // B21a: one pass; a key at the same position as in the previous row is matched by a string compare, not a Map lookup
      r = rows[i]; sq = ord ? [] : null; q = 0;
      for (k in r) { if (pk[q] === k) jx = px[q]; else { jx = seen.get(k); if (jx === undefined) { jx = keys.length; seen.set(k, jx); keys.push(k); cols.push([]); pls.push(new Uint8Array(pb)); } pk[q] = k; px[q] = jx; }
        q++; pls[jx][i >> 3] |= 1 << (i & 7); cols[jx].push(r[k]); if (sq) sq.push(jx); }
      if (ord) {""")
    rep("""    var enc = [], frames = [], meta = { keys: keys, cols: [] }, zone = [];
    for (j = 0; j < cols.length; j++) {""", """    var planes = new Uint8Array(pb * keys.length); for (j = 0; j < pls.length; j++) planes.set(pls[j], j * pb);
    var enc = [], frames = [], meta = { keys: keys, cols: [] }, zone = [];
    for (j = 0; j < cols.length; j++) {""")
if 'b' in parts:
    rep("""    var nulls = 0; for (i = 0; i < n; i++) if (v[i] === null) nulls++;
    cand('j', {}, [te.encode(v.map(jsonText).join('\\n'))], nulls ? { nulls: nulls } : undefined);""",
"""    var nulls = 0; for (i = 0; i < n; i++) if (v[i] === null) nulls++;
    if (nulls === n && n) { var nb5 = new Uint8Array(n * 5 - 1); for (i = 0; i < nb5.length; i += 5) { nb5[i] = 110; nb5[i + 1] = 117; nb5[i + 2] = 108; nb5[i + 3] = 108; if (i + 4 < nb5.length) nb5[i + 4] = 10; } cand('j', {}, [nb5], { nulls: nulls }); return best; }   // B21b: all null, "null" lines filled as bytes
    cand('j', {}, [te.encode(v.map(jsonText).join('\\n'))], nulls ? { nulls: nulls } : undefined);""")
if 'c' in parts:
    assert 'a' in parts
    rep("""        q++; pls[jx][i >> 3] |= 1 << (i & 7); cols[jx].push(r[k]); if (sq) sq.push(jx); }""",
"""        q++; pls[jx][i >> 3] |= 1 << (i & 7); x21 = r[k]; c21 = cs21[jx];
        if (c21.a !== null) c21.a.push(x21); else if (typeof x21 === 'number') { c21.nb[c21.m++] = x21; c21.c++; } else if (x21 === null) { if (c21.np === null) c21.np = new Uint8Array(pb); c21.np[c21.c >> 3] |= 1 << (c21.c & 7); c21.c++; } else { c21.a = b21Generic(c21); c21.a.push(x21); c21.nb = null; }
        if (sq) sq.push(jx); }""")
    rep("""if (jx === undefined) { jx = keys.length; seen.set(k, jx); keys.push(k); cols.push([]); pls.push(new Uint8Array(pb)); }""",
        """if (jx === undefined) { jx = keys.length; seen.set(k, jx); keys.push(k); cols.push(null); cs21.push({ a: null, nb: new Float64Array(n), np: null, m: 0, c: 0 }); pls.push(new Uint8Array(pb)); }""")
    rep("""sq, pk = [], px = [], q, pls = [];""", """sq, pk = [], px = [], q, pls = [], cs21 = [], c21, x21, pre21 = [];""")
    rep("""    var planes = new Uint8Array(pb * keys.length); for (j = 0; j < pls.length; j++) planes.set(pls[j], j * pb);""",
"""    var planes = new Uint8Array(pb * keys.length); for (j = 0; j < pls.length; j++) planes.set(pls[j], j * pb);
    for (j = 0; j < cs21.length; j++) { c21 = cs21[j]; pre21.push(null); if (c21.a !== null) { cols[j] = c21.a; continue; }   // B21c: number columns, typed
      if (c21.m === c21.c && c21.c > 0) { cols[j] = c21.nb.subarray(0, c21.c); pre21[j] = b21Flags(cols[j], c21.c); }
      else if (c21.m > 0 && c21.c > 1 && NULL_MODE === 'plane') { cols[j] = c21; pre21[j] = b21Flags(c21.nb, c21.m); }
      else cols[j] = b21Generic(c21); }""")
    rep("""      var e = encodeColumn(cols[j], zs, level, opts.templates === false ? 0 : opts.templates === true ? 2 : 1, undefined, keys[j]); enc.push(e);""",
"""      var tm21 = opts.templates === false ? 0 : opts.templates === true ? 2 : 1, e;
      if (pre21[j] && cols[j].nb) { c21 = cols[j]; NN_FLAGS[0] = pre21[j].nz; NN_FLAGS[1] = pre21[j].ai; e = nullNumBest({ nn: c21.nb.subarray(0, c21.m), pl: c21.np, m: c21.m, nz: pre21[j].nz, ai: pre21[j].ai }, null, c21.c, zs, level, tm21, keys[j]); if (!e) e = encodeColumn(b21Generic(c21), zs, level, tm21, undefined, keys[j]); cols[j] = []; }
      else if (pre21[j]) e = settle(zs, level, encodeColumn0(cols[j], zs, level, tm21, undefined, keys[j], pre21[j]));
      else e = encodeColumn(cols[j], zs, level, tm21, undefined, keys[j]);
      enc.push(e);""")
    rep("""  function writeFlatBlock0(ctx, input, opts) {""",
"""  function b21Generic(c) { var a = new Array(c.c), i, k = 0; for (i = 0; i < c.c; i++) a[i] = c.np !== null && (c.np[i >> 3] >> (i & 7)) & 1 ? null : c.nb[k++]; return a; }   // B21c: back to a generic array (values in order)
  function b21Flags(a, m) { var nz = 0, ai = 1, i, x; for (i = 0; i < m; i++) { x = a[i]; if (ai && !(x % 1 === 0 && x < 1125899906842624 && x > -1125899906842624)) ai = 0; if (x === 0 && 1 / x < 0) nz = 1; } return { nz: nz, ai: ai }; }
  function writeFlatBlock0(ctx, input, opts) {""")
open(dst, 'w', encoding='utf-8').write(s); print(dst, parts)
