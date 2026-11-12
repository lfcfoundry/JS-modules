# Copyright (c) 2026 LFC Foundry. MIT License.
# research prototype: null plane (column type N) in a copy of lfc-pack; usage: python3 patch_null.py <module dir>
import sys, os
d = sys.argv[1]; p = os.path.join(d, 'src/flat.js'); s = open(p).read()
old = "  function encodeColumn(v, zs, level, tmode, sj, key) { return settle(zs, level, encodeColumn0(v, zs, level, tmode, sj, key)); }\n"
new = """  function encodeColumn(v, zs, level, tmode, sj, key) { var nb = nullBest(v, zs, level, tmode, key); if (nb) return nb; return settle(zs, level, encodeColumn0(v, zs, level, tmode, sj, key)); }
  // research prototype (null plane, type N): a column whose values are one scalar kind plus some nulls keeps the typed encoding of its non-null values, plus one bit plane that marks the nulls
  var NULL_MODE = (typeof globalThis !== 'undefined' && globalThis.__NULLMODE) || 'plane';
  function nullBest(v, zs, level, tmode, key) {
    var n = v.length, i, x, k = null, m = 0, kind;
    if (NULL_MODE === 'off') return null;
    for (i = 0; i < n; i++) { x = v[i]; if (x === null) continue; kind = typeof x; if (kind !== 'number' && kind !== 'boolean' && kind !== 'string') return null; if (k === null) k = kind; else if (k !== kind) return null; m++; }
    if (k === null || m === n) return null;
    var nn = new Array(m), pl = new Uint8Array((n + 7) >> 3); for (i = 0, m = 0; i < n; i++) { if (v[i] === null) pl[i >> 3] |= 1 << (i & 7); else nn[m++] = v[i]; }
    var inner = settle(zs, level, encodeColumn0(nn, zs, level, tmode, undefined, key));
    if (inner.t === 'j') return null;
    var pz = zs.compress(pl, level), pzz = pz.length < pl.length ? [pl.length, pz, 1] : [pl.length, pl, 0];
    var size = pzz[1].length; for (i = 0; i < inner.z.length; i++) size += inner.z[i][1].length;
    if (NULL_MODE === 'both') { var j = settle(zs, level, encodeColumn0(v, zs, level, tmode, undefined, key)); if (j.size <= size) return j; }
    return { t: 'N', p: { t: inner.t, p: inner.p, m: m }, n: n, z: [pzz].concat(inner.z), size: size, nn: nn };
  }
"""
assert s.count(old) == 1; s = s.replace(old, new)
old = "    if (t === 'V') return colV(frames, n, p);\n"
new = """    if (t === 'N') { var iv = decodeColumn({ t: p.t, p: p.p, n: p.m }, zs, frames.slice(1)), pn = frames[0], q = 0; o = new Array(n); if (pn.length < (n + 7) >> 3) throw new Error('damaged block: N plane cut off'); for (i = 0; i < n; i++) o[i] = (pn[i >> 3] >> (i & 7)) & 1 ? null : iv[q++]; if (q !== p.m) throw new Error('damaged block: N count'); return o; }
""" + old
assert s.count(old) == 1; s = s.replace(old, new)
# zone maps for N columns with number values (min/max of the non-null values), both writers
old = "      if ((e.t === 'V' || e.t === 'B' || e.t === 'F') && cols[j].length) {"
new = "      if (e.t === 'N' && (e.p.t === 'V' || e.p.t === 'B' || e.p.t === 'F') && e.nn.length) { var mnN = Infinity, mxN = -Infinity; for (i = 0; i < e.nn.length; i++) { if (e.nn[i] < mnN) mnN = e.nn[i]; if (e.nn[i] > mxN) mxN = e.nn[i]; } zone.push([fnvStr('.' + keys[j]), mnN, mxN, e.n]); }\n" + old
assert s.count(old) == 1; s = s.replace(old, new)
open(p, 'w').write(s)
print('patched', p)
