#!/usr/bin/env node
// elias-fano in one real browser at a time: answers match and timings against plain arrays, behind the noise guard. Copyright (c) 2026 LFC Foundry. MIT License.
// Cases: read every link of 30,000 lists (94,597 links, the Netflow Map shape); nextGEQ in one list of 1,000,000 values; random get(i). Contenders take turns inside one page, in an order that turns around each round; every sample repeats the job (10, 5 or 40 times) because Firefox's clock is coarse, and the table shows time per single job.
// Run: node tests/elias-fano-speed-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS=25 (rounds), BASELINE=1 to skip the noise guard (no baseline saved yet)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const src = fs.readFileSync(path.resolve(__dirname, '../modules/elias-fano/elias-fano.js'), 'utf8'), REPS = +process.env.REPS || 25;
function pageWork(reps) {
  const S = window.EliasFano; let seed = 3; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const N = 30000, M = 94597, lists = Array.from({ length: N }, () => []); for (let i = 0; i < M; i++) lists[Math.floor(Math.pow(r(), 2) * N)].push(i);
  const typed = lists.map((a) => Uint32Array.from(a)), maps = new Map(); typed.forEach((a, i) => maps.set(i, Array.from(a)));
  const offsets = new Uint32Array(N + 1), values = new Uint32Array(M); { let p = 0; for (let i = 0; i < N; i++) { offsets[i] = p; values.set(typed[i], p); p += typed[i].length; } offsets[N] = p; }
  S.setBackend('auto'); const blob = S.buildLists(typed), L = S.openLists(blob);
  let want = 0; for (let i = 0; i < M; i++) want = (want + values[i] * (i % 7 + 1)) >>> 0;
  const out = { sizes: { efLists: blob.length, plainOffsetsValues: (N + 1 + M) * 4 }, accelerated: S.accelerated(), simd: S.simd(), bad: [] };
  const sumOf = (it) => { let s = 0, k = 0; it((v) => { s = (s + v * (k++ % 7 + 1)) >>> 0; }); return s; };
  const withBackend = (be, f) => () => { S.setBackend(be); try { return f(); } finally { S.setBackend('auto'); } };
  const readAll = {
    maps: () => sumOf((f) => { for (let i = 0; i < N; i++) { const a = maps.get(i); for (let j = 0; j < a.length; j++) f(a[j]); } }),
    csr: () => sumOf((f) => { for (let i = 0; i < N; i++) for (let j = offsets[i]; j < offsets[i + 1]; j++) f(values[j]); }),
    'ef get(i), js': withBackend('js', () => sumOf((f) => { for (let i = 0; i < N; i++) { const a = L.get(i); for (let j = 0; j < a.length; j++) f(a[j]); } })),
    'ef decodeAll, js': withBackend('js', () => { const d = L.decodeAll(); return sumOf((f) => { for (let j = 0; j < d.values.length; j++) f(d.values[j]); }); }),
    'ef decodeAll, wasm': withBackend('wasm', () => { const d = L.decodeAll(); return sumOf((f) => { for (let j = 0; j < d.values.length; j++) f(d.values[j]); }); })
  };
  // one sorted list of 1,000,000 values, 20,000 lookups
  const BIG = 1000000, big = new Uint32Array(BIG); { let v = 0; for (let i = 0; i < BIG; i++) { v += Math.floor(r() * 500); big[i] = v; } }
  const bigEF = S.open(S.build(big)), qs = new Uint32Array(20000), ix = new Uint32Array(20000); for (let i = 0; i < qs.length; i++) { qs[i] = Math.floor(r() * big[BIG - 1]); ix[i] = Math.floor(r() * BIG); }
  const bs = (x) => { let lo = 0, hi = BIG; while (lo < hi) { const m = (lo + hi) >>> 1; if (big[m] < x) lo = m + 1; else hi = m; } return lo; };
  out.sizes.bigEF = bigEF.bytes.length; out.sizes.bigPlain = BIG * 4;
  const chk = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s = (s + a[i] * (i % 5 + 1)) >>> 0; return s; };
  const next = {
    'binary search': () => { let s = 0; for (let i = 0; i < qs.length; i++) s = (s + bs(qs[i]) * (i % 5 + 1)) >>> 0; return s; },
    'ef nextGEQ, js': withBackend('js', () => { let s = 0; for (let i = 0; i < qs.length; i++) s = (s + bigEF.nextGEQ(qs[i]) * (i % 5 + 1)) >>> 0; return s; }),
    'ef nextGEQ, wasm': withBackend('wasm', () => { let s = 0; for (let i = 0; i < qs.length; i++) s = (s + bigEF.nextGEQ(qs[i]) * (i % 5 + 1)) >>> 0; return s; }),
    'ef nextGEQMany, wasm': withBackend('wasm', () => chk(bigEF.nextGEQMany(qs)))
  };
  const get = {
    'plain array': () => { let s = 0; for (let i = 0; i < ix.length; i++) s = (s + big[ix[i]] * (i % 5 + 1)) >>> 0; return s; },
    'ef get, js': withBackend('js', () => { let s = 0; for (let i = 0; i < ix.length; i++) s = (s + bigEF.get(ix[i]) * (i % 5 + 1)) >>> 0; return s; }),
    'ef get, wasm': withBackend('wasm', () => { let s = 0; for (let i = 0; i < ix.length; i++) s = (s + bigEF.get(ix[i]) * (i % 5 + 1)) >>> 0; return s; }),
    'ef getMany, wasm': withBackend('wasm', () => chk(bigEF.getMany(ix)))
  };
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  const race = (name, fns, inner) => {
    const names = Object.keys(fns), got = {}; names.forEach((n) => { got[n] = []; });
    const ref = fns[names[0]]();   // answers must agree with the first contender (the plain one)
    for (const n of names) if (fns[n]() !== ref) out.bad.push(name + ': ' + n + ' differs');
    for (let k = 0; k < reps; k++) for (const n of (k % 2 ? names.slice().reverse() : names)) { const t0 = performance.now(); for (let q = 0; q < inner; q++) fns[n](); got[n].push((performance.now() - t0) / inner); }
    const o = {}; names.forEach((n) => { o[n] = { median: med(got[n]), best: Math.min.apply(null, got[n]) }; }); out[name] = o;
  };
  if (readAll.maps() !== want || readAll.csr() !== want) out.bad.push('read-all reference'); race('readAll', readAll, 10); race('nextGEQ', next, 5); race('get', get, 40);
  return out;
}
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + src + '</script>' });
  const run = async () => { const p = await b.newPage(); await p.goto(srv.base + '/page.html'); try { return await p.evaluate('(' + pageWork.toString() + ')(' + REPS + ')'); } finally { await p.close().catch(() => {}); } };   // the page is opened after the calibration: one view can serve only one page at a time
  const g = process.env.BASELINE ? { ok: true, result: await run(), calibrations: [] } : await T.guarded(b, which, run);
  srv.close();
  if (!g.ok) { console.log('NOISY: every try was off the quiet baseline; nothing published'); return false; }
  const r = g.result; console.log('wasm ' + r.accelerated + ', simd ' + r.simd + '; sizes ' + JSON.stringify(r.sizes) + '; noise guard tries ' + (g.tries || 0));
  for (const c of ['readAll', 'nextGEQ', 'get']) { const first = Object.keys(r[c])[0];
    console.log('\n' + c + ' (ms, median / best; vs ' + first + ')\n' + T.table(Object.keys(r[c]).map((n) => ({ n, med: r[c][n].median.toFixed(2), best: r[c][n].best.toFixed(2), x: (r[c][first].median / r[c][n].median).toFixed(2) })), [{ key: 'n', title: 'contender', align: 'left' }, { key: 'med', title: 'median' }, { key: 'best', title: 'best' }, { key: 'x', title: 'times faster' }])); }
  if (r.bad.length) console.log('\nDIFFERENT ANSWERS: ' + r.bad.join('; '));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, r, calibrations: g.calibrations }));
  return !r.bad.length;
});
