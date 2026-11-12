# Copyright (c) 2026 LFC Foundry. MIT License.
# research prototype B19: equality reads, unpack(file, { equals: { key, value } }) -> the rows whose value under key === value (strict, so a missing key never matches null).
# Three ways, picked by globalThis.__B19 for A/B timing: 'off' reads whole blocks and filters (what an app does today), 'plain' tests the decoded column and builds only the matching rows (as B14 does for ranges),
# 'codes' (default) also reads a dictionary (D) column through its codes: the label frame is decompressed first, a block without the value stops there, and the other columns are decompressed only when a row matches.
# More than half the rows of a block matching -> the whole-block path, as in B14. usage: python3 b19-patch-equality-reads.py <module dir built with B14>
import sys, os
d = sys.argv[1]
p = os.path.join(d, 'src/flat.js'); s = open(p).read()
a = "  function flatFrames(zs, bytes, want, predecode, verify) {"
assert s.count(a) == 1; s = s.replace(a, "  function flatFrames(zs, bytes, want, predecode, verify, lazy) {")
a = "      for (i = 0; i < c.f.length; i++) { var f = c.f[i], sb = take(f[1]); if (wanted) fr.push(f[2] ? zs.decompress(sb, f[0]) : sb.slice()); }"
assert s.count(a) == 1
s = s.replace(a, "      if (lazy && wanted) { var zf = []; for (i = 0; i < c.f.length; i++) zf.push([c.f[i], take(c.f[i][1])]); cols[j] = { fr: null, zf: zf, zs: zs }; continue; }   // B19: compressed frames kept, decompressed on first use\n" + a)
a = "  flatFrames = guard(flatFrames);"
assert s.count(a) == 1
s = s.replace(a, a + """
  // B19 helpers: frame k of a lazily read column, all its frames, every column of a lazily read block
  function frOne(c, k) { if (c.fr) return c.fr[k]; if (!c.one) c.one = []; if (!c.one[k]) { var f = c.zf[k][0], sb = c.zf[k][1]; c.one[k] = f[2] ? c.zs.decompress(sb, f[0]) : sb.slice(); } return c.one[k]; }
  function frAll(c) { if (!c.fr) { var o = [], k; for (k = 0; k < c.zf.length; k++) o.push(frOne(c, k)); c.fr = o; } return c.fr; }
  function frBlock(F) { for (var j = 0; j < F.cols.length; j++) if (F.cols[j] && !F.cols[j].pre) frAll(F.cols[j]); }""")
a = "    readSel = guard(readSel);"
assert s.count(a) == 1
s = s.replace(a, a + """
    // B19: rows of a block whose value under key rk === val. mode 'plain' or 'codes' (see the patch notes). Same objects and key order as filtering readBlock(...)
    function readEq(bytes, want, verify, rk, val, mode) {
      if (gen || lazyOn) return null;
      var codes = mode === 'codes', F = flatFrames(zs, bytes, want, false, verify, codes), meta = F.meta, n = F.n, K = meta.keys.length, pl = F.pl, keys = meta.keys, i, j, c, s, m = 0, jr = keys.indexOf(rk), q, x;
      if (F.ordList || keys.indexOf('__proto__') >= 0) { if (codes) frBlock(F); return eqKeep(F, want, rk, val); }
      if (jr < 0 || F.cols[jr] === null) return [];
      var cm = meta.cols[jr], col = F.cols[jr], pb = (n + 7) >> 3, sel = new Int32Array(n), dense = cm.n === n, rv = null, isN = cm.t === 'N';
      if (codes && (cm.t === 'D' || (isN && cm.p.t === 'D'))) {
        var dp = isN ? cm.p.p : cm.p, cnt = isN ? cm.p.m : cm.n, o = isN ? 1 : 0, c0 = -1;
        if (typeof val === 'string') c0 = tdr.decode(frOne(col, o)).split('\\0').indexOf(val);
        if (c0 < 0 && !(isN && val === null)) return [];   // the value is not in this block's labels: no other frame is decompressed
        var cf = frOne(col, o + 1), cd = dp.w ? bitunpack(cf, cnt, dp.w) : dp.wide ? new Uint16Array(cf.buffer.slice(cf.byteOffset, cf.byteOffset + cnt * 2)) : cf, np = isN ? frOne(col, 0) : null, k = 0, at = 0;
        for (i = 0, s = jr * pb; i < n; i++) { if (!dense && !((pl[s + (i >> 3)] >> (i & 7)) & 1)) continue;
          if (np && (np[at >> 3] >> (at & 7)) & 1) { at++; if (val === null) sel[m++] = i; continue; } at++;
          if (cd[k++] === c0 && c0 >= 0) sel[m++] = i; }
      } else {
        rv = decodeColumn(cm, zs, codes ? frAll(col) : col.fr);
        if (rv.length === n) { for (i = 0; i < n; i++) if (rv[i] === val) sel[m++] = i; }
        else { for (i = 0, c = 0, s = jr * pb; i < n; i++) if ((pl[s + (i >> 3)] >> (i & 7)) & 1) { if (rv[c++] === val) sel[m++] = i; } }
      }
      if (m * 2 > n) { if (codes) frBlock(F); if (rv) col.pre = rv; return eqKeep(F, want, rk, val); }
      var out = new Array(m), vals = new Array(K), v; if (!m) return out;
      for (j = 0; j < K; j++) vals[j] = F.cols[j] === null ? null : F.cols[j].pre ? F.cols[j].pre : (j === jr && rv) ? rv : decodeColumn(meta.cols[j], zs, codes ? frAll(F.cols[j]) : F.cols[j].fr);
      for (i = 0; i < m; i++) out[i] = {};
      for (j = 0; j < K; j++) {
        v = vals[j]; if (!v) continue;
        var key = keys[j], base = j * pb;
        if (v.length === n) { for (i = 0; i < m; i++) out[i][key] = v[sel[i]]; continue; }
        for (i = 0, c = 0, q = 0; q < m; i++) { if ((pl[base + (i >> 3)] >> (i & 7)) & 1) { if (i === sel[q]) out[q][key] = v[c]; c++; } if (i === sel[q]) q++; }
      }
      return out;
    }
    function eqKeep(F, want, rk, val) { var r = assemble(F, want), out = [], i; for (i = 0; i < r.length; i++) if (r[i][rk] === val) out.push(r[i]); return out; }
    readEq = guard(readEq);""")
