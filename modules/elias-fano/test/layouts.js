/* Copyright (c) 2026 LFC Foundry. MIT License. elias-fano 2.5.0 layouts (Node, pass/fail only): long lists get a bitmap (strictly increasing and no bigger) or 2 more low bits;
 * every query equals a plain binary search in JavaScript and WebAssembly, blobs are byte-identical, { classic: true } gives the 2.4 layout, damaged header fields are refused.
 * Run: node modules/elias-fano/test/layouts.js */
'use strict';
const S = require('../elias-fano.js');
const ok = (c, m) => { if (!c) { console.log('FAIL ' + m); process.exit(1); } };
const rng = (seed) => { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const lb = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >>> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; };
function mk(kind, n, seed) {
  const r = rng(seed), a = new Uint32Array(n); let x = kind === 'offset' ? 3000000000 : Math.floor(r() * 1000);
  for (let i = 0; i < n; i++) {
    if (kind === 'bitmap' || kind === 'offset') x += 1 + (r() < 0.5 ? 0 : Math.floor(r() * 4));
    else if (kind === 'edge') x += 1 + (r() < 0.75 ? Math.floor(r() * 3) : 5);   // near the bitmap / Elias-Fano size line
    else if (kind === 'mid') x += 1 + Math.floor(r() * 200);
    else if (kind === 'wide') x += 1 + Math.floor(r() * 100000);
    else if (kind === 'dups') x += r() < 0.3 ? 0 : 1 + Math.floor(r() * 3);
    else if (kind === 'runs') x += r() < 0.97 ? 1 : 2 + Math.floor(r() * 1000);
    else if (kind === 'oneRun') x += 1;
    a[i] = x;
  }
  return a;
}
(async () => {
  await S.ready(); const both = S.accelerated();
  const layouts = {}; let checks = 0;
  for (const kind of ['bitmap', 'offset', 'edge', 'mid', 'wide', 'dups', 'runs', 'oneRun']) for (const n of [1023, 1024, 1025, 4096, 70001]) {
    const a = mk(kind, n, n * 7 + kind.length), r = rng(n + 99);
    S.setBackend('js'); const bj = S.build(a); S.setBackend('auto'); const bw = S.build(a);
    ok(bj.length === bw.length && bj.every((v, i) => v === bw[i]), kind + ' ' + n + ': JavaScript and WebAssembly blobs differ');
    const cl = S.build(a, { classic: true }), hc = new Uint32Array(cl.buffer, cl.byteOffset, 16);
    ok(hc[11] === 0 && hc[12] === 0 && hc[13] === 0, 'classic layout has no 2.5 fields');
    for (const be of ['js', 'auto']) {
      S.setBackend(be); const L = S.open(bw), C = S.open(cl); const st = L.stats(); layouts[st.layout] = (layouts[st.layout] || 0) + 1;
      if (n < 1024) ok(st.layout === 'classic', 'short lists keep the classic layout');
      ok(L.toArray().every((v, i) => v === a[i]), kind + ' ' + n + ' ' + be + ': toArray');
      ok(L.view().every((v, i) => v === a[i]), kind + ' ' + n + ' ' + be + ': view');
      const s0 = Math.floor(r() * n), s1 = Math.min(n, s0 + Math.floor(r() * 3000)); const sl = L.slice(s0, s1);
      ok(sl.length === s1 - s0 && sl.every((v, i) => v === a[s0 + i]), 'slice');
      const xs = new Uint32Array(300), idx = new Uint32Array(300);
      for (let q = 0; q < 300; q++) { const t = r(); xs[q] = t < 0.1 ? 0 : t < 0.2 ? a[n - 1] + Math.floor(r() * 3) : t < 0.5 ? a[Math.floor(r() * n)] : Math.floor(a[0] + r() * (a[n - 1] - a[0] + 2)); idx[q] = Math.floor(r() * n); }
      const ng = L.nextGEQMany(xs), gm = L.getMany(idx);
      for (let q = 0; q < 300; q++) {
        const e = lb(a, xs[q]); ok(L.nextGEQ(xs[q]) === e && ng[q] === e && C.nextGEQ(xs[q]) === e, kind + ' ' + n + ' ' + be + ': nextGEQ(' + xs[q] + ')');
        ok(L.get(idx[q]) === a[idx[q]] && gm[q] === a[idx[q]], 'get'); ok(L.contains(xs[q]) === (e < n && a[e] === xs[q]), 'contains'); checks += 4;
      }
      const other = S.open(S.build(mk('mid', 3000, n)), {}), want = []; const set = new Set(other.toArray()); for (const v of a) if (set.has(v) && want[want.length - 1] !== v) want.push(v);
      const got = S.intersect([L, other]); ok(got.length === want.length && got.every((v, i) => v === want[i]), kind + ' ' + n + ' ' + be + ': intersect');
      for (const dk of ['bitmap', 'offset', 'runs']) { const da = mk(dk, 1500 + (n % 7) * 300, n + dk.length * 13), D = S.open(S.build(da)); ok(D.stats().layout === (dk === 'runs' ? 'runs' : 'bitmap'), 'second list layout ' + dk + ' ' + D.stats().layout);
        const ds = new Set(da), w2 = []; for (const v of a) if (ds.has(v) && w2[w2.length - 1] !== v) w2.push(v);
        const g3 = S.intersect([L, D]); ok(g3.length === w2.length && g3.every((v, i) => v === w2[i]), kind + ' ' + n + ' ' + be + ': intersect with a bitmap'); checks++; }
      const got2 = S.intersect([L, C]); ok(got2.length === new Set(a).size, 'intersect with itself'); checks += 2;
    }
    S.setBackend('auto');
    { const L2 = S.open(bw.slice()); L2.toArray(); if (L2.compact()) { S.setBackend('js'); ok(L2.toArray().every((v, i) => v === a[i]) && L2.bytes.every((v, i) => v === bw[i]), kind + ' ' + n + ': compact, then back to JavaScript'); S.setBackend('auto');
      L2.compact(); S.trim(); ok(L2.toArray().every((v, i) => v === a[i]) && L2.nextGEQ(a[n >> 1]) === lb(a, a[n >> 1]), kind + ' ' + n + ': after trim'); checks += 2; } }
    // damaged 2.5 fields are refused
    for (const [w, v] of [[11, 3], [12, 2], [13, 1], [14, 1]]) { const d = bw.slice(); if (new DataView(d.buffer).getUint32(w * 4, true) === v) continue; new DataView(d.buffer).setUint32(w * 4, v, true); let bad = false; try { S.open(d); } catch (e) { bad = e instanceof RangeError || e instanceof Error; } ok(bad, kind + ' ' + n + ': header word ' + w + ' = ' + v + ' refused'); }
  }
  ok(layouts.bitmap > 0 && layouts.fast > 0 && layouts.classic > 0 && layouts.runs > 0, 'all three layouts were tested ' + JSON.stringify(layouts));
  console.log('ok   elias-fano layouts: ' + checks + ' checks, layouts ' + JSON.stringify(layouts) + (both ? ' (JavaScript and WebAssembly)' : ' (JavaScript only)'));
})();
