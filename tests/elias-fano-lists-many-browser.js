#!/usr/bin/env node
// elias-fano Lists.getMany against a get() loop, in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/elias-fano-lists-many-browser.js <chromium|firefox|webkit> [out.json]    Env: REPS=25, BASELINE=1 to skip the noise guard
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const src = fs.readFileSync(path.resolve(__dirname, '../modules/elias-fano/elias-fano.js'), 'utf8'), REPS = +process.env.REPS || 25;
function pageWork(reps) {
  const S = window.EliasFano; let seed = 3; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const N = 30000, M = 94597, lists = Array.from({ length: N }, () => []); for (let i = 0; i < M; i++) lists[Math.floor(Math.pow(r(), 2) * N)].push(i);
  const typed = lists.map((a) => Uint32Array.from(a)), L = S.openLists(S.buildLists(typed)), ids = new Uint32Array(20000); for (let q = 0; q < ids.length; q++) ids[q] = Math.floor(r() * N);
  const out = { bad: [], accelerated: S.accelerated(), simd: S.simd() }, chk = (n, sum) => ((sum + n) >>> 0);
  const fns = {
    'plain arrays': () => { let s = 0; for (let q = 0; q < ids.length; q++) { const a = typed[ids[q]]; for (let j = 0; j < a.length; j++) s = (s + a[j] * (j % 7 + 1)) >>> 0; } return s; },
    'get() loop': () => { let s = 0; for (let q = 0; q < ids.length; q++) { const a = L.get(ids[q]); for (let j = 0; j < a.length; j++) s = (s + a[j] * (j % 7 + 1)) >>> 0; } return s; },
    'getMany': () => { const g = L.getMany(ids); let s = 0; for (let q = 0; q < ids.length; q++) for (let j = g.offsets[q], k = 0; j < g.offsets[q + 1]; j++, k++) s = (s + g.values[j] * (k % 7 + 1)) >>> 0; return s; }
  };
  const names = Object.keys(fns), got = {}; names.forEach((n) => { got[n] = []; });
  const ref = fns[names[0]](); for (const n of names) if (fns[n]() !== ref) out.bad.push(n + ' differs');
  for (let k = 0; k < reps; k++) for (const n of (k % 2 ? names.slice().reverse() : names)) { const t0 = performance.now(); fns[n](); got[n].push(performance.now() - t0); }
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  out.rows = names.map((n) => ({ n, med: med(got[n]), best: Math.min.apply(null, got[n]) })); return out;
}
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + src + '</script>' });
  const run = async () => { const p = await b.newPage(); await p.goto(srv.base + '/page.html'); try { return await p.evaluate('(' + pageWork.toString() + ')(' + REPS + ')'); } finally { await p.close().catch(() => {}); } };
  const g = process.env.BASELINE ? { ok: true, result: await run(), calibrations: [] } : await T.guarded(b, which, run);
  srv.close(); if (!g.ok) { console.log('NOISY: nothing published'); return false; }
  const r = g.result; console.log('wasm ' + r.accelerated + ', simd ' + r.simd + '\nread 20,000 random lists of 30,000 (ms, median / best; lower is better)');
  r.rows.forEach((x) => console.log('  ' + x.n.padEnd(14) + x.med.toFixed(2).padStart(8) + ' /' + x.best.toFixed(2).padStart(8) + '   x' + (r.rows[1].med / x.med).toFixed(2) + ' vs get() loop'));
  if (r.bad.length) console.log('DIFFERENT ANSWERS: ' + r.bad.join('; ')); if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, r }));
  return !r.bad.length;
});
