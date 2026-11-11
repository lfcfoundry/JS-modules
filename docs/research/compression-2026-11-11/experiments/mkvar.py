# Copyright (c) 2026 LFC Foundry. MIT License.
import sys
src, dst, kind = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(src, encoding='latin-1').read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)
if 'uuid' in kind:
    rep("raw = new Uint8Array(n * 16); for (i = 0; i < n; i++) { var hx = v[i].replace(/-/g, ''); for (j = 0; j < 32; j += 2) raw[p++] = parseInt(hx.substr(j, 2), 16); }",
        "raw = new Uint8Array(n * 16); for (i = 0; i < n; i++) { x = v[i]; for (j = 0; j < 36; j += 2) { if (j === 8 || j === 13 || j === 18 || j === 23) j++; raw[p++] = (hexv(x.charCodeAt(j)) << 4) | hexv(x.charCodeAt(j + 1)); } }")
if 'sample' in kind:
    est = ("function __est(zs, level, frames) { var t = 0, q, f, L, c, k, o, s, K = 4, sl = 16384; for (q = 0; q < frames.length; q++) { f = frames[q]; L = f.length; "
           "if (L <= 65536) { c = zs.compress(f, level); t += Math.min(c.length, L); } else { s = new Uint8Array(K * sl); for (k = 0; k < K; k++) { o = Math.floor((L - sl) * k / (K - 1)) & ~7; s.set(f.subarray(o, o + sl), k * sl); } c = zs.compress(s, level); t += Math.min(L, Math.ceil(c.length * L / s.length)); } } return t; }\n"
           "function __fin(zs, level, b) { if (!b || !b.est) return b; var t = 0, z = [], q, f, c; for (q = 0; q < b.fr.length; q++) { f = b.fr[q]; c = zs.compress(f, level); if (c.length < f.length) z.push([f.length, c, 1]); else z.push([f.length, f, 0]); t += z[q][1].length; } b.z = z; b.size = t; b.est = false; b.fr = null; return b; }\n")
    rep("  function encodeColumn(v, zs, level, tmode, sj, key) {", est + "  function encodeColumn(v, zs, level, tmode, sj, key) { return __fin(zs, level, encodeColumn0(v, zs, level, tmode, sj, key)); }\n  function encodeColumn0(v, zs, level, tmode, sj, key) {")
    rep("function cand(t, p, frames, st) { var s = stored(frames); if (!best || s.size < best.size) best = { t: t, p: p, z: s.z, size: s.size, n: n, st: st }; }",
        "function cand(t, p, frames, st) { var e = __est(zs, level, frames); if (!best || e < best.size) best = { t: t, p: p, fr: frames, est: true, size: e, n: n, st: st }; }")
    rep("function cand(tn, p, fr, n) { var sv = stored(fr, best ? best.size : Infinity); if (sv) best = { t: tn, p: p, z: sv.z, size: sv.size, n: n }; }",
        "function cand(tn, p, fr, n) { var e = __est(zs, level, fr); if (!best || e < best.size) best = { t: tn, p: p, fr: fr, est: true, size: e, n: n }; }")
    rep("      meta.cols.push({ t: best.t, p: best.p, n: best.n, f: best.z.map(", "      __fin(zs, level, best); meta.cols.push({ t: best.t, p: best.p, n: best.n, f: best.z.map(")
open(dst, 'w', encoding='latin-1').write(s)
