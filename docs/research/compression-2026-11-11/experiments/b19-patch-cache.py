# Copyright (c) 2026 LFC Foundry. MIT License.
# research prototype B19 part 2 (on top of b19-patch-equality-reads.py): mode 'cache' = 'codes' plus a cache kept per file between equality reads (the Codex variant).
# Per block it keeps the parsed block (meta, presence bits, frames copied out of the read arena) and, once used, each decoded column and, for the key asked, one value code per row.
# A repeated query then only scans codes and builds its rows. Memory: up to the decoded size of every column the queries touched. usage: python3 b19-patch-cache.py <module dir>
import sys, os
d = sys.argv[1]
p = os.path.join(d, 'src/flat.js'); s = open(p).read()
# frames copied out of the arena when the block is cached
a = "c.one[k] = f[2] ? c.zs.decompress(sb, f[0]) : sb.slice(); }"
assert s.count(a) == 1; s = s.replace(a, "c.one[k] = f[2] ? (c.keep ? c.zs.decompress(sb, f[0]).slice() : c.zs.decompress(sb, f[0])) : sb.slice(); }")
a = "    function readEq(bytes, want, verify, rk, val, mode) {\n      if (gen || lazyOn) return null;\n      var codes = mode === 'codes', F = flatFrames(zs, bytes, want, false, verify, codes),"
assert s.count(a) == 1
s = s.replace(a, """    function readEq(bytes, want, verify, rk, val, mode, bc) {
      if (gen || lazyOn) return null;
      if (bc) return readEqCached(bytes, want, verify, rk, val, bc);
      var codes = mode === 'codes', F = flatFrames(zs, bytes, want, false, verify, codes),""")
a = "    function eqKeep(F, want, rk, val) {"
assert s.count(a) == 1
s = s.replace(a, """    // B19 cache: bc is this block's cache object ({} the first time). Same rows as readEq
    function readEqCached(bytes, want, verify, rk, val, bc) {
      var F = bc.F, j, i, c, m = 0, q, x;
      if (!F) { F = bc.F = flatFrames(zs, bytes, want, false, verify, true); F.pl = F.pl.slice(); bc.vals = []; for (j = 0; j < F.cols.length; j++) if (F.cols[j]) F.cols[j].keep = 1; }
      var meta = F.meta, n = F.n, K = meta.keys.length, pl = F.pl, keys = meta.keys, jr = keys.indexOf(rk), pb = (n + 7) >> 3;
      if (F.ordList || keys.indexOf('__proto__') >= 0) { frBlock(F); return eqKeep(F, want, rk, val); }
      if (jr < 0 || F.cols[jr] === null) return [];
      var rc = bc['k' + jr], sel = new Int32Array(n), colOf = function (j) { var v = bc.vals[j]; if (v === undefined) v = bc.vals[j] = F.cols[j] === null ? null : F.cols[j].pre ? F.cols[j].pre : decodeColumn(meta.cols[j], zs, frAll(F.cols[j])); return v; };
      if (!rc) {   // per row: the label index (D) or the value itself; -1 / undefined for rows without the key, -2 for null
        var cm = meta.cols[jr], col = F.cols[jr], isN = cm.t === 'N', dense = cm.n === n;
        if (cm.t === 'D' || (isN && cm.p.t === 'D')) {
          var dp = isN ? cm.p.p : cm.p, cnt = isN ? cm.p.m : cm.n, o = isN ? 1 : 0, lab = tdr.decode(frOne(col, o)).split('\\0'), cf = frOne(col, o + 1), cd = dp.w ? bitunpack(cf, cnt, dp.w) : dp.wide ? new Uint16Array(cf.buffer.slice(cf.byteOffset, cf.byteOffset + cnt * 2)) : cf, np = isN ? frOne(col, 0) : null, k = 0, at = 0, codeRow = new Int32Array(n).fill(-1);
          for (i = 0; i < n; i++) { if (!dense && !((pl[jr * pb + (i >> 3)] >> (i & 7)) & 1)) continue; if (np && (np[at >> 3] >> (at & 7)) & 1) { at++; codeRow[i] = -2; continue; } at++; codeRow[i] = cd[k++]; }
          var lm = new Map(); for (i = 0; i < lab.length; i++) lm.set(lab[i], i);
          rc = bc['k' + jr] = { d: true, row: codeRow, lm: lm };
        } else {
          var rv = colOf(jr), byRow = new Array(n);
          if (rv.length === n) for (i = 0; i < n; i++) byRow[i] = rv[i]; else for (i = 0, c = 0; i < n; i++) if ((pl[jr * pb + (i >> 3)] >> (i & 7)) & 1) byRow[i] = rv[c++];
          rc = bc['k' + jr] = { d: false, row: byRow };
        }
      }
      if (rc.d) { var c0 = val === null ? -2 : typeof val === 'string' && rc.lm.has(val) ? rc.lm.get(val) : -3; if (c0 === -3) return []; var R = rc.row; for (i = 0; i < n; i++) if (R[i] === c0) sel[m++] = i; }
      else { var R2 = rc.row; for (i = 0; i < n; i++) if (R2[i] === val && (val !== undefined)) sel[m++] = i; }
      var out = new Array(m), v; if (!m) return out;
      if (m * 2 > n) { frBlock(F); var all = assemble(F, want), oo = []; for (i = 0; i < m; i++) oo.push(all[sel[i]]); return oo; }
      for (i = 0; i < m; i++) out[i] = {};
      for (j = 0; j < K; j++) {
        v = colOf(j); if (!v) continue;
        var key = keys[j], base = j * pb;
        if (v.length === n) { for (i = 0; i < m; i++) out[i][key] = v[sel[i]]; continue; }
        for (i = 0, c = 0, q = 0; q < m; i++) { if ((pl[base + (i >> 3)] >> (i & 7)) & 1) { if (i === sel[q]) out[q][key] = v[c]; c++; } if (i === sel[q]) q++; }
      }
      return out;
    }
""" + a)
open(p, 'w').write(s)
p = os.path.join(d, 'src/api.js'); s = open(p).read()
a = "if (rd.readEq) r.readEq = function (a, b, c, d, e, f) { arenaReset(); return rd.readEq(a, b, c, d, e, f); };"
assert s.count(a) == 1; s = s.replace(a, "if (rd.readEq) r.readEq = function (a, b, c, d, e, f, g) { arenaReset(); return rd.readEq(a, b, c, d, e, f, g); };")
a = "var pbk = want ? partialBytes(file, i) : null; r = rf.readEq(pbk || blockBytes(file, i), want, !!pbk, eq.key, eq.value, mode); }"
assert s.count(a) == 1
s = s.replace(a, "var pbk = want ? partialBytes(file, i) : null, bc = null; if (mode === 'cache') { var EC = EQ_CACHE.get(bytes); if (!EC) { EC = {}; EQ_CACHE.set(bytes, EC); } var ck = i + (want ? ':' + Object.keys(want).sort().join(',') : ''); bc = EC[ck] || (EC[ck] = {}); } r = rf.readEq(pbk || blockBytes(file, i), want, !!pbk, eq.key, eq.value, mode === 'cache' ? 'codes' : mode, bc); }")
a = "  function unpackEq(bytes, opts) {"
assert s.count(a) == 1; s = s.replace(a, "  var EQ_CACHE = new WeakMap();   // B19 cache mode: file bytes -> per-block caches\n" + a)
open(p, 'w').write(s)
