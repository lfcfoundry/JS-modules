#!/usr/bin/env node
// elias-fano intersect in one real browser at a time: answers and timings against plain sorted Uint32Arrays (linear merge, and binary search driven by the shortest list), behind the noise guard. Copyright (c) 2026 LFC Foundry. MIT License.
// Cases (ids drawn from 1,000,000 distinct values, half of the small list's ids are also in the big one): 1,000,000 with 1,000; with 10,000; with 200,000; with 1,000,000; three lists of 1,000,000 / 200,000 / 50,000.
// Run: node tests/elias-fano-intersect-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS=15 (rounds), BASELINE=1 to skip the noise guard
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const src = fs.readFileSync(path.resolve(__dirname, '../modules/elias-fano/elias-fano.js'), 'utf8'), REPS = +process.env.REPS || 15;
async function pageWork(reps) {
  const S = window.EliasFano; await S.ready(); S.setBackend('wasm');
  let seed = 21; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const N = 1000000, big = new Uint32Array(N); let x = 0; for (let i = 0; i < N; i++) { x += 1 + Math.floor(r() * 9); big[i] = x; }
  const sample = (n) => { const set = new Set(); while (set.size < n) { set.add(r() < 0.5 ? big[Math.floor(r() * N)] : 1 + Math.floor(r() * x)); } return Uint32Array.from(set).sort(); };
  const lb = (a, v, from) => { let lo = from, hi = a.length; while (lo < hi) { const m = (lo + hi) >>> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo; };
  const merge = (ls) => { const k = ls.length, pos = new Array(k).fill(0), out = []; let cand = ls[0].length ? ls[0][0] : -1; if (cand < 0) return out;
    for (;;) { let agree = true; for (let i = 0; i < k; i++) { const a = ls[i]; while (pos[i] < a.length && a[pos[i]] < cand) pos[i]++; if (pos[i] >= a.length) return out; if (a[pos[i]] !== cand) { cand = a[pos[i]]; agree = false; } } if (agree) { out.push(cand); cand++; } } };
  const bsearch = (ls) => { const k = ls.length, out = []; const s = ls.slice().sort((p, q) => p.length - q.length); const from = new Array(k).fill(0); let cand = s[0][0];
    for (;;) { let agree = true; for (let i = 0; i < k; i++) { const a = s[i], j = lb(a, cand, from[i]); from[i] = j; if (j >= a.length) return out; if (a[j] !== cand) { cand = a[j]; agree = false; } } if (agree) { out.push(cand); cand++; } } };
  const cases = { '1M with 1k': [big, sample(1000)], '1M with 10k': [big, sample(10000)], '1M with 200k': [big, sample(200000)], '1M with 1M': [big, sample(1000000)], 'three lists 1M/200k/50k': [big, sample(200000), sample(50000)] };
  const out = { cases: {}, bad: [], accelerated: S.accelerated(), simd: S.simd() };
  const med = (a) => { a = a.slice().sort((p, q) => p - q); return a[a.length >> 1]; };
  for (const name of Object.keys(cases)) {
    const ls = cases[name], flat = ls.map((a) => S.open(S.build(a))), pef = ls.map((a) => S.openPartitioned(S.buildPartitioned(a, { chunk: 128 })));
    const fns = { 'plain merge': () => merge(ls).length, 'plain binary search': () => bsearch(ls).length, 'flat EF, wasm': () => S.intersect(flat).length, 'partitioned 128, wasm': () => S.intersect(pef).length };
    const want = merge(ls); const wantStr = want.join(',');
    if (S.intersect(flat).join(',') !== wantStr || S.intersect(pef).join(',') !== wantStr) out.bad.push(name + ': answers differ');
    S.setBackend('js'); if (S.intersect(flat).join(',') !== wantStr) out.bad.push(name + ': js answers differ'); S.setBackend('wasm');
    const names = Object.keys(fns), got = {}; names.forEach((n) => { got[n] = []; });
    const inner = (n) => (ls[1].length <= 10000 ? (n.startsWith('plain merge') ? 1 : 10) : 1);
    for (let k = 0; k < reps; k++) for (const n of (k % 2 ? names.slice().reverse() : names)) { const q = inner(n), t0 = performance.now(); for (let i = 0; i < q; i++) fns[n](); got[n].push((performance.now() - t0) / q); }
    out.cases[name] = { found: want.length, sizes: { plain: ls.reduce((s, a) => s + a.length * 4, 0), flat: flat.reduce((s, l) => s + l.bytes.length, 0), pef: pef.reduce((s, l) => s + l.bytes.length, 0) }, times: {} };
    names.forEach((n) => { out.cases[name].times[n] = { median: med(got[n]), best: Math.min.apply(null, got[n]) }; });
  }
  return out;
}
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + src + '</script>' });
  const run = async () => { const p = await b.newPage(); await p.goto(srv.base + '/page.html'); try { return await p.evaluate('(' + pageWork.toString() + ')(' + REPS + ')'); } finally { await p.close().catch(() => {}); } };
  const g = process.env.BASELINE ? { ok: true, result: await run(), calibrations: [] } : await T.guarded(b, which, run);
  srv.close();
  if (!g.ok) { console.log('NOISY: every try was off the quiet baseline; nothing published'); return false; }
  const r = g.result; console.log('wasm ' + r.accelerated + ', simd ' + r.simd + '; noise guard tries ' + (g.tries || 0));
  for (const c of Object.keys(r.cases)) { const x = r.cases[c], first = 'plain binary search'; console.log('\n== ' + c + ': ' + x.found + ' common; bytes plain ' + x.sizes.plain + ', flat EF ' + x.sizes.flat + ', partitioned ' + x.sizes.pef);
    console.log(T.table(Object.keys(x.times).map((n) => ({ n, m: x.times[n].median.toFixed(3), b: x.times[n].best.toFixed(3), x: (x.times[first].median / x.times[n].median).toFixed(2) + 'x' })), [{ key: 'n', title: 'contender', align: 'left' }, { key: 'm', title: 'median ms' }, { key: 'b', title: 'best ms' }, { key: 'x', title: 'vs binary search' }])); }
  if (r.bad.length) console.log('\nDIFFERENT ANSWERS: ' + r.bad.join('; '));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, r, calibrations: g.calibrations }));
  return !r.bad.length;
});
