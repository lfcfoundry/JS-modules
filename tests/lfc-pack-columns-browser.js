#!/usr/bin/env node
// lfc-pack unpackColumns against unpack in one real browser at a time: answers match, timings alternate inside one page. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/lfc-pack-lazy-browser.js <chromium|firefox|webkit> [out.json]    Env: REPS=9, BASELINE=1 to skip the noise guard
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const src = fs.readFileSync(path.resolve(__dirname, '../modules/lfc-pack/lfc-pack.js'), 'utf8'), REPS = +process.env.REPS || 9;
async function pageWork(reps) {
  const J = window.LfcPack; await J.init(); const out = { bad: [] }; let seed = 7; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const N = 300000, L = []; for (let i = 0; i < N; i++) L.push(JSON.stringify({ ts: 1760000000 + i * 3 + Math.floor(r() * 3), level: ['info', 'warn', 'error'][Math.floor(r() * 3)], status: [200, 200, 404, 500][Math.floor(r() * 4)], ms: Math.floor(r() * 900), id: i, ip: '10.0.' + Math.floor(r() * 255) + '.' + Math.floor(r() * 255), msg: 'request ' + Math.floor(r() * 5000) }));
  const bytes = J.pack(new TextEncoder().encode(L.join('\n') + '\n')); L.length = 0;
  const ref = J.unpack(bytes), cb = J.unpackColumns(bytes); let sink = 0, at = 0;
  for (const blk of cb) { for (const k of blk.keys) for (let i = 0; i < blk.n; i += 97) if (blk.cols[k][i] !== ref[at + i][k]) { out.bad.push(k + ' row ' + (at + i) + ' differs'); break; } at += blk.n; }
  if (at !== ref.length) out.bad.push('row count');
  const fns = {
    'unpack (row objects)': () => J.unpack(bytes).length,
    'unpackColumns (typed columns)': () => J.unpackColumns(bytes).length
  };
  const names = Object.keys(fns), got = {}; names.forEach((n) => { got[n] = []; }); for (const n of names) fns[n]();
  for (let k = 0; k < reps; k++) for (const n of (k % 2 ? names.slice().reverse() : names)) { const t0 = performance.now(); sink += fns[n](); got[n].push(performance.now() - t0); }
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  out.rows = names.map((n) => ({ n, med: med(got[n]) })); out.sink = sink; out.N = N; return out;
}
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + src + '</script>' });
  const run = async () => { const p = await b.newPage(); await p.goto(srv.base + '/page.html'); try { return await p.evaluate('(' + pageWork.toString() + ')(' + REPS + ')'); } finally { await p.close().catch(() => {}); } };
  const g = process.env.BASELINE ? { ok: true, result: await run(), calibrations: [] } : await T.guarded(b, which, run);
  srv.close(); if (!g.ok) { console.log('NOISY: nothing published'); return false; }
  const r = g.result, m = {}; r.rows.forEach((x) => { m[x.n] = x.med; });
  console.log(r.N + ' rows of 7 fields; ms, median of ' + REPS + ' alternating rounds (lower is better)');
  r.rows.forEach((x) => console.log('  ' + x.n.padEnd(32) + x.med.toFixed(1).padStart(8)));
  console.log('  unpack / unpackColumns ' + (m['unpack (row objects)'] / m['unpackColumns (typed columns)']).toFixed(2));
  if (r.bad.length) console.log('DIFFERENT ANSWERS: ' + r.bad.slice(0, 5).join('; ')); if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, r }));
  return !r.bad.length;
});
