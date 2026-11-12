# Copyright (c) 2026 LFC Foundry. MIT License.
# research prototype B19b (on top of b19-patch-equality-reads.py and b19-patch-cache.py): when few rows of a block match an equality read, the other columns are decoded only at the matching positions where the layout allows it:
# text ('s': one zero-byte scan, then only the matching strings are decoded), dictionary ('D'), true/false ('T') and bit-packed numbers ('B'). Varints ('V') and other kinds are still decoded whole.
# In cache mode a column is decoded at matching positions the first time it is needed and in full (then kept) from the second time on. globalThis.__B19B = 'off' turns it off for A/B timing. usage: python3 b19b-patch-decode-at-matches.py <module dir>
import sys, os
d = sys.argv[1]
p = os.path.join(d, 'src/flat.js'); s = open(p).read()
helpers = r"""
  // B19b: values of column c at value positions vi[0..m) (ascending), or null when this kind is decoded whole
  var B19B = (typeof globalThis !== 'undefined' && globalThis.__B19B) || 'on';
  function bitAt(b, i, w) { var bp = i * w, by = bp >> 3; return ((((b[by] | 0) | ((b[by + 1] | 0) << 8) | ((b[by + 2] | 0) << 16) | ((b[by + 3] | 0) << 24)) >>> (bp & 7)) & ((1 << w) - 1)) >>> 0; }
  function decodeAt(c, frames, vi, m) {
    var t = c.t, p = c.p, n = c.n, o = new Array(m), i, f, k, q, a, cd;
    if (B19B === 'off' || m * 8 > n) return null;   // more than 1 in 8 rows: the whole-column decoders are quicker
    if (t === 's') { f = frames[0]; k = 0; q = 0; a = 0; var hi = 0, st = new Int32Array(m), en = new Int32Array(m);   // byte ranges of the wanted strings; an all-ASCII frame is decoded once and cut, otherwise each wanted string is decoded alone
      for (i = 0; i < f.length; i++) { var by = f[i]; hi |= by; if (by === 0) { if (q < m && k === vi[q]) { st[q] = a; en[q++] = i; } k++; a = i + 1; } }
      if (q < m && k === vi[q]) { st[q] = a; en[q++] = f.length; }
      if (q !== m) return null;
      if (hi < 128) { var big = tdr.decode(f); for (q = 0; q < m; q++) o[q] = big.substring(st[q], en[q]); } else for (q = 0; q < m; q++) o[q] = tdr.decode(f.subarray(st[q], en[q]));
      return o; }
    if (t === 'D') { var lab = tdr.decode(frames[0]).split('\0'); cd = frames[1];
      for (i = 0; i < m; i++) o[i] = lab[p.w ? bitAt(cd, vi[i], p.w) : p.wide ? (cd[vi[i] * 2] | (cd[vi[i] * 2 + 1] << 8)) : cd[vi[i]]]; return o; }
    if (t === 'T') { f = frames[0]; for (i = 0; i < m; i++) o[i] = bitAt(f, vi[i], 1) === 1; return o; }
    if (t === 'B' && p.w <= 24) { f = frames[0]; for (i = 0; i < m; i++) o[i] = (bitAt(f, vi[i], p.w) + p.mn) / p.scale; return o; }
    return null;
  }
"""
a = "  function decodeColumn(c, zs, frames) {   // -> array-like of n values"
assert s.count(a) == 1; s = s.replace(a, helpers + a)
# plain readEq (codes mode): selective decode for the other columns
a = """      var out = new Array(m), vals = new Array(K), v; if (!m) return out;
      for (j = 0; j < K; j++) vals[j] = F.cols[j] === null ? null : F.cols[j].pre ? F.cols[j].pre : (j === jr && rv) ? rv : decodeColumn(meta.cols[j], zs, codes ? frAll(F.cols[j]) : F.cols[j].fr);
      for (i = 0; i < m; i++) out[i] = {};
      for (j = 0; j < K; j++) {
        v = vals[j]; if (!v) continue;
        var key = keys[j], base = j * pb;"""
assert s.count(a) == 1
s = s.replace(a, """      var out = new Array(m), vals = new Array(K), v; if (!m) return out;
      for (i = 0; i < m; i++) out[i] = {};
      for (j = 0; j < K; j++) {
        if (F.cols[j] === null) continue;
        var key = keys[j], base = j * pb;
        if (codes && !F.cols[j].pre && !(j === jr && rv)) { var sv = selAt(meta.cols[j], frAll(F.cols[j]), pl, base, n, sel, m); if (sv) { for (i = 0; i < m; i++) if (sv[0][i] >= 0) out[i][key] = sv[1][i]; continue; } }   // B19b
        v = F.cols[j].pre ? F.cols[j].pre : (j === jr && rv) ? rv : decodeColumn(meta.cols[j], zs, codes ? frAll(F.cols[j]) : F.cols[j].fr);""")
a = "    function eqKeep(F, want, rk, val) {"
assert s.count(a) == 1
s = s.replace(a, """    // B19b: [value position per selected row (-1 = the row lacks the key), values] for column cm, or null to decode whole
    function selAt(cm, frames, pl, base, n, sel, m) {
      var dense = cm.n === n, vi = new Int32Array(m), vv = [], mi = new Int32Array(m), i, c, q, k = 0;
      if (dense) { for (q = 0; q < m; q++) { vi[q] = sel[q]; mi[q] = q; } k = m; }
      else { for (i = 0, c = 0, q = 0; q < m; i++) { var has = (pl[base + (i >> 3)] >> (i & 7)) & 1; if (i === sel[q]) { if (has) { vi[k] = c; mi[q] = k++; } else mi[q] = -1; q++; } if (has) c++; } }
      var got = decodeAt(cm, frames, vi, k); if (!got) return null;
      var pos = new Int32Array(m), out = new Array(m); for (q = 0; q < m; q++) { pos[q] = mi[q]; out[q] = mi[q] >= 0 ? got[mi[q]] : undefined; } return [pos, out];
    }
""" + a)
# cache mode: first use selective, second use full
a = """      for (j = 0; j < K; j++) {
        v = colOf(j); if (!v) continue;
        var key = keys[j], base = j * pb;
        if (v.length === n) { for (i = 0; i < m; i++) out[i][key] = v[sel[i]]; continue; }"""
assert s.count(a) == 1
s = s.replace(a, """      for (j = 0; j < K; j++) {
        if (F.cols[j] === null) continue;
        var key = keys[j], base = j * pb;
        if (bc.vals[j] === undefined && !F.cols[j].pre) { bc.hits = bc.hits || []; if (!bc.hits[j]) { bc.hits[j] = 1; var sv = selAt(meta.cols[j], frAll(F.cols[j]), pl, base, n, sel, m); if (sv) { for (i = 0; i < m; i++) if (sv[0][i] >= 0) out[i][key] = sv[1][i]; continue; } } }   // B19b: the first use decodes only the matching positions
        v = colOf(j); if (!v) continue;
        if (v.length === n) { for (i = 0; i < m; i++) out[i][key] = v[sel[i]]; continue; }""")
open(p, 'w').write(s)
