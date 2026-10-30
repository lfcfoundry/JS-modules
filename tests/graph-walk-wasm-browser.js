#!/usr/bin/env node
// graph-walk WebAssembly kernels against the plain JavaScript ones, in one real browser at a time: identical answers (byte for byte), then the time of each, taking turns. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/graph-walk-wasm-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (rounds, default 9)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', REPS = +(process.env.REPS || 9);
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gw.js': fs.readFileSync(root + 'graph-walk/graph-walk.js', 'utf8'), '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/gw.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  const ready = await p.evaluate(() => GraphWalk.ready()); if (!ready) { console.log('FAIL WebAssembly did not start in this browser'); return false; }
  await p.evaluate(() => {
    let seed = 11; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    window.sample = (key) => {
      const [be, job] = key.split(' '), f = window.jobs[job]; GraphWalk.setBackend(be); let r = window.reps[key];
      if (!r) { r = 1; for (;;) { const t0 = performance.now(); for (let i = 0; i < r; i++) f(); const dt = performance.now() - t0; if (dt >= 25 || r >= 4096) break; r = Math.min(4096, Math.max(r * 2, Math.ceil(r * 25 / Math.max(dt, 0.05)))); } window.reps[key] = r; }
      const t0 = performance.now(); for (let i = 0; i < r; i++) f(); return (performance.now() - t0) / r;
    };
    window.setup = (n, m, kind) => {
      const from = new Int32Array(m), to = new Int32Array(m), w = new Float64Array(m);
      for (let i = 0; i < m; i++) { let a = Math.floor(rnd() * n), c = Math.floor(rnd() * n); if (kind === 'dag') { while (a === c) c = Math.floor(rnd() * n); if (a > c) { const t = a; a = c; c = t; } } from[i] = a; to[i] = c; w[i] = 1 + Math.floor(rnd() * 20) + rnd(); }
      const g = GraphWalk.csr(n, from, to), jobs = {}, same = (x, y) => x.length === y.length && x.every((v, i) => Object.is(v, y[i]));
      let src = 0, br = -1; for (let t = 0; t < 40; t++) { const c0 = t ? Math.floor(rnd() * n) : 0, d0 = GraphWalk.bfs(g, c0); let r0 = 0; for (let i = 0; i < n; i++) if (d0[i] >= 0) r0++; if (r0 > br) { br = r0; src = c0; } }
      jobs.components = () => GraphWalk.components(g); jobs.scc = () => GraphWalk.scc(g); jobs.dijkstra = () => GraphWalk.shortest(g, src, w);
      if (kind === 'dag') jobs.topo = () => GraphWalk.topo(g);
      const res = {};
      for (const job of Object.keys(jobs)) {
        GraphWalk.setBackend('js'); const a = jobs[job](); GraphWalk.setBackend('wasm'); const c = jobs[job]();
        res[job] = Object.keys(a).every((k) => typeof a[k] !== 'object' ? a[k] === c[k] : same(a[k], c[k]));
      }
      window.jobs = jobs; window.reps = {}; return res;
    };
  });
  const cases = [['random 10,000 items, 40,000 links', 10000, 40000, 'rnd'], ['random 100,000 items, 400,000 links', 100000, 400000, 'rnd'], ['sparse 100,000 items, 120,000 links', 100000, 120000, 'rnd'], ['acyclic 100,000 items, 400,000 links', 100000, 400000, 'dag']];
  const rows = [], answers = [];
  for (const [label, n, m, kind] of cases) {
    const same = await p.evaluate((a, c, k) => setup(a, c, k), n, m, kind); answers.push(label + ': ' + JSON.stringify(same));
    for (const job of Object.keys(same)) {
      const ms = await T.rotate(['js', 'wasm'], REPS, (v) => p.evaluate((k) => sample(k), v + ' ' + job));
      rows.push({ set: label, name: job, before: +ms.js.toFixed(3), after: +ms.wasm.toFixed(3) });
    }
  }
  srv.close();
  const g = T.speedGuard(rows);
  console.log(answers.join('\n'));
  console.log(T.table(g.map((r) => Object.assign({}, r, { ratio: r.ratio.toFixed(2) })), [{ key: 'set', title: 'graph', align: 'left' }, { key: 'name', title: 'job', align: 'left' }, { key: 'before', title: 'JS ms' }, { key: 'after', title: 'wasm ms' }, { key: 'ratio', title: 'times faster' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, answers, rows: g }));
  return !answers.some((s) => /false/.test(s));
});
