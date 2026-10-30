#!/usr/bin/env node
// netflow-sankey: this build against an older build (OLD_REF, default origin/main) in one real browser at a time. Same pictures required; timings alternate inside one page. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/netflow-sankey-seen-browser.js <chromium|firefox|webkit> [out.json]    Env: OLD_REF=origin/main, REPS=15, BASELINE=1 to skip the noise guard
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..'), file = 'modules/netflow-sankey/netflow-sankey.js', REPS = +process.env.REPS || 15;
const src = fs.readFileSync(path.join(root, file), 'utf8'), old = cp.execFileSync('git', ['show', (process.env.OLD_REF || 'origin/main') + ':' + file], { cwd: root, maxBuffer: 1 << 26 }).toString();
function pageWork(reps) {
  const NEW = window.NetflowSankey, OLD = window.NSOLD; let seed = 5; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  function make(L, P, K) { const l = []; for (let i = 0; i < K; i++) { const la = Math.floor(r() * (L - 1)), a = la * P + Math.floor(r() * P), b = (la + 1 + Math.floor(r() * Math.min(2, L - la - 1))) * P + Math.floor(r() * P); l.push({ from: 'n' + a, to: 'n' + b, value: 1 + Math.floor(r() * 50) }); } return { links: l }; }
  const cases = [['72 bars', make(6, 12, 200), 8], ['50 bars', make(5, 10, 80), 8], ['200 bars', make(8, 25, 1500), 8], ['50 bars, 40 restarts', make(5, 10, 80), 40], ['72 bars, 40 restarts', make(6, 12, 200), 40]];
  const strip = (x) => { const c = JSON.parse(JSON.stringify(x)); delete c.ms; return JSON.stringify(c); }, out = { bad: [], simd: null, rows: [] }, med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  return Promise.all([NEW.wasmReady(), OLD.wasmReady()]).then(() => {
    for (const [name, g, rs] of cases) {
      const o = { height: 600, restarts: rs };
      if (strip(NEW.layoutFlows(g, o)) !== strip(OLD.layoutFlows(g, o))) out.bad.push(name + ': pictures differ');
      const A = [], B = [], inner = 20; for (let k = 0; k < reps; k++) for (const w of (k % 2 ? ['n', 'o'] : ['o', 'n'])) { const M = w === 'n' ? NEW : OLD, t0 = performance.now(); for (let q = 0; q < inner; q++) M.layoutFlows(g, o); (w === 'n' ? A : B).push((performance.now() - t0) / inner); }
      out.rows.push({ name, newMs: med(A), oldMs: med(B) });
    }
    out.wasm = NEW.wasmAvailable(); return out;
  });
}
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + old + ';window.NSOLD=window.NetflowSankey;</script><script>' + src + '</script>' });
  const run = async () => { const p = await b.newPage(); await p.goto(srv.base + '/page.html'); try { return await p.evaluate('(' + pageWork.toString() + ')(' + REPS + ')'); } finally { await p.close().catch(() => {}); } };
  const g = process.env.BASELINE ? { ok: true, result: await run(), calibrations: [] } : await T.guarded(b, which, run);
  srv.close(); if (!g.ok) { console.log('NOISY: nothing published'); return false; }
  const r = g.result; console.log('wasm ' + r.wasm + '; layout time in ms, median of ' + REPS + ' alternating rounds (lower is better)');
  r.rows.forEach((x) => console.log('  ' + x.name.padEnd(24) + 'new ' + x.newMs.toFixed(2).padStart(7) + '  old ' + x.oldMs.toFixed(2).padStart(7) + '   old/new ' + (x.oldMs / x.newMs).toFixed(2)));
  if (r.bad.length) console.log('DIFFERENT PICTURES: ' + r.bad.join('; ')); if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, r }));
  return !r.bad.length;
});