a = "readSel: readSel, "
assert s.count(a) == 1; s = s.replace(a, "readSel: readSel, readEq: readEq, ")
open(p, 'w').write(s)
p = os.path.join(d, 'src/api.js'); s = open(p).read()
a = "    if (rd.readSel) r.readSel = function (a, b, c, d, e, f) { arenaReset(); return rd.readSel(a, b, c, d, e, f); };"
assert s.count(a) == 1; s = s.replace(a, a + "\n    if (rd.readEq) r.readEq = function (a, b, c, d, e, f) { arenaReset(); return rd.readEq(a, b, c, d, e, f); };")
a = "  function unpackSome(bytes, opts) {"
assert s.count(a) == 1
s = s.replace(a, """  function unpackEq(bytes, opts) {   // B19 research: unpack(bytes, { equals: { key, value }, keys? })
    var file = openFile(bytes), rn = arenaReader(makeNestedReader(arenaZs(S.zdec), sharedOf(file))), rf = arenaReader(makeFlatReader(arenaZs(S.zdec))), out = [], i, j, r, kd, want = null, eq = opts.equals, mode = (typeof globalThis !== 'undefined' && globalThis.__B19) || 'codes';
    if (opts.keys) { want = {}; for (i = 0; i < opts.keys.length; i++) want[opts.keys[i]] = 1; want[eq.key] = 1; }
    for (i = 0; i < file.blocks.length; i++) {
      if (opts.table != null && (file.blocks[i][5] || 0) !== opts.table) continue;
      kd = file.blocks[i][4]; r = null;
      if (kd === 'f' && mode !== 'off') { var pbk = want ? partialBytes(file, i) : null; r = rf.readEq(pbk || blockBytes(file, i), want, !!pbk, eq.key, eq.value, mode); }
      if (!r) { r = kd === 'r' ? rawRows(readRawBlock(S.zdec, blockBytes(file, i))) : (kd === 'f' ? rf.readBlock(blockBytes(file, i), want) : rn.readBlock(blockBytes(file, i), want)); if (want && kd === 'r') r = projectRows(r, want); var kp = []; for (j = 0; j < r.length; j++) if (r[j][eq.key] === eq.value) kp.push(r[j]); r = kp; }
      if (opts.keys && opts.keys.indexOf(eq.key) < 0) r = projectRows(r, (function () { var w = {}; opts.keys.forEach(function (k) { w[k] = 1; }); return w; })());
      for (j = 0; j < r.length; j++) out.push(r[j]);
    }
    return out;
  }
  function unpackSome(bytes, opts) {
    if (opts.equals) return unpackEq(bytes, opts);""")
open(p, 'w').write(s)
